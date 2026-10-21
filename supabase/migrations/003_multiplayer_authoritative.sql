-- ============================================================
-- MondoGioco — Migrazione 003
-- Multiplayer online autoritativo lato server
-- ============================================================
-- Principi
-- --------
-- 1. Il client NON scrive mai direttamente nelle tabelle di gioco: non esistono
--    policy INSERT/UPDATE/DELETE e i permessi sono revocati. Ogni azione passa
--    da una funzione RPC `security definer` che valida identità, appartenenza,
--    fase, tempi e contenuto della risposta.
-- 2. Le risposte corrette vivono in `app_private.round_keys`, schema non
--    esposto da PostgREST. Vengono restituite solo a round rivelato.
-- 3. I timestamp sono SEMPRE del server (`now()` / `clock_timestamp()`) e sono
--    la fonte di verità per l'avanzamento delle fasi.
-- 4. Ogni transizione di fase avviene dentro una funzione che blocca la riga
--    della stanza (`SELECT ... FOR UPDATE`): due richieste concorrenti non
--    possono avanzare due volte lo stesso round.
--
-- Macchina a stati della stanza (`game_rooms.phase`)
-- --------------------------------------------------
--   lobby ──start_game──▶ round_active ──(tempo scaduto | tutti hanno risposto)──▶ round_reveal
--                              ▲                                                      │
--                              │                                             (tempo scaduto)
--                              └────────── round successivo ◀────────────────────────┤
--                                                                                  │
--                                                                        (ultimo round)
--                                                                                  ▼
--                                                                              finished
--   qualunque fase ──close_room / manutenzione──▶ closed
--
--   * lobby: ingresso consentito, pronto/avvio
--   * round_active: invio risposte consentito fino a `round_ends_at` + grace
--   * round_reveal: risposta corretta visibile, punteggi del round visibili
--   * finished: classifica finale
--   * closed: stanza archiviata (sola lettura, cancellata dopo 24h)
-- ============================================================

-- ------------------------------------------------------------
-- Configurazione (limiti ragionevoli e modificabili lato server)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  min_players INTEGER NOT NULL DEFAULT 2 CHECK (min_players BETWEEN 2 AND 4),
  default_max_players INTEGER NOT NULL DEFAULT 6 CHECK (default_max_players BETWEEN 2 AND 8),
  max_players_limit INTEGER NOT NULL DEFAULT 8 CHECK (max_players_limit BETWEEN 2 AND 8),
  min_rounds INTEGER NOT NULL DEFAULT 3 CHECK (min_rounds BETWEEN 1 AND 10),
  default_rounds INTEGER NOT NULL DEFAULT 8 CHECK (default_rounds BETWEEN 1 AND 20),
  max_rounds INTEGER NOT NULL DEFAULT 15 CHECK (max_rounds BETWEEN 1 AND 20),
  min_round_seconds INTEGER NOT NULL DEFAULT 10 CHECK (min_round_seconds BETWEEN 5 AND 60),
  default_round_seconds INTEGER NOT NULL DEFAULT 25 CHECK (default_round_seconds BETWEEN 5 AND 90),
  max_round_seconds INTEGER NOT NULL DEFAULT 90 CHECK (max_round_seconds BETWEEN 10 AND 180),
  reveal_seconds INTEGER NOT NULL DEFAULT 8 CHECK (reveal_seconds BETWEEN 3 AND 30),
  answer_grace_ms INTEGER NOT NULL DEFAULT 1500 CHECK (answer_grace_ms BETWEEN 0 AND 5000),
  lobby_ttl_seconds INTEGER NOT NULL DEFAULT 1800 CHECK (lobby_ttl_seconds BETWEEN 300 AND 7200),
  room_max_duration_seconds INTEGER NOT NULL DEFAULT 7200 CHECK (room_max_duration_seconds BETWEEN 600 AND 28800),
  reconnect_grace_seconds INTEGER NOT NULL DEFAULT 90 CHECK (reconnect_grace_seconds BETWEEN 10 AND 300),
  host_handover_seconds INTEGER NOT NULL DEFAULT 180 CHECK (host_handover_seconds BETWEEN 15 AND 600),
  empty_room_ttl_seconds INTEGER NOT NULL DEFAULT 120 CHECK (empty_room_ttl_seconds BETWEEN 30 AND 900),
  finished_ttl_seconds INTEGER NOT NULL DEFAULT 3600 CHECK (finished_ttl_seconds BETWEEN 300 AND 86400),
  archived_retention_seconds INTEGER NOT NULL DEFAULT 86400 CHECK (archived_retention_seconds BETWEEN 3600 AND 604800),
  client_poll_ms INTEGER NOT NULL DEFAULT 3000 CHECK (client_poll_ms BETWEEN 1000 AND 15000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT game_settings_players_order CHECK (min_players <= default_max_players AND default_max_players <= max_players_limit),
  CONSTRAINT game_settings_rounds_order CHECK (min_rounds <= default_rounds AND default_rounds <= max_rounds),
  CONSTRAINT game_settings_seconds_order CHECK (min_round_seconds <= default_round_seconds AND default_round_seconds <= max_round_seconds)
);

INSERT INTO public.game_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.game_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_settings_public_read ON public.game_settings;
CREATE POLICY game_settings_public_read ON public.game_settings
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE ALL ON public.game_settings FROM anon, authenticated;
GRANT SELECT ON public.game_settings TO anon, authenticated;

-- ------------------------------------------------------------
-- Banca domande (server-only: mai esposta al client)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.question_bank (
  id TEXT PRIMARY KEY,
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('capital', 'flag', 'continent', 'population')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  prompt TEXT NOT NULL,
  options JSONB NOT NULL CHECK (
    jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 6
  ),
  correct_answer TEXT NOT NULL,
  country_name TEXT NOT NULL,
  country_flag TEXT,
  country_iso TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT question_bank_correct_in_options CHECK (options ? correct_answer)
);

CREATE INDEX IF NOT EXISTS idx_question_bank_type_difficulty
  ON app_private.question_bank (quiz_type, difficulty);

-- ------------------------------------------------------------
-- Vecchie tabelle multiplayer: eliminate (erano interamente scrivibili dal client)
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.room_players CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;

