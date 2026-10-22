-- ============================================================
-- MondoGioco — Migrazione 006
-- Hardening post-audit di release (additiva, nessuna perdita di dati)
-- ============================================================
-- Interventi
-- ----------
-- 1. `record_solo_game`: il limite di plausibilità del punteggio era
--    5.000 punti/round, ma il motore assegna fino a 5.000 × 1,25 (bonus
--    combo) = 6.250 punti/round. Una partita perfetta con combo veniva
--    quindi RIFIUTATA come "non plausibile" e non entrava mai in
--    classifica/XP. Il limite diventa coerente col motore; il limite XP
--    viene allineato alle regole reali (`lib/game/progression.ts`).
-- 2. `start_game`: se la banca domande non bastava, venivano inseriti
--    round PARZIALI e la stanza restava bloccata (il tentativo successivo
--    rispondeva "game_already_started"). Ora la capienza è verificata
--    prima di scrivere, con pulizia difensiva in caso di errore.
-- 3. `game_room_members`: la SELECT diretta esponeva `score` in tempo
--    reale durante il round, aggirando la mascheratura dello snapshot
--    (che sottrae i punti del round in corso). Il client non legge mai
--    questa tabella: usa gli snapshot RPC. Vengono revocati i permessi di
--    lettura e la tabella esce dalla publication Realtime (gli eventi di
--    stanza restano su `game_rooms`/`game_events`).
-- 4. `submit_answer`: un heartbeat di un altro giocatore poteva marcare
--    "disconnected" un giocatore ancora attivo (timer in background,
--    rete lenta) e la sua risposta veniva rifiutata con `not_connected`.
--    Una richiesta autenticata durante un round attivo è prova di vita:
--    la presenza viene ripristinata e la risposta accettata.
-- 5. `heartbeat`: riscriveva `last_seen_at` e `last_activity_at` a ogni
--    chiamata (ogni 3 s per giocatore). Con 8 giocatori erano ~2,7
--    scritture/s sulla stessa riga di stanza, ognuna con evento Realtime
--    a cascata su tutti i client. Ora le scritture avvengono solo quando
--    la presenza è realmente stantia (≤ 30 s) o cambia stato.
--
-- Rollback
-- --------
-- Nessuna distruzione di dati. Per annullare i punti 1 e 4/5 basta
-- riapplicare i corpi delle funzioni della 005/003. I permessi del punto 3
-- si ripristinano con:
--   GRANT SELECT ON public.game_room_members TO authenticated;
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.game_room_members;
-- (sconsigliato: riapre la fuga di punteggi live).
-- ============================================================

-- ------------------------------------------------------------
-- 1a. Limiti della sessione singola coerenti col motore
--     Massimo reale: 200 round × 6.250 punti = 1.250.000.
--     (`profile_sessions.rounds` accetta già 0..100: viene esteso a 200
--     perché timed/training/survival non hanno un limite di round e una
--     sessione lunga non deve essere persa né rifiutata.)
-- ------------------------------------------------------------
ALTER TABLE app_private.profile_sessions
  DROP CONSTRAINT IF EXISTS profile_sessions_score_check;
ALTER TABLE app_private.profile_sessions
  DROP CONSTRAINT IF EXISTS profile_sessions_rounds_check;
ALTER TABLE app_private.profile_sessions
  ADD CONSTRAINT profile_sessions_score_check CHECK (score BETWEEN 0 AND 1250000) NOT VALID;
ALTER TABLE app_private.profile_sessions
  ADD CONSTRAINT profile_sessions_rounds_check CHECK (rounds BETWEEN 0 AND 200) NOT VALID;
ALTER TABLE app_private.profile_sessions
  VALIDATE CONSTRAINT profile_sessions_score_check;
ALTER TABLE app_private.profile_sessions
  VALIDATE CONSTRAINT profile_sessions_rounds_check;