-- ------------------------------------------------------------
-- Stanze
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 40),
  quiz_type TEXT NOT NULL CHECK (quiz_type IN ('capital', 'flag', 'continent', 'population')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  phase TEXT NOT NULL DEFAULT 'lobby'
    CHECK (phase IN ('lobby', 'round_active', 'round_reveal', 'finished', 'closed')),
  max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 8),
  total_rounds INTEGER NOT NULL CHECK (total_rounds BETWEEN 1 AND 20),
  round_seconds INTEGER NOT NULL CHECK (round_seconds BETWEEN 5 AND 180),
  current_round INTEGER NOT NULL DEFAULT 0 CHECK (current_round >= 0),
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lobby_expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  phase_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  round_started_at TIMESTAMPTZ,
  round_ends_at TIMESTAMPTZ,
  reveal_ends_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_reason TEXT CHECK (closed_reason IN (
    'host_closed', 'lobby_expired', 'game_expired', 'abandoned', 'results_expired', 'empty'
  )),
  stats_recorded BOOLEAN NOT NULL DEFAULT false,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT game_rooms_phase_times CHECK (
    (phase = 'lobby' AND current_round = 0)
    OR (phase IN ('round_active', 'round_reveal', 'finished', 'closed') AND current_round >= 1)
    OR (phase = 'closed' AND current_round = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_game_rooms_phase ON public.game_rooms (phase, last_activity_at);
CREATE INDEX IF NOT EXISTS idx_game_rooms_code ON public.game_rooms (code);

-- ------------------------------------------------------------
-- Partecipanti
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_room_members (
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL CHECK (char_length(username) BETWEEN 2 AND 24),
  is_host BOOLEAN NOT NULL DEFAULT false,
  is_ready BOOLEAN NOT NULL DEFAULT false,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 200000),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  answer_count INTEGER NOT NULL DEFAULT 0 CHECK (answer_count >= 0),
  total_response_ms INTEGER NOT NULL DEFAULT 0 CHECK (total_response_ms >= 0),
  connection TEXT NOT NULL DEFAULT 'connected'
    CHECK (connection IN ('connected', 'disconnected', 'left', 'kicked')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_game_room_members_room ON public.game_room_members (room_id, joined_at);

-- ------------------------------------------------------------
-- Round (testo e opzioni pubblici; la soluzione è in app_private.round_keys)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_rounds (
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL CHECK (round_index >= 1),
  quiz_type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  options JSONB NOT NULL CHECK (jsonb_typeof(options) = 'array'),
  country_name TEXT NOT NULL,
  country_flag TEXT,
  country_iso TEXT,
  round_seconds INTEGER NOT NULL CHECK (round_seconds BETWEEN 5 AND 180),
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  revealed_at TIMESTAMPTZ,
  PRIMARY KEY (room_id, round_index)
);

CREATE TABLE IF NOT EXISTS app_private.round_keys (
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL,
  correct_answer TEXT NOT NULL,
  PRIMARY KEY (room_id, round_index),
  FOREIGN KEY (room_id, round_index) REFERENCES public.game_rounds(room_id, round_index) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- Risposte
-- Ognuna è unica per (stanza, round, giocatore): il vincolo è la seconda
-- barriera contro i doppi invii, oltre al lock sulla riga del membro.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL,
  round_index INTEGER NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answer TEXT NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 80),
  is_correct BOOLEAN NOT NULL,
  points INTEGER NOT NULL CHECK (points BETWEEN 0 AND 200),
  response_ms INTEGER NOT NULL CHECK (response_ms BETWEEN 0 AND 300000),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, round_index, user_id),
  FOREIGN KEY (room_id, round_index) REFERENCES public.game_rounds(room_id, round_index) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_answers_room_round ON public.game_answers (room_id, round_index);

-- ------------------------------------------------------------
-- Eventi di partita (feed realtime + audit, sola scrittura server)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.game_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.game_rooms(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 40),
  actor_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_events_room ON public.game_events (room_id, id DESC);

-- ------------------------------------------------------------
-- Helper: appartenenza alla stanza (bypassa RLS: usato dalle policy stesse
-- per evitare ricorsione infinita su game_room_members)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.is_room_member(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.game_room_members m
    WHERE m.room_id = p_room_id
      AND m.user_id = auth.uid()
      AND m.connection IN ('connected', 'disconnected')
  );
$$;

CREATE OR REPLACE FUNCTION app_private.is_room_participant(p_room_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.game_room_members m
    WHERE m.room_id = p_room_id
      AND m.user_id = auth.uid()
      AND m.connection <> 'kicked'
  );
$$;

-- ------------------------------------------------------------
-- Helper: eventi
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.emit_event(
  p_room_id UUID,
  p_type TEXT,
  p_actor UUID,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
  INSERT INTO public.game_events (room_id, event_type, actor_id, payload)
  VALUES (p_room_id, p_type, p_actor, COALESCE(p_payload, '{}'::jsonb));
$$;

-- ------------------------------------------------------------
-- Risultati strutturati per gli errori "attesi"
-- ------------------------------------------------------------
-- Le RPC espresse restituiscono `{ ok: false, error: 'MGxxx:motivo' }` invece di
-- sollevare un'eccezione. Motivo tecnico e di sicurezza: un'eccezione farebbe
-- rollback dell'intera transazione, cancellando anche il contatore di rate
-- limiting appena incrementato. Così i tentativi falliti (es. enumerazione dei
-- codici stanza) vengono realmente contati.
-- Le eccezioni restano riservate agli errori interni (MG5xx), che non devono
-- essere recuperabili dal client.
CREATE OR REPLACE FUNCTION app_private.fail(p_code TEXT, p_detail TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('ok', false, 'error', p_code, 'detail', p_detail);
$$;

-- ------------------------------------------------------------
-- Helper: lettura membro con lock (serializza le azioni dello stesso utente)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.require_member(p_room_id UUID)
RETURNS public.game_room_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_member public.game_room_members;
BEGIN
  SELECT * INTO v_member
  FROM public.game_room_members
  WHERE room_id = p_room_id AND user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MG403:not_a_member' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_member;
END;
$$;

-- ------------------------------------------------------------
-- Helper: attivazione round (timestamp server)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.activate_round(
  p_room_id UUID,
  p_round_index INTEGER,
  p_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_seconds INTEGER;
  v_ends TIMESTAMPTZ;
BEGIN
  SELECT round_seconds INTO v_seconds FROM public.game_rooms WHERE id = p_room_id;

  UPDATE public.game_rounds
  SET started_at = p_now,
      ends_at = p_now + make_interval(secs => v_seconds),
      revealed_at = NULL
  WHERE room_id = p_room_id AND round_index = p_round_index
  RETURNING ends_at INTO v_ends;

  IF v_ends IS NULL THEN
    RAISE EXCEPTION 'MG500:round_missing' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.game_rooms
  SET phase = 'round_active',
      current_round = p_round_index,
      phase_started_at = p_now,
      round_started_at = p_now,
      round_ends_at = v_ends,
      reveal_ends_at = NULL,
      last_activity_at = p_now,
      version = version + 1
  WHERE id = p_room_id;
END;
$$;

-- ------------------------------------------------------------
-- Helper: chiusura stanza
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.close_room_internal(
  p_room_id UUID,
  p_reason TEXT,
  p_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_phase TEXT;
BEGIN
  SELECT phase INTO v_phase FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF v_phase IS NULL OR v_phase = 'closed' THEN
    RETURN;
  END IF;

  UPDATE public.game_rooms
  SET phase = 'closed',
      closed_at = p_now,
      closed_reason = p_reason,
      phase_started_at = p_now,
      last_activity_at = p_now,
      version = version + 1
  WHERE id = p_room_id;

  PERFORM app_private.emit_event(p_room_id, 'room_closed', NULL, jsonb_build_object('reason', p_reason));
END;
$$;

-- ------------------------------------------------------------
-- Helper: registrazione risultati finali (una sola volta per stanza)
-- La classifica è calcolata qui, mai dal client.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.record_multiplayer_results(
  p_room_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_room public.game_rooms;
  v_winner_score INTEGER;
  v_member RECORD;
  v_xp INTEGER;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.stats_recorded THEN
    RETURN;
  END IF;

  SELECT max(score) INTO v_winner_score
  FROM public.game_room_members
  WHERE room_id = p_room_id AND connection <> 'kicked';

  FOR v_member IN
    SELECT user_id, score, correct_count
    FROM public.game_room_members
    WHERE room_id = p_room_id AND connection <> 'kicked'
  LOOP
    v_xp := greatest(25, floor(v_member.score / 10)::int + 25 + v_member.correct_count * 10);

    INSERT INTO app_private.profile_private (user_id)
    VALUES (v_member.user_id)
    ON CONFLICT (user_id) DO NOTHING;

    UPDATE app_private.profile_private
    SET total_score = LEAST(total_score + v_member.score, 100000000),
        games_played = games_played + 1,
        games_won = games_won + CASE WHEN v_member.score > 0 AND v_member.score = v_winner_score THEN 1 ELSE 0 END,
        xp = xp + v_xp,
        updated_at = p_now
    WHERE user_id = v_member.user_id;

    UPDATE public.profiles p
    SET level = app_private.level_from_xp(pr.xp),
        updated_at = p_now
    FROM app_private.profile_private pr
    WHERE p.id = pr.user_id AND pr.user_id = v_member.user_id;

    INSERT INTO app_private.profile_sessions
      (user_id, mode, difficulty, score, rounds, correct_answers, xp_earned, ended_at)
    VALUES
      (v_member.user_id, 'multiplayer_' || v_room.quiz_type, v_room.difficulty,
       LEAST(v_member.score, 100000), LEAST(v_room.total_rounds, 100),
       LEAST(v_member.correct_count, v_room.total_rounds), v_xp, p_now);
  END LOOP;

  UPDATE public.game_rooms SET stats_recorded = true WHERE id = p_room_id;
END;
$$;

-- ------------------------------------------------------------
-- Helper: avanzamento fasi basato sui timestamp del server
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.advance_room(
  p_room_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_room public.game_rooms;
  v_settings public.game_settings;
  v_connected INTEGER;
  v_pending INTEGER;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.phase = 'closed' THEN
    RETURN;
  END IF;

  SELECT * INTO v_settings FROM public.game_settings WHERE id = 1;

  IF v_room.phase = 'lobby' THEN
    IF p_now >= v_room.lobby_expires_at THEN
      PERFORM app_private.close_room_internal(p_room_id, 'lobby_expired', p_now);
    END IF;
    RETURN;
  END IF;

  IF v_room.phase = 'round_active' THEN
    SELECT count(*) INTO v_connected
    FROM public.game_room_members
    WHERE room_id = p_room_id AND connection = 'connected';

    SELECT count(*) INTO v_pending
    FROM public.game_room_members m
    WHERE m.room_id = p_room_id
      AND m.connection = 'connected'
      AND NOT EXISTS (
        SELECT 1 FROM public.game_answers a
        WHERE a.room_id = m.room_id
          AND a.round_index = v_room.current_round
          AND a.user_id = m.user_id
      );

    IF p_now >= v_room.round_ends_at + make_interval(secs => v_settings.answer_grace_ms::double precision / 1000.0)
       OR (v_connected > 0 AND v_pending = 0) THEN
      UPDATE public.game_rounds
      SET revealed_at = p_now
      WHERE room_id = p_room_id AND round_index = v_room.current_round;

      UPDATE public.game_rooms
      SET phase = 'round_reveal',
          phase_started_at = p_now,
          reveal_ends_at = p_now + make_interval(secs => v_settings.reveal_seconds),
          last_activity_at = p_now,
          version = version + 1
      WHERE id = p_room_id;

      PERFORM app_private.emit_event(
        p_room_id, 'round_revealed', NULL,
        jsonb_build_object('round_index', v_room.current_round)
      );
    END IF;
    RETURN;
  END IF;

  IF v_room.phase = 'round_reveal' THEN
    IF p_now >= v_room.reveal_ends_at THEN
      IF v_room.current_round >= v_room.total_rounds THEN
        UPDATE public.game_rooms
        SET phase = 'finished',
            phase_started_at = p_now,
            finished_at = p_now,
            last_activity_at = p_now,
            version = version + 1
        WHERE id = p_room_id;

        PERFORM app_private.record_multiplayer_results(p_room_id, p_now);
        PERFORM app_private.emit_event(p_room_id, 'game_finished', NULL, jsonb_build_object('rounds', v_room.total_rounds));
      ELSE
        PERFORM app_private.activate_round(p_room_id, v_room.current_round + 1, p_now);
        PERFORM app_private.emit_event(
          p_room_id, 'round_started', NULL,
          jsonb_build_object('round_index', v_room.current_round + 1)
        );
      END IF;
    END IF;
    RETURN;
  END IF;

  IF v_room.phase = 'finished' THEN
    IF p_now >= v_room.finished_at + make_interval(secs => v_settings.finished_ttl_seconds) THEN
      PERFORM app_private.close_room_internal(p_room_id, 'results_expired', p_now);
    END IF;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Helper: passaggio di host quando l'host sparisce
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.ensure_host(
  p_room_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_room public.game_rooms;
  v_settings public.game_settings;
  v_new_host UUID;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.phase = 'closed' THEN
    RETURN;
  END IF;

  SELECT * INTO v_settings FROM public.game_settings WHERE id = 1;

  IF EXISTS (
    SELECT 1 FROM public.game_room_members m
    WHERE m.room_id = p_room_id
      AND m.user_id = v_room.host_id
      AND m.connection = 'connected'
      AND m.last_seen_at >= p_now - make_interval(secs => v_settings.host_handover_seconds)
  ) THEN
    RETURN;
  END IF;

  SELECT m.user_id INTO v_new_host
  FROM public.game_room_members m
  WHERE m.room_id = p_room_id
    AND m.connection = 'connected'
    AND m.user_id <> v_room.host_id
  ORDER BY m.joined_at ASC
  LIMIT 1;

  IF v_new_host IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.game_room_members SET is_host = false WHERE room_id = p_room_id AND is_host = true;
  UPDATE public.game_room_members SET is_host = true WHERE room_id = p_room_id AND user_id = v_new_host;
  UPDATE public.game_rooms
  SET host_id = v_new_host, version = version + 1, last_activity_at = p_now
  WHERE id = p_room_id;

  PERFORM app_private.emit_event(
    p_room_id, 'host_changed', v_new_host,
    jsonb_build_object('previous_host_id', v_room.host_id)
  );
END;
$$;

-- ------------------------------------------------------------
-- Snapshot completo della stanza
-- Restituisce SOLO ciò che il chiamante può vedere in quella fase.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.build_room_snapshot(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_room public.game_rooms;
  v_me public.game_room_members;
  v_settings public.game_settings;
  v_players JSONB;
  v_standings JSONB;
  v_round JSONB;
  v_reveal JSONB;
BEGIN
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_settings FROM public.game_settings WHERE id = 1;
  SELECT * INTO v_me
  FROM public.game_room_members
  WHERE room_id = p_room_id AND user_id = auth.uid();

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', m.user_id,
    'username', m.username,
    'is_host', m.is_host,
    'is_ready', m.is_ready,
    'score', CASE WHEN v_room.phase = 'round_active' THEN
      m.score - COALESCE((
        SELECT sum(a.points) FROM public.game_answers a
        WHERE a.room_id = m.room_id
          AND a.round_index = v_room.current_round
          AND a.user_id = m.user_id
      ), 0)
    ELSE m.score END,
    'correct_count', m.correct_count,
    'answer_count', m.answer_count,
    'connection', m.connection,
    'last_seen_at', m.last_seen_at
  ) ORDER BY m.joined_at), '[]'::jsonb)
  INTO v_players
  FROM public.game_room_members m
  WHERE m.room_id = p_room_id AND m.connection <> 'left';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', x.user_id,
    'username', x.username,
    'score', x.score,
    'correct_count', x.correct_count,
    'rank', x.rank,
    'is_host', x.is_host
  ) ORDER BY x.rank), '[]'::jsonb)
  INTO v_standings
  FROM (
    SELECT m.user_id, m.username,
           CASE WHEN v_room.phase = 'round_active' THEN
             m.score - COALESCE((
               SELECT sum(a.points) FROM public.game_answers a
               WHERE a.room_id = m.room_id
                 AND a.round_index = v_room.current_round
                 AND a.user_id = m.user_id
             ), 0)
           ELSE m.score END AS score,
           m.correct_count, m.is_host, m.joined_at,
           row_number() OVER (ORDER BY m.score DESC, m.correct_count DESC, m.joined_at ASC) AS rank
    FROM public.game_room_members m
    WHERE m.room_id = p_room_id AND m.connection <> 'kicked'
  ) x;

  IF v_room.phase IN ('round_active', 'round_reveal', 'finished') THEN
    SELECT jsonb_build_object(
      'index', r.round_index,
      'quiz_type', r.quiz_type,
      'prompt', r.prompt,
      'options', r.options,
      'country_name', r.country_name,
      'country_flag', r.country_flag,
      'country_iso', r.country_iso,
      'started_at', r.started_at,
      'ends_at', r.ends_at,
      'answered_count', (
        SELECT count(*) FROM public.game_answers a
        WHERE a.room_id = r.room_id AND a.round_index = r.round_index
      ),
      'connected_count', (
        SELECT count(*) FROM public.game_room_members m
        WHERE m.room_id = r.room_id AND m.connection = 'connected'
      )
    )
    INTO v_round
    FROM public.game_rounds r
    WHERE r.room_id = p_room_id AND r.round_index = v_room.current_round;
  END IF;

  IF v_room.phase IN ('round_reveal', 'finished') THEN
    SELECT jsonb_build_object(
      'round_index', r.round_index,
      'correct_answer', k.correct_answer,
      'revealed_at', r.revealed_at,
      'ends_at', v_room.reveal_ends_at,
      'results', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'user_id', a.user_id,
          'username', m.username,
          'answer', a.answer,
          'is_correct', a.is_correct,
          'points', a.points,
          'response_ms', a.response_ms
        ) ORDER BY a.points DESC, a.response_ms ASC)
        FROM public.game_answers a
        JOIN public.game_room_members m
          ON m.room_id = a.room_id AND m.user_id = a.user_id
        WHERE a.room_id = p_room_id AND a.round_index = v_room.current_round
      ), '[]'::jsonb)
    )
    INTO v_reveal
    FROM public.game_rounds r
    JOIN app_private.round_keys k
      ON k.room_id = r.room_id AND k.round_index = r.round_index
    WHERE r.room_id = p_room_id AND r.round_index = v_room.current_round;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'server_time', now(),
    'room', jsonb_build_object(
      'id', v_room.id,
      'code', v_room.code,
      'name', v_room.name,
      'host_id', v_room.host_id,
      'quiz_type', v_room.quiz_type,
      'difficulty', v_room.difficulty,
      'phase', v_room.phase,
      'max_players', v_room.max_players,
      'total_rounds', v_room.total_rounds,
      'round_seconds', v_room.round_seconds,
      'current_round', v_room.current_round,
      'created_at', v_room.created_at,
      'lobby_expires_at', v_room.lobby_expires_at,
      'started_at', v_room.started_at,
      'phase_started_at', v_room.phase_started_at,
      'round_started_at', v_room.round_started_at,
      'round_ends_at', v_room.round_ends_at,
      'reveal_ends_at', v_room.reveal_ends_at,
      'finished_at', v_room.finished_at,
      'closed_at', v_room.closed_at,
      'closed_reason', v_room.closed_reason,
      'version', v_room.version
    ),
    'me', CASE WHEN v_me.user_id IS NULL THEN NULL ELSE jsonb_build_object(
      'user_id', v_me.user_id,
      'username', v_me.username,
      'is_host', v_me.is_host,
      'is_ready', v_me.is_ready,
      'score', CASE WHEN v_room.phase = 'round_active' THEN
        v_me.score - COALESCE((
          SELECT sum(a.points) FROM public.game_answers a
          WHERE a.room_id = p_room_id
            AND a.round_index = v_room.current_round
            AND a.user_id = v_me.user_id
        ), 0)
      ELSE v_me.score END,
      'correct_count', v_me.correct_count,
      'answer_count', v_me.answer_count,
      'connection', v_me.connection,
      'answered_current_round', EXISTS (
        SELECT 1 FROM public.game_answers a
        WHERE a.room_id = p_room_id
          AND a.round_index = v_room.current_round
          AND a.user_id = v_me.user_id
      )
    ) END,
    'players', v_players,
    'standings', v_standings,
    'round', v_round,
    'reveal', v_reveal,
    'settings', jsonb_build_object(
      'client_poll_ms', v_settings.client_poll_ms,
      'reveal_seconds', v_settings.reveal_seconds,
      'answer_grace_ms', v_settings.answer_grace_ms,
      'reconnect_grace_seconds', v_settings.reconnect_grace_seconds,
      'host_handover_seconds', v_settings.host_handover_seconds,
      'min_players', v_settings.min_players,
      'max_players_limit', v_settings.max_players_limit,
      'min_rounds', v_settings.min_rounds,
      'max_rounds', v_settings.max_rounds,
      'min_round_seconds', v_settings.min_round_seconds,
      'max_round_seconds', v_settings.max_round_seconds
    )
  );
END;
$$;

-- ------------------------------------------------------------
-- RLS: il client legge solo stanza/partecipanti di cui fa parte e mai
-- le risposte corrette prima della rivelazione.
-- ------------------------------------------------------------
ALTER TABLE public.game_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS game_rooms_member_read ON public.game_rooms;
CREATE POLICY game_rooms_member_read ON public.game_rooms
  FOR SELECT TO authenticated
  USING (app_private.is_room_member(id));

DROP POLICY IF EXISTS game_room_members_member_read ON public.game_room_members;
CREATE POLICY game_room_members_member_read ON public.game_room_members
  FOR SELECT TO authenticated
  USING (app_private.is_room_member(room_id));

DROP POLICY IF EXISTS game_rounds_member_read ON public.game_rounds;
CREATE POLICY game_rounds_member_read ON public.game_rounds
  FOR SELECT TO authenticated
  USING (
    app_private.is_room_member(room_id)
    AND round_index <= (SELECT r.current_round FROM public.game_rooms r WHERE r.id = room_id)
  );

DROP POLICY IF EXISTS game_answers_member_read ON public.game_answers;
CREATE POLICY game_answers_member_read ON public.game_answers
  FOR SELECT TO authenticated
  USING (
    app_private.is_room_member(room_id)
    AND EXISTS (
      SELECT 1 FROM public.game_rounds r
      WHERE r.room_id = game_answers.room_id
        AND r.round_index = game_answers.round_index
        AND r.revealed_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS game_events_member_read ON public.game_events;
CREATE POLICY game_events_member_read ON public.game_events
  FOR SELECT TO authenticated
  USING (app_private.is_room_participant(room_id));

-- Nessuna policy di scrittura: tutte le scritture passano dalle RPC.
REVOKE ALL ON public.game_rooms FROM anon, authenticated;
REVOKE ALL ON public.game_room_members FROM anon, authenticated;
REVOKE ALL ON public.game_rounds FROM anon, authenticated;
REVOKE ALL ON public.game_answers FROM anon, authenticated;
REVOKE ALL ON public.game_events FROM anon, authenticated;

GRANT SELECT ON public.game_rooms TO authenticated;
GRANT SELECT ON public.game_room_members TO authenticated;
GRANT SELECT ON public.game_rounds TO authenticated;
GRANT SELECT ON public.game_answers TO authenticated;
GRANT SELECT ON public.game_events TO authenticated;

-- ------------------------------------------------------------
-- RPC: orario del server (per calcolare l'offset di clock del client)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.server_time()
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
AS $$
  SELECT now();
$$;

-- ------------------------------------------------------------
-- RPC: crea stanza
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.generate_room_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_room(
  p_name TEXT,
  p_quiz_type TEXT,
  p_difficulty TEXT,
  p_total_rounds INTEGER DEFAULT NULL,
  p_max_players INTEGER DEFAULT NULL,
  p_round_seconds INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_settings public.game_settings;
  v_name TEXT;
  v_code TEXT;
  v_username TEXT;
  v_attempt INTEGER := 0;
  v_room public.game_rooms;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('create_room');

  SELECT * INTO v_settings FROM public.game_settings WHERE id = 1;

  v_name := btrim(regexp_replace(COALESCE(p_name, ''), '[\x00-\x1F\x7F]', '', 'g'));
  IF char_length(v_name) < 3 OR char_length(v_name) > 40 THEN
    RETURN app_private.fail('MG400:invalid_room_name');
  END IF;
  IF p_quiz_type IS NULL OR p_quiz_type NOT IN ('capital', 'flag', 'continent', 'population') THEN
    RETURN app_private.fail('MG400:invalid_quiz_type');
  END IF;
  IF p_difficulty IS NULL OR p_difficulty NOT IN ('easy', 'medium', 'hard') THEN
    RETURN app_private.fail('MG400:invalid_difficulty');
  END IF;
  IF p_total_rounds IS NULL THEN
    p_total_rounds := v_settings.default_rounds;
  END IF;
  IF p_total_rounds < v_settings.min_rounds OR p_total_rounds > v_settings.max_rounds THEN
    RETURN app_private.fail('MG400:invalid_round_count');
  END IF;
  IF p_max_players IS NULL THEN
    p_max_players := v_settings.default_max_players;
  END IF;
  IF p_max_players < v_settings.min_players OR p_max_players > v_settings.max_players_limit THEN
    RETURN app_private.fail('MG400:invalid_max_players');
  END IF;
  IF p_round_seconds IS NULL THEN
    p_round_seconds := v_settings.default_round_seconds;
  END IF;
  IF p_round_seconds < v_settings.min_round_seconds OR p_round_seconds > v_settings.max_round_seconds THEN
    RETURN app_private.fail('MG400:invalid_round_duration');
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  IF v_username IS NULL THEN
    RETURN app_private.fail('MG403:profile_missing');
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := app_private.generate_room_code();
    BEGIN
      INSERT INTO public.game_rooms (
        code, host_id, name, quiz_type, difficulty, max_players, total_rounds,
        round_seconds, lobby_expires_at
      )
      VALUES (
        v_code, v_uid, v_name, p_quiz_type, p_difficulty, p_max_players, p_total_rounds,
        p_round_seconds, now() + make_interval(secs => v_settings.lobby_ttl_seconds)
      )
      RETURNING * INTO v_room;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 6 THEN
        RETURN app_private.fail('MG500:code_generation_failed');
      END IF;
    END;
  END LOOP;

  INSERT INTO public.game_room_members (room_id, user_id, username, is_host, is_ready, connection)
  VALUES (v_room.id, v_uid, v_username, true, true, 'connected');

  PERFORM app_private.emit_event(
    v_room.id, 'room_created', v_uid,
    jsonb_build_object('room_name', v_room.name, 'quiz_type', v_room.quiz_type)
  );

  RETURN app_private.build_room_snapshot(v_room.id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: ingresso tramite codice (o rientro se già membri)
-- Errori generici: non rivelano se un codice esiste ma è pieno/chiuso.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_room(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_code TEXT;
  v_room public.game_rooms;
  v_member public.game_room_members;
  v_username TEXT;
  v_count INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('join_room');

  v_code := upper(btrim(COALESCE(p_code, '')));
  IF v_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;

  SELECT * INTO v_room FROM public.game_rooms WHERE code = v_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;

  SELECT * INTO v_member
  FROM public.game_room_members
  WHERE room_id = v_room.id AND user_id = v_uid
  FOR UPDATE;

  IF FOUND THEN
    -- Un membro che riapre il link d'invito rientra nella propria partita
    -- (anche a partita avviata o conclusa), mantenendo punteggio e round.
    IF v_member.connection = 'kicked' THEN
      RETURN app_private.fail('MG403:not_allowed');
    END IF;
    IF v_member.connection = 'left' AND v_room.phase <> 'lobby' THEN
      RETURN app_private.fail('MG403:not_a_member');
    END IF;

    IF v_room.phase <> 'closed' THEN
      UPDATE public.game_room_members
      SET connection = 'connected',
          last_seen_at = now(),
          disconnected_at = NULL,
          left_at = NULL
      WHERE room_id = v_room.id AND user_id = v_uid;

      IF v_member.connection IN ('disconnected', 'left') THEN
        PERFORM app_private.emit_event(v_room.id, 'member_reconnected', v_uid, '{}'::jsonb);
      END IF;
    END IF;
  ELSE
    IF v_room.phase <> 'lobby' THEN
      -- Errore volutamente identico a "codice inesistente": non conferma che
      -- la stanza esista a chi non ne è membro.
      RETURN app_private.fail('MG404:room_not_found');
    END IF;

    SELECT count(*) INTO v_count
    FROM public.game_room_members
    WHERE room_id = v_room.id AND connection IN ('connected', 'disconnected');

    IF v_count >= v_room.max_players THEN
      RETURN app_private.fail('MG409:room_full');
    END IF;

    SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
    IF v_username IS NULL THEN
      RETURN app_private.fail('MG403:profile_missing');
    END IF;

    INSERT INTO public.game_room_members (room_id, user_id, username, is_host, is_ready, connection)
    VALUES (v_room.id, v_uid, v_username, false, false, 'connected');

    PERFORM app_private.emit_event(v_room.id, 'member_joined', v_uid, jsonb_build_object('username', v_username));
  END IF;

  IF v_room.phase <> 'closed' THEN
    UPDATE public.game_rooms
    SET last_activity_at = now(), version = version + 1
    WHERE id = v_room.id;

    PERFORM app_private.advance_room(v_room.id, now());
  END IF;

  RETURN app_private.build_room_snapshot(v_room.id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: riconnessione (per id stanza, usata al riavvio del client)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconnect_room(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.game_rooms;
  v_member public.game_room_members;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('reconnect_room');

  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;

  SELECT * INTO v_member
  FROM public.game_room_members
  WHERE room_id = p_room_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND OR v_member.connection = 'kicked' THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;
  IF v_member.connection = 'left' AND v_room.phase <> 'lobby' THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;

  IF v_room.phase <> 'closed' THEN
    UPDATE public.game_room_members
    SET connection = 'connected',
        last_seen_at = now(),
        disconnected_at = NULL,
        left_at = NULL
    WHERE room_id = p_room_id AND user_id = v_uid;

    PERFORM app_private.ensure_host(p_room_id, now());
    PERFORM app_private.advance_room(p_room_id, now());
  END IF;

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: heartbeat + sincronizzazione
-- Unisce "sono vivo", "aggiorna stato connessione" e "avanza le fasi".
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.heartbeat(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.game_rooms;
  v_member public.game_room_members;
  v_settings public.game_settings;
  v_became_connected BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('heartbeat');

  -- Ordine di lock coerente con submit_answer: prima la stanza, poi il membro.
  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;

  SELECT * INTO v_member
  FROM public.game_room_members
  WHERE room_id = p_room_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND OR v_member.connection IN ('kicked', 'left') THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;

  v_became_connected := v_member.connection = 'disconnected';

  UPDATE public.game_room_members
  SET connection = 'connected',
      last_seen_at = now(),
      disconnected_at = NULL
  WHERE room_id = p_room_id AND user_id = v_uid;

  IF v_became_connected THEN
    PERFORM app_private.emit_event(p_room_id, 'member_reconnected', v_uid, '{}'::jsonb);
  END IF;

  UPDATE public.game_rooms
  SET last_activity_at = now()
  WHERE id = p_room_id AND phase <> 'closed';

  SELECT * INTO v_settings FROM public.game_settings WHERE id = 1;

  -- Marca come disconnessi i membri silenti (solo durante una partita attiva:
  -- in lobby un giocatore può restare fermo senza essere considerato offline).
  IF v_room.phase IN ('round_active', 'round_reveal') THEN
    UPDATE public.game_room_members
    SET connection = 'disconnected', disconnected_at = now()
    WHERE room_id = p_room_id
      AND connection = 'connected'
      AND user_id <> v_uid
      AND last_seen_at < now() - make_interval(secs => v_settings.reconnect_grace_seconds);
  END IF;

  PERFORM app_private.ensure_host(p_room_id, now());
  PERFORM app_private.advance_room(p_room_id, now());

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: sincronizzazione (identica a heartbeat, senza marcare presenze)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_room(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('sync_room');

  IF NOT app_private.is_room_member(p_room_id) THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;

  PERFORM app_private.ensure_host(p_room_id, now());
  PERFORM app_private.advance_room(p_room_id, now());

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: stato stanza (sola lettura, senza avanzamento)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_room_state(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  IF NOT app_private.is_room_member(p_room_id) THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: pronto / non pronto (solo lobby)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_ready(p_room_id UUID, p_ready BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.game_rooms;
  v_member public.game_room_members;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('set_ready');

  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;
  IF v_room.phase <> 'lobby' THEN
    RETURN app_private.fail('MG409:game_already_started');
  END IF;

  IF NOT app_private.is_room_member(p_room_id) THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;

  v_member := app_private.require_member(p_room_id);
  IF v_member.connection = 'kicked' THEN
    RETURN app_private.fail('MG403:not_allowed');
  END IF;

  UPDATE public.game_room_members
  SET is_ready = COALESCE(p_ready, false)
  WHERE room_id = p_room_id AND user_id = v_uid;

  UPDATE public.game_rooms
  SET last_activity_at = now(), version = version + 1
  WHERE id = p_room_id;

  PERFORM app_private.emit_event(
    p_room_id, 'ready_changed', v_uid,
    jsonb_build_object('is_ready', COALESCE(p_ready, false))
  );

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: avvio partita (solo host, solo lobby, tutti pronti)
-- Le domande vengono estratte e le soluzioni restano server-side.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_game(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.game_rooms;
  v_member public.game_room_members;
  v_ready INTEGER;
  v_connected INTEGER;
  v_min INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('start_game');

  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;
  IF v_room.phase = 'closed' THEN
    RETURN app_private.fail('MG409:room_closed');
  END IF;
  IF v_room.phase <> 'lobby' THEN
    RETURN app_private.fail('MG409:game_already_started');
  END IF;
  IF v_room.host_id <> v_uid THEN
    RETURN app_private.fail('MG403:host_only');
  END IF;

  IF NOT app_private.is_room_member(p_room_id) THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;

  v_member := app_private.require_member(p_room_id);
  IF v_member.connection <> 'connected' THEN
    RETURN app_private.fail('MG409:not_connected');
  END IF;

  SELECT min_players INTO v_min FROM public.game_settings WHERE id = 1;

  SELECT count(*) INTO v_connected
  FROM public.game_room_members
  WHERE room_id = p_room_id AND connection = 'connected';

  SELECT count(*) INTO v_ready
  FROM public.game_room_members
  WHERE room_id = p_room_id AND connection = 'connected' AND is_ready = true;

  IF v_connected < v_min::integer THEN
    RETURN app_private.fail('MG409:not_enough_players');
  END IF;
  IF v_ready <> v_connected THEN
    RETURN app_private.fail('MG409:players_not_ready');
  END IF;

  IF EXISTS (SELECT 1 FROM public.game_rounds WHERE room_id = p_room_id) THEN
    RETURN app_private.fail('MG409:game_already_started');
  END IF;

  WITH shuffled AS MATERIALIZED (
    SELECT q.*, row_number() OVER (ORDER BY random()) AS rn
    FROM app_private.question_bank q
    WHERE q.quiz_type = v_room.quiz_type
  ), picked AS MATERIALIZED (
    SELECT * FROM shuffled
    ORDER BY (difficulty = v_room.difficulty) DESC, rn
    LIMIT v_room.total_rounds
  ), numbered AS MATERIALIZED (
    SELECT p.*, row_number() OVER () AS round_index FROM picked p
  ), inserted AS (
    INSERT INTO public.game_rounds (
      room_id, round_index, quiz_type, prompt, options, country_name,
      country_flag, country_iso, round_seconds
    )
    SELECT p_room_id, n.round_index, n.quiz_type, n.prompt, n.options, n.country_name,
           n.country_flag, n.country_iso, v_room.round_seconds
    FROM numbered n
    RETURNING round_index
  )
  INSERT INTO app_private.round_keys (room_id, round_index, correct_answer)
  SELECT p_room_id, i.round_index, n.correct_answer
  FROM inserted i
  JOIN numbered n ON n.round_index = i.round_index
  ON CONFLICT (room_id, round_index) DO NOTHING;

  IF (SELECT count(*) FROM app_private.round_keys WHERE room_id = p_room_id) <> v_room.total_rounds THEN
    RETURN app_private.fail('MG500:round_generation_failed');
  END IF;

  -- Azzeramento punteggi: si parte sempre da zero, deciso dal server.
  UPDATE public.game_room_members
  SET score = 0, correct_count = 0, answer_count = 0, total_response_ms = 0
  WHERE room_id = p_room_id;

  UPDATE public.game_rooms
  SET started_at = now(),
      version = version + 1,
      last_activity_at = now()
  WHERE id = p_room_id;

  PERFORM app_private.activate_round(p_room_id, 1, now());

  PERFORM app_private.emit_event(
    p_room_id, 'game_started', v_uid,
    jsonb_build_object('total_rounds', v_room.total_rounds, 'round_seconds', v_room.round_seconds)
  );

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: invio risposta (validazione completa lato server)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_answer(
  p_room_id UUID,
  p_round_index INTEGER,
  p_answer TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.game_rooms;
  v_member public.game_room_members;
  v_round public.game_rounds;
  v_settings public.game_settings;
  v_correct_answer TEXT;
  v_correct BOOLEAN;
  v_response_ms INTEGER;
  v_bonus INTEGER;
  v_points INTEGER;
  v_answer TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('submit_answer');

  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;

  IF NOT app_private.is_room_member(p_room_id) THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;

  v_member := app_private.require_member(p_room_id);
  IF v_member.connection <> 'connected' THEN
    RETURN app_private.fail('MG409:not_connected');
  END IF;

  IF v_room.phase <> 'round_active' THEN
    RETURN app_private.fail('MG409:round_not_active');
  END IF;
  IF p_round_index IS NULL OR p_round_index <> v_room.current_round THEN
    RETURN app_private.fail('MG409:wrong_round');
  END IF;

  SELECT * INTO v_settings FROM public.game_settings WHERE id = 1;
  IF now() > v_room.round_ends_at + make_interval(secs => v_settings.answer_grace_ms::double precision / 1000.0) THEN
    RETURN app_private.fail('MG409:round_closed');
  END IF;

  SELECT * INTO v_round
  FROM public.game_rounds
  WHERE room_id = p_room_id AND round_index = p_round_index;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG500:round_missing');
  END IF;

  v_answer := btrim(COALESCE(p_answer, ''));
  IF char_length(v_answer) < 1 OR char_length(v_answer) > 80
     OR NOT (v_round.options ? v_answer) THEN
    RETURN app_private.fail('MG400:invalid_answer');
  END IF;

  SELECT correct_answer INTO v_correct_answer
  FROM app_private.round_keys
  WHERE room_id = p_room_id AND round_index = p_round_index;

  IF v_correct_answer IS NULL THEN
    RETURN app_private.fail('MG500:answer_key_missing');
  END IF;

  v_correct := v_answer = v_correct_answer;

  v_response_ms := GREATEST(
    0,
    LEAST(
      v_room.round_seconds * 1000,
      floor(extract(epoch FROM (clock_timestamp() - v_round.started_at)) * 1000)::integer
    )
  );

  v_bonus := GREATEST(
    0,
    floor((1 - (v_response_ms::numeric / (v_room.round_seconds * 1000))) * 100)::integer
  );
  v_points := CASE WHEN v_correct THEN 100 + v_bonus ELSE 0 END;

  BEGIN
    INSERT INTO public.game_answers (
      room_id, round_index, user_id, answer, is_correct, points, response_ms
    )
    VALUES (p_room_id, p_round_index, v_uid, v_answer, v_correct, v_points, v_response_ms);
  EXCEPTION WHEN unique_violation THEN
    RETURN app_private.fail('MG409:duplicate_answer');
  END;

  UPDATE public.game_room_members
  SET score = score + v_points,
      correct_count = correct_count + CASE WHEN v_correct THEN 1 ELSE 0 END,
      answer_count = answer_count + 1,
      total_response_ms = total_response_ms + v_response_ms,
      last_seen_at = now()
  WHERE room_id = p_room_id AND user_id = v_uid;

  UPDATE public.game_rooms
  SET last_activity_at = now(), version = version + 1
  WHERE id = p_room_id;

  -- L'evento non contiene né la risposta corretta né l'esito delle risposte.
  PERFORM app_private.emit_event(
    p_room_id, 'answer_submitted', v_uid,
    jsonb_build_object(
      'round_index', p_round_index,
      'answer_count', (
        SELECT count(*) FROM public.game_answers
        WHERE room_id = p_room_id AND round_index = p_round_index
      )
    )
  );

  PERFORM app_private.advance_room(p_room_id, now());

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: esci dalla stanza
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_room(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.game_rooms;
  v_member public.game_room_members;
  v_connected INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('leave_room');

  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;

  SELECT * INTO v_member
  FROM public.game_room_members
  WHERE room_id = p_room_id AND user_id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;

  UPDATE public.game_room_members
  SET connection = 'left',
      is_ready = false,
      left_at = now(),
      is_host = false
  WHERE room_id = p_room_id AND user_id = v_uid;

  PERFORM app_private.emit_event(p_room_id, 'member_left', v_uid, '{}'::jsonb);

  IF v_room.host_id = v_uid THEN
    PERFORM app_private.ensure_host(p_room_id, now() + make_interval(secs => 3600));
  END IF;

  SELECT count(*) INTO v_connected
  FROM public.game_room_members
  WHERE room_id = p_room_id AND connection = 'connected';

  IF v_connected = 0 THEN
    PERFORM app_private.close_room_internal(p_room_id, 'empty', now());
  ELSE
    UPDATE public.game_rooms
    SET last_activity_at = now(), version = version + 1
    WHERE id = p_room_id;
  END IF;

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: espelli un giocatore (host, solo lobby)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kick_member(p_room_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.game_rooms;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('kick_member');

  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;
  IF v_room.host_id <> v_uid THEN
    RETURN app_private.fail('MG403:host_only');
  END IF;
  IF v_room.phase <> 'lobby' THEN
    RETURN app_private.fail('MG409:game_already_started');
  END IF;
  IF p_user_id = v_uid THEN
    RETURN app_private.fail('MG400:cannot_kick_self');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.game_room_members
    WHERE room_id = p_room_id AND user_id = p_user_id
  ) THEN
    RETURN app_private.fail('MG404:member_not_found');
  END IF;

  UPDATE public.game_room_members
  SET connection = 'kicked', is_ready = false, is_host = false
  WHERE room_id = p_room_id AND user_id = p_user_id;

  UPDATE public.game_rooms
  SET last_activity_at = now(), version = version + 1
  WHERE id = p_room_id;

  PERFORM app_private.emit_event(p_room_id, 'member_kicked', v_uid, jsonb_build_object('user_id', p_user_id));

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: chiudi stanza (solo host)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_room(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_room public.game_rooms;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('close_room');

  SELECT * INTO v_room FROM public.game_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN app_private.fail('MG404:room_not_found');
  END IF;

  IF v_room.host_id <> v_uid THEN
    RETURN app_private.fail('MG403:host_only');
  END IF;

  IF v_room.phase <> 'closed' THEN
    PERFORM app_private.advance_room(p_room_id, now());
    PERFORM app_private.close_room_internal(p_room_id, 'host_closed', now());
  END IF;

  RETURN app_private.build_room_snapshot(p_room_id);
END;
$$;

-- ------------------------------------------------------------
-- RPC: manutenzione (stanze abbandonate, host assente, pulizia)
-- Può essere chiamata da qualsiasi utente autenticato, oppure da pg_cron
-- con il ruolo service_role. È idempotente.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maintenance_tick()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_settings public.game_settings;
  v_room public.game_rooms;
  v_processed INTEGER := 0;
  v_closed INTEGER := 0;
  v_purged INTEGER := 0;
  v_connected INTEGER;
BEGIN
  IF v_uid IS NOT NULL THEN
    PERFORM app_private.enforce_rate('maintenance_tick');
  ELSIF auth.role() IS DISTINCT FROM 'service_role' THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  SELECT * INTO v_settings FROM public.game_settings WHERE id = 1;

  FOR v_room IN
    SELECT * FROM public.game_rooms
    WHERE phase <> 'closed'
      AND (
        (phase = 'lobby' AND lobby_expires_at <= now())
        OR (phase IN ('round_active', 'round_reveal')
            AND started_at IS NOT NULL
            AND started_at < now() - make_interval(secs => v_settings.room_max_duration_seconds))
        OR (phase = 'finished'
            AND finished_at < now() - make_interval(secs => v_settings.finished_ttl_seconds))
        OR last_activity_at < now() - make_interval(secs => v_settings.empty_room_ttl_seconds)
      )
    ORDER BY last_activity_at ASC
    LIMIT 50
  LOOP
    v_processed := v_processed + 1;

    SELECT count(*) INTO v_connected
    FROM public.game_room_members
    WHERE room_id = v_room.id AND connection = 'connected';

    PERFORM app_private.ensure_host(v_room.id, now());

    IF v_room.phase IN ('round_active', 'round_reveal', 'finished') THEN
      PERFORM app_private.advance_room(v_room.id, now());
    END IF;

    SELECT * INTO v_room FROM public.game_rooms WHERE id = v_room.id;

    IF v_room.phase <> 'closed' THEN
      IF v_room.phase = 'lobby' AND v_room.lobby_expires_at <= now() THEN
        PERFORM app_private.close_room_internal(v_room.id, 'lobby_expired', now());
        v_closed := v_closed + 1;
      ELSIF v_room.phase IN ('round_active', 'round_reveal')
            AND v_room.started_at < now() - make_interval(secs => v_settings.room_max_duration_seconds) THEN
        PERFORM app_private.close_room_internal(v_room.id, 'game_expired', now());
        v_closed := v_closed + 1;
      ELSIF v_room.phase = 'finished'
            AND v_room.finished_at < now() - make_interval(secs => v_settings.finished_ttl_seconds) THEN
        PERFORM app_private.close_room_internal(v_room.id, 'results_expired', now());
        v_closed := v_closed + 1;
      ELSIF v_connected = 0
            AND v_room.last_activity_at < now() - make_interval(secs => v_settings.empty_room_ttl_seconds) THEN
        PERFORM app_private.close_room_internal(v_room.id, 'abandoned', now());
        v_closed := v_closed + 1;
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.game_rooms
  WHERE phase = 'closed'
    AND closed_at < now() - make_interval(secs => v_settings.archived_retention_seconds);
  GET DIAGNOSTICS v_purged = ROW_COUNT;

  DELETE FROM app_private.rate_limits WHERE window_start < now() - interval '1 day';

  RETURN jsonb_build_object(
    'ok', true,
    'processed', v_processed,
    'closed', v_closed,
    'purged_rooms', v_purged
  );
END;
$$;

-- ------------------------------------------------------------
-- Permessi RPC
-- ------------------------------------------------------------
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM anon, authenticated;

-- Queste due funzioni sono usate DENTRO le policy RLS: il ruolo che esegue la
-- query deve poterle chiamare. Restituiscono solo un booleano sulla propria
-- appartenenza, quindi non espongono dati di altri.
GRANT EXECUTE ON FUNCTION app_private.is_room_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_room_participant(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.server_time() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_room(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_room(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconnect_room(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_room(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_room_state(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_ready(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_game(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_answer(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_room(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.kick_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_room(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maintenance_tick() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.server_time() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_room(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconnect_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_room_state(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ready(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_game(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kick_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_room(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.maintenance_tick() TO authenticated, service_role;

-- ------------------------------------------------------------
-- Realtime: eventi di partita, stato stanza, partecipanti, round
-- ------------------------------------------------------------
ALTER TABLE public.game_rooms REPLICA IDENTITY FULL;
ALTER TABLE public.game_room_members REPLICA IDENTITY FULL;
ALTER TABLE public.game_rounds REPLICA IDENTITY FULL;
ALTER TABLE public.game_events REPLICA IDENTITY FULL;
ALTER TABLE public.game_answers REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rooms;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN insufficient_privilege THEN
        RAISE WARNING 'MondoGioco: aggiungi manualmente game_rooms alla publication supabase_realtime';
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_room_members;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN insufficient_privilege THEN
        RAISE WARNING 'MondoGioco: aggiungi manualmente game_room_members alla publication supabase_realtime';
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_rounds;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN insufficient_privilege THEN
        RAISE WARNING 'MondoGioco: aggiungi manualmente game_rounds alla publication supabase_realtime';
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.game_events;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN insufficient_privilege THEN
        RAISE WARNING 'MondoGioco: aggiungi manualmente game_events alla publication supabase_realtime';
    END;
  ELSE
    RAISE WARNING 'MondoGioco: publication supabase_realtime assente; Realtime non configurato (il polling RPC resta attivo)';
  END IF;
END;
$$;