-- ------------------------------------------------------------
-- 1b. record_solo_game con limiti coerenti col motore
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_solo_game(
  p_mode TEXT,
  p_difficulty TEXT,
  p_score INTEGER,
  p_rounds INTEGER,
  p_correct INTEGER,
  p_xp INTEGER,
  p_session_key UUID DEFAULT NULL,
  p_bullseyes INTEGER DEFAULT 0,
  p_best_streak INTEGER DEFAULT 0,
  p_won BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_score INTEGER := COALESCE(p_score, 0);
  v_rounds INTEGER := COALESCE(p_rounds, 0);
  v_bullseyes INTEGER := COALESCE(p_bullseyes, 0);
  v_best_streak INTEGER := COALESCE(p_best_streak, 0);
  -- Massimo reale per round: MAX_ROUND_SCORE (5000) × MAX_COMBO_MULTIPLIER (1.25).
  -- Vedi lib/game/engine.ts e lib/game/geo.ts: tenere allineati.
  v_max_score INTEGER;
  -- Massimo XP per round secondo XP_RULES: 6250/12 + 40 (bullseye) + 15 = ~576,
  -- più il bonus vittoria una tantum. Il margine (700/round + 200) copre
  -- arrotondamenti e piccole tarature future senza accettare valori arbitrari.
  v_max_xp INTEGER;
  v_new_xp INTEGER;
  v_today DATE := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_priv app_private.profile_private;
  v_streak INTEGER;
  v_achievements JSONB;
  v_xp INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;

  PERFORM app_private.enforce_rate('record_solo_game');

  IF p_mode IS NULL OR p_mode !~ '^[a-z0-9_]{1,32}$' THEN
    RAISE EXCEPTION 'MG400:invalid_mode' USING ERRCODE = 'P0001';
  END IF;
  IF p_difficulty IS NOT NULL AND p_difficulty NOT IN ('easy', 'medium', 'hard') THEN
    RAISE EXCEPTION 'MG400:invalid_difficulty' USING ERRCODE = 'P0001';
  END IF;
  IF v_rounds < 0 OR v_rounds > 200 THEN
    RAISE EXCEPTION 'MG400:invalid_round_count' USING ERRCODE = 'P0001';
  END IF;

  v_max_score := GREATEST(v_rounds, 1) * 6250;
  -- Limite difensivo: il valore realmente accreditato è ricalcolato qui
  -- sotto con la stessa formula di lib/game/progression.ts (`computeGameXp`).
  v_max_xp := GREATEST(v_rounds, 1) * 700 + 200;

  IF v_score < 0 OR v_score > v_max_score THEN
    RAISE EXCEPTION 'MG400:invalid_score' USING ERRCODE = 'P0001';
  END IF;
  IF p_correct IS NULL OR p_correct < 0 OR p_correct > v_rounds THEN
    RAISE EXCEPTION 'MG400:invalid_correct_count' USING ERRCODE = 'P0001';
  END IF;
  IF p_xp IS NULL OR p_xp < 0 OR p_xp > v_max_xp THEN
    RAISE EXCEPTION 'MG400:invalid_xp' USING ERRCODE = 'P0001';
  END IF;
  IF v_bullseyes < 0 OR v_bullseyes > v_rounds THEN
    RAISE EXCEPTION 'MG400:invalid_bullseyes' USING ERRCODE = 'P0001';
  END IF;
  IF v_best_streak < 0 OR v_best_streak > v_rounds THEN
    RAISE EXCEPTION 'MG400:invalid_best_streak' USING ERRCODE = 'P0001';
  END IF;
  -- Un bullseye (≤ 25 km) implica una risposta corretta; una serie implica
  -- altrettante risposte corrette. Impedisce di gonfiare gli obiettivi.
  IF v_bullseyes > p_correct THEN
    RAISE EXCEPTION 'MG400:invalid_bullseyes' USING ERRCODE = 'P0001';
  END IF;
  IF v_best_streak > p_correct THEN
    RAISE EXCEPTION 'MG400:invalid_best_streak' USING ERRCODE = 'P0001';
  END IF;

  -- XP autorevoli: NON si usa il valore inviato dal client. La formula è la
  -- stessa di `computeGameXp` (lib/game/progression.ts): se cambia là, va
  -- cambiata qui (e i test lo verificano).
  v_xp := GREATEST(
    25,
    round(v_score::numeric / 12)::int
      + v_bullseyes * 40
      + v_rounds * 15
      + CASE WHEN COALESCE(p_won, false) THEN 75 ELSE 0 END
  );

  INSERT INTO app_private.profile_private (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_priv FROM app_private.profile_private WHERE user_id = v_uid FOR UPDATE;
  IF p_session_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM app_private.profile_sessions
    WHERE user_id = v_uid AND session_key = p_session_key
  ) THEN
    RETURN app_private.get_my_profile()
      || jsonb_build_object('duplicate', true, 'newly_unlocked', '[]'::jsonb, 'achievement_xp', 0);
  END IF;

  v_streak := app_private.next_daily_streak(v_priv.last_played_on, v_priv.daily_streak, v_today);

  UPDATE app_private.profile_private
  SET total_score = LEAST(total_score + v_score, 100000000),
      games_played = games_played + 1,
      games_won = games_won + CASE WHEN COALESCE(p_won, false) THEN 1 ELSE 0 END,
      best_streak = GREATEST(best_streak, v_best_streak),
      bullseyes = bullseyes + v_bullseyes,
      total_rounds = total_rounds + v_rounds,
      total_correct = total_correct + p_correct,
      best_score = GREATEST(best_score, v_score),
      daily_streak = v_streak,
      longest_daily_streak = GREATEST(longest_daily_streak, v_streak),
      last_played_on = v_today,
      xp = xp + v_xp,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING xp INTO v_new_xp;

  UPDATE public.profiles
  SET level = app_private.level_from_xp(v_new_xp), updated_at = now()
  WHERE id = v_uid;

  INSERT INTO app_private.profile_sessions
    (user_id, mode, difficulty, score, rounds, correct_answers, xp_earned,
     session_key, won, bullseyes, session_best_streak)
  VALUES
    (v_uid, p_mode, p_difficulty, v_score, v_rounds, p_correct, v_xp,
     p_session_key, COALESCE(p_won, false), v_bullseyes, v_best_streak);

  v_achievements := app_private.evaluate_achievements(v_uid);

  RETURN app_private.get_my_profile()
    || jsonb_build_object(
         'duplicate', false,
         'game_xp', v_xp,
         'newly_unlocked', v_achievements->'newly_unlocked',
         'achievement_xp', (v_achievements->>'xp_awarded')::int
       );
END;
$$;

REVOKE ALL ON FUNCTION public.record_solo_game(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, UUID, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_solo_game(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 2. start_game: capienza della banca domande verificata prima di scrivere
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
  v_available INTEGER;
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

  -- Capienza: senza questo controllo un inserimento parziale lasciava la
  -- stanza con alcuni round scritti e per sempre in lobby.
  SELECT count(*) INTO v_available
  FROM app_private.question_bank
  WHERE quiz_type = v_room.quiz_type;

  IF v_available < v_room.total_rounds THEN
    RETURN app_private.fail('MG500:round_generation_failed');
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
    -- Pulizia difensiva: nessun round parziale deve restare a bloccare la stanza.
    DELETE FROM public.game_rounds WHERE room_id = p_room_id;
    RETURN app_private.fail('MG500:round_generation_failed');
  END IF;

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

REVOKE ALL ON FUNCTION public.start_game(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_game(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. Nessuna lettura diretta della tabella membri (punteggi live)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS game_room_members_member_read ON public.game_room_members;
REVOKE ALL ON public.game_room_members FROM anon, authenticated;

-- Esce dalla publication: senza SELECT gli eventi non sarebbero consegnabili
-- e il client usa comunque gli snapshot delle RPC. Le variazioni di
-- appartenenza/pronto aggiornano `game_rooms.version` e quindi restano
-- propagate da Realtime su `game_rooms`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'game_room_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.game_room_members;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 4. submit_answer: la presenza "disconnected" non deve perdere la risposta
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
  IF v_member.connection = 'kicked' OR v_member.connection = 'left' THEN
    RETURN app_private.fail('MG403:not_a_member');
  END IF;
  -- Una risposta durante un round attivo è prova che il client è vivo:
  -- se un heartbeat di un altro giocatore aveva marcato "disconnected"
  -- (timer in background, rete lenta) si ripristina la presenza invece di
  -- rifiutare la risposta.
  IF v_member.connection = 'disconnected' THEN
    UPDATE public.game_room_members
    SET connection = 'connected',
        last_seen_at = now(),
        disconnected_at = NULL
    WHERE room_id = p_room_id AND user_id = v_uid;

    PERFORM app_private.emit_event(p_room_id, 'member_reconnected', v_uid, '{}'::jsonb);
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
      connection = 'connected',
      last_seen_at = now()
  WHERE room_id = p_room_id AND user_id = v_uid;

  UPDATE public.game_rooms
  SET last_activity_at = now(), version = version + 1
  WHERE id = p_room_id;

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

REVOKE ALL ON FUNCTION public.submit_answer(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_answer(UUID, INTEGER, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 5. heartbeat: nessuna scrittura se la presenza è già fresca
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
  v_refresh_after INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN app_private.fail('MG401:authentication_required');
  END IF;

  PERFORM app_private.enforce_rate('heartbeat');

  SELECT * INTO v_settings FROM public.game_settings WHERE id = 1;

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
  -- Aggiorna la presenza al massimo ogni 30 s (o subito se era disconnesso).
  -- Deve restare molto sotto reconnect_grace_seconds (90 s) e
  -- host_handover_seconds (180 s), che leggono last_seen_at.
  v_refresh_after := LEAST(30, GREATEST(5, v_settings.reconnect_grace_seconds / 3));

  IF v_member.connection <> 'connected'
     OR v_member.last_seen_at < now() - make_interval(secs => v_refresh_after)
  THEN
    UPDATE public.game_room_members
    SET connection = 'connected',
        last_seen_at = now(),
        disconnected_at = NULL
    WHERE room_id = p_room_id AND user_id = v_uid;
  END IF;

  IF v_became_connected THEN
    PERFORM app_private.emit_event(p_room_id, 'member_reconnected', v_uid, '{}'::jsonb);
  END IF;

  -- Anche l'attività della stanza non viene riscritta a ogni battito:
  -- basta una volta ogni 30 s per la scadenza "stanza vuota" (120 s).
  IF v_room.last_activity_at < now() - interval '30 seconds' THEN
    UPDATE public.game_rooms
    SET last_activity_at = now()
    WHERE id = p_room_id AND phase <> 'closed';
  END IF;

  -- Marca come disconnessi i membri silenziosi (solo durante una partita attiva:
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

REVOKE ALL ON FUNCTION public.heartbeat(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.heartbeat(UUID) TO authenticated;
