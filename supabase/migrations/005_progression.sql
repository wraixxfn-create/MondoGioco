-- ============================================================
-- MondoGioco — Migrazione 005
-- Progressione verificata dal server: statistiche complete,
-- obiettivi idempotenti, streak giornaliera, avatar cosmetici,
-- impostazioni utente, storico partite, amici e classifiche.
-- ============================================================
-- Compatibilità
-- -------------
-- Migrazione ADDITIVA: nessuna tabella/colonna esistente viene rimossa o
-- rinominata. Cambiano solo i corpi di alcune funzioni:
--   * `public.record_solo_game` — stessa firma per i vecchi client: i
--     parametri nuovi (chiave di idempotenza, bullseyes, streak, vittoria)
--     hanno valori di default, quindi le chiamate a 6 argomenti esistenti
--     continuano a funzionare. La funzione viene ricreata con DROP+CREATE
--     perché PostgreSQL non permette di aggiungere parametri con
--     CREATE OR REPLACE.
--   * `public.get_leaderboard` — aggiunge la colonna `avatar_id` al
--     risultato (additiva per i client JSON). Ricreata con DROP+CREATE.
--   * `app_private.record_multiplayer_results` — stessa firma della 003,
--     estesa con le nuove statistiche e la valutazione degli obiettivi.
--   * `get_my_profile` — il JSON restituito contiene campi in più, mai in meno.
--
-- Anti-duplicazione delle ricompense
-- ----------------------------------
--   * Obiettivi: PK (user_id, achievement_id) su `user_achievements`;
--     gli XP vengono sommati solo per le righe effettivamente inserite.
--   * Partite singole: chiave di idempotenza `session_key` (UUID generato
--     dal client per partita) con indice unico parziale per utente: un
--     retry di rete restituisce `duplicate: true` senza riapplicare nulla.
--   * Partite multiplayer: invariato il guard `game_rooms.stats_recorded`
--     della migrazione 003 (statistiche registrate una sola volta).
--
-- Le definizioni degli obiettivi/avatar qui sotto rispecchiano
-- `lib/game/progression.ts`: vanno modificate insieme.
-- ============================================================

-- ------------------------------------------------------------
-- Nuove colonne (additive, con default: nessun dato perso)
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_id TEXT NOT NULL DEFAULT 'globe';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_avatar_id_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_avatar_id_check
      CHECK (avatar_id IN ('globe','compass','owl','fox','penguin','rocket','crown','dragon'));
  END IF;
END;
$$;

ALTER TABLE app_private.profile_private
  ADD COLUMN IF NOT EXISTS total_rounds INTEGER NOT NULL DEFAULT 0 CHECK (total_rounds >= 0),
  ADD COLUMN IF NOT EXISTS total_correct INTEGER NOT NULL DEFAULT 0 CHECK (total_correct >= 0),
  ADD COLUMN IF NOT EXISTS best_score INTEGER NOT NULL DEFAULT 0 CHECK (best_score >= 0),
  ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (daily_streak >= 0),
  ADD COLUMN IF NOT EXISTS longest_daily_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_daily_streak >= 0),
  ADD COLUMN IF NOT EXISTS last_played_on DATE,
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app_private.profile_sessions
  ADD COLUMN IF NOT EXISTS session_key UUID,
  ADD COLUMN IF NOT EXISTS won BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bullseyes INTEGER NOT NULL DEFAULT 0 CHECK (bullseyes >= 0),
  ADD COLUMN IF NOT EXISTS session_best_streak INTEGER NOT NULL DEFAULT 0 CHECK (session_best_streak >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_sessions_idempotency
  ON app_private.profile_sessions (user_id, session_key)
  WHERE session_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profile_private_total_score
  ON app_private.profile_private (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_profile_sessions_user_mode
  ON app_private.profile_sessions (user_id, mode);

-- Backfill delle nuove statistiche dalle sessioni già registrate.
-- Usa GREATEST così una riapplicazione non riduce mai i valori correnti.
UPDATE app_private.profile_private pr
SET total_rounds  = GREATEST(pr.total_rounds,  agg.rounds),
    total_correct = GREATEST(pr.total_correct, agg.correct),
    best_score    = GREATEST(pr.best_score,    agg.best)
FROM (
  SELECT user_id,
         COALESCE(sum(rounds), 0)::int          AS rounds,
         COALESCE(sum(correct_answers), 0)::int AS correct,
         COALESCE(max(score), 0)::int           AS best
  FROM app_private.profile_sessions
  GROUP BY user_id
) agg
WHERE agg.user_id = pr.user_id;

-- ------------------------------------------------------------
-- Obiettivi sbloccati (una riga per sempre: niente doppie ricompense)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL CHECK (achievement_id ~ '^[a-z0-9_]{2,48}$'),
  xp_awarded INTEGER NOT NULL CHECK (xp_awarded >= 0),
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);
ALTER TABLE app_private.user_achievements ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Amicizie (relazione "seguo X": serve alla classifica amici)
-- Il dato è privato: vive in app_private, accessibile solo via RPC.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.friendships (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, friend_id),
  CHECK (user_id <> friend_id)
);
ALTER TABLE app_private.friendships ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_friendships_user ON app_private.friendships (user_id);

-- Politiche di rate limiting per le nuove RPC (vedi migrazione 002).
INSERT INTO app_private.rate_limit_policies (bucket, max_hits, window_seconds, description) VALUES
  ('set_avatar',     20, 3600, 'Cambio avatar: 20/ora'),
  ('set_my_settings',30, 3600, 'Cambio impostazioni: 30/ora'),
  ('add_friend',     30, 3600, 'Aggiunta amici: 30/ora'),
  ('remove_friend',  60, 3600, 'Rimozione amici: 60/ora')
ON CONFLICT (bucket) DO NOTHING;

-- ------------------------------------------------------------
-- Helper: valutazione obiettivi (idempotente)
-- Blocca la riga privata del profilo e accredita gli XP SOLO per gli
-- obiettivi appena inseriti. Restituisce {newly_unlocked, xp_awarded}.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.evaluate_achievements(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_priv app_private.profile_private;
  v_mp_games INTEGER := 0;
  v_mp_wins INTEGER := 0;
  v_def RECORD;
  v_inserted INTEGER := 0;
  v_xp_new INTEGER := 0;
  v_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
  INSERT INTO app_private.profile_private (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_priv FROM app_private.profile_private WHERE user_id = p_user_id FOR UPDATE;

  SELECT count(*), count(*) FILTER (WHERE won)
  INTO v_mp_games, v_mp_wins
  FROM app_private.profile_sessions
  WHERE user_id = p_user_id AND mode LIKE 'multiplayer%';

  FOR v_def IN
    SELECT id, xp, met FROM (VALUES
      ('first_game',         100,  v_priv.games_played >= 1),
      ('bullseye_1',         250,  v_priv.bullseyes >= 1),
      ('multiplayer_1',      200,  v_mp_games >= 1),
      ('streak_5',           300,  v_priv.best_streak >= 5),
      ('multiplayer_win_1',  400,  v_mp_wins >= 1),
      ('explorer_10',        500,  v_priv.games_played >= 10),
      ('correct_50',         600,  v_priv.total_correct >= 50),
      ('daily_7',            700,  v_priv.longest_daily_streak >= 7),
      ('winner_5',           750,  v_priv.games_won >= 5),
      ('best_score_20000',   800,  v_priv.best_score >= 20000),
      ('cartographer_25000', 1000, v_priv.total_score >= 25000),
      ('games_50',           1500, v_priv.games_played >= 50)
    ) AS d(id, xp, met)
  LOOP
    IF v_def.met THEN
      INSERT INTO app_private.user_achievements (user_id, achievement_id, xp_awarded)
      VALUES (p_user_id, v_def.id, v_def.xp)
      ON CONFLICT (user_id, achievement_id) DO NOTHING;
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      IF v_inserted > 0 THEN
        v_xp_new := v_xp_new + v_def.xp;
        v_ids := array_append(v_ids, v_def.id);
      END IF;
    END IF;
  END LOOP;

  IF v_xp_new > 0 THEN
    UPDATE app_private.profile_private
    SET xp = xp + v_xp_new, updated_at = now()
    WHERE user_id = p_user_id
    RETURNING xp INTO v_priv.xp;

    UPDATE public.profiles
    SET level = app_private.level_from_xp(v_priv.xp), updated_at = now()
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'newly_unlocked', to_jsonb(v_ids),
    'xp_awarded', v_xp_new
  );
END;
$$;

-- ------------------------------------------------------------
-- Helper: streak giornaliera. "Oggi" è il giorno UTC del server:
-- scelta deterministica e uguale per tutti (documentata).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.next_daily_streak(
  p_last_played_on DATE,
  p_current_streak INTEGER,
  p_today DATE
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_last_played_on = p_today THEN GREATEST(COALESCE(p_current_streak, 0), 1)
    WHEN p_last_played_on = p_today - 1 THEN GREATEST(COALESCE(p_current_streak, 0), 1) + 1
    ELSE 1
  END;
$$;

-- ------------------------------------------------------------
-- get_my_profile: JSON esteso con le nuove statistiche (additivo)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.get_my_profile()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'avatar_url', p.avatar_url,
    'avatar_id', COALESCE(p.avatar_id, 'globe'),
    'level', p.level,
    'created_at', p.created_at,
    'email', COALESCE(pr.email, ''),
    'total_score', COALESCE(pr.total_score, 0),
    'games_played', COALESCE(pr.games_played, 0),
    'games_won', COALESCE(pr.games_won, 0),
    'best_streak', COALESCE(pr.best_streak, 0),
    'bullseyes', COALESCE(pr.bullseyes, 0),
    'xp', COALESCE(pr.xp, 0),
    'total_rounds', COALESCE(pr.total_rounds, 0),
    'total_correct', COALESCE(pr.total_correct, 0),
    'best_score', COALESCE(pr.best_score, 0),
    'daily_streak', COALESCE(pr.daily_streak, 0),
    'longest_daily_streak', COALESCE(pr.longest_daily_streak, 0),
    'last_played_on', pr.last_played_on,
    'settings', COALESCE(pr.settings, '{}'::jsonb),
    'unlocked_achievements', COALESCE((
      SELECT jsonb_agg(ua.achievement_id ORDER BY ua.unlocked_at)
      FROM app_private.user_achievements ua
      WHERE ua.user_id = p.id
    ), '[]'::jsonb)
  )
  FROM public.profiles p
  LEFT JOIN app_private.profile_private pr ON pr.user_id = p.id
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
  SELECT app_private.get_my_profile();
$$;

-- ------------------------------------------------------------
-- record_solo_game: statistiche complete + idempotenza.
-- I vecchi client (6 argomenti) continuano a funzionare: i parametri
-- nuovi hanno default. Il server resta l'unico a sommare gli XP
-- obiettivo (il client invia solo gli XP "di partita", già limitati).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_solo_game(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, UUID, INTEGER, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS public.record_solo_game(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE FUNCTION public.record_solo_game(
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
  v_max_score INTEGER;
  v_max_xp INTEGER;
  v_new_xp INTEGER;
  v_today DATE := (clock_timestamp() AT TIME ZONE 'UTC')::date;
  v_priv app_private.profile_private;
  v_streak INTEGER;
  v_achievements JSONB;
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
  IF v_rounds < 0 OR v_rounds > 50 THEN
    RAISE EXCEPTION 'MG400:invalid_round_count' USING ERRCODE = 'P0001';
  END IF;

  v_max_score := GREATEST(v_rounds, 1) * 5000;
  v_max_xp := GREATEST(v_rounds, 1) * 2000;

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

  INSERT INTO app_private.profile_private (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  -- Idempotenza: una stessa partita (retry dopo errore di rete, doppio
  -- invio) non viene mai registrata due volte.
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
      xp = xp + p_xp,
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
    (v_uid, p_mode, p_difficulty, v_score, v_rounds, p_correct, p_xp,
     p_session_key, COALESCE(p_won, false), v_bullseyes, v_best_streak);

  v_achievements := app_private.evaluate_achievements(v_uid);

  RETURN app_private.get_my_profile()
    || jsonb_build_object(
         'duplicate', false,
         'newly_unlocked', v_achievements->'newly_unlocked',
         'achievement_xp', (v_achievements->>'xp_awarded')::int
       );
END;
$$;

-- ------------------------------------------------------------
-- Risultati multiplayer (sostituzione estesa della funzione 003):
-- stesse garanzie (una sola volta via stats_recorded) più nuove
-- statistiche, streak giornaliera e obiettivi.
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
  v_won BOOLEAN;
  v_today DATE := (p_now AT TIME ZONE 'UTC')::date;
  v_priv app_private.profile_private;
  v_streak INTEGER;
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
    -- A pari punteggio massimo vince chiunque lo raggiunga (pari merito):
    -- comportamento invariato rispetto alla migrazione 003.
    v_won := v_member.score > 0 AND v_member.score = v_winner_score;

    INSERT INTO app_private.profile_private (user_id)
    VALUES (v_member.user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO v_priv FROM app_private.profile_private WHERE user_id = v_member.user_id FOR UPDATE;
    v_streak := app_private.next_daily_streak(v_priv.last_played_on, v_priv.daily_streak, v_today);

    UPDATE app_private.profile_private
    SET total_score = LEAST(total_score + v_member.score, 100000000),
        games_played = games_played + 1,
        games_won = games_won + CASE WHEN v_won THEN 1 ELSE 0 END,
        total_rounds = total_rounds + LEAST(v_room.total_rounds, 100),
        total_correct = total_correct + LEAST(v_member.correct_count, v_room.total_rounds),
        best_score = GREATEST(best_score, LEAST(v_member.score, 100000)),
        daily_streak = v_streak,
        longest_daily_streak = GREATEST(longest_daily_streak, v_streak),
        last_played_on = v_today,
        xp = xp + v_xp,
        updated_at = p_now
    WHERE user_id = v_member.user_id;

    UPDATE public.profiles p
    SET level = app_private.level_from_xp(pr.xp),
        updated_at = p_now
    FROM app_private.profile_private pr
    WHERE p.id = pr.user_id AND pr.user_id = v_member.user_id;

    INSERT INTO app_private.profile_sessions
      (user_id, mode, difficulty, score, rounds, correct_answers, xp_earned, ended_at, won)
    VALUES
      (v_member.user_id, 'multiplayer_' || v_room.quiz_type, v_room.difficulty,
       LEAST(v_member.score, 100000), LEAST(v_room.total_rounds, 100),
       LEAST(v_member.correct_count, v_room.total_rounds), v_xp, p_now, v_won);

    PERFORM app_private.evaluate_achievements(v_member.user_id);
  END LOOP;

  UPDATE public.game_rooms SET stats_recorded = true WHERE id = p_room_id;
END;
$$;

-- ------------------------------------------------------------
-- RPC: impostazioni utente (validate e persistite)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_my_settings(p_settings JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.enforce_rate('set_my_settings');

  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object'
     OR (p_settings - ARRAY['reduce_motion','globe_auto_rotate']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'MG400:invalid_settings' USING ERRCODE = 'P0001';
  END IF;
  IF (p_settings ? 'reduce_motion' AND jsonb_typeof(p_settings->'reduce_motion') <> 'boolean')
     OR (p_settings ? 'globe_auto_rotate' AND jsonb_typeof(p_settings->'globe_auto_rotate') <> 'boolean') THEN
    RAISE EXCEPTION 'MG400:invalid_settings' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app_private.profile_private (user_id, settings)
  VALUES (v_uid, p_settings)
  ON CONFLICT (user_id)
  DO UPDATE SET settings = app_private.profile_private.settings || p_settings,
                updated_at = now();

  RETURN app_private.get_my_profile();
END;
$$;

-- ------------------------------------------------------------
-- RPC: avatar cosmetico (catalogo chiuso + sblocco per livello)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_avatar(p_avatar_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_unlock INTEGER;
  v_level INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.enforce_rate('set_avatar');

  SELECT unlock_level INTO v_unlock
  FROM (VALUES
    ('globe',1),('compass',1),('owl',2),('fox',3),
    ('penguin',4),('rocket',5),('crown',7),('dragon',10)
  ) AS a(id, unlock_level)
  WHERE id = p_avatar_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MG400:invalid_avatar' USING ERRCODE = 'P0001';
  END IF;

  SELECT level INTO v_level FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MG403:profile_missing' USING ERRCODE = 'P0001';
  END IF;
  IF v_level < v_unlock THEN
    RAISE EXCEPTION 'MG403:avatar_locked' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles SET avatar_id = p_avatar_id, updated_at = now() WHERE id = v_uid;
  RETURN app_private.get_my_profile();
END;
$$;

-- ------------------------------------------------------------
-- RPC: progressione completa del chiamante
-- (profilo privato + obiettivi + statistiche per modalità +
--  ultime partite). Solo i propri dati: auth.uid() è il filtro.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_progression()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;

  -- Allinea eventuali obiettivi già maturati (es. dati pre-005): idempotente.
  PERFORM app_private.evaluate_achievements(v_uid);

  RETURN jsonb_build_object(
    'server_time', now(),
    'profile', app_private.get_my_profile(),
    'achievements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ua.achievement_id,
        'xp_awarded', ua.xp_awarded,
        'unlocked_at', ua.unlocked_at
      ) ORDER BY ua.unlocked_at)
      FROM app_private.user_achievements ua WHERE ua.user_id = v_uid
    ), '[]'::jsonb),
    'mode_stats', COALESCE((
      SELECT jsonb_agg(mode_rows.payload ORDER BY mode_rows.games_count DESC, mode_rows.score_sum DESC)
      FROM (
        SELECT jsonb_build_object(
          'mode', s.mode,
          'games', count(*),
          'wins', count(*) FILTER (WHERE s.won),
          'total_score', COALESCE(sum(s.score), 0),
          'best_score', COALESCE(max(s.score), 0),
          'rounds', COALESCE(sum(s.rounds), 0),
          'correct', COALESCE(sum(s.correct_answers), 0)
        ) AS payload, count(*) AS games_count, COALESCE(sum(s.score), 0) AS score_sum
        FROM app_private.profile_sessions s
        WHERE s.user_id = v_uid
        GROUP BY s.mode
      ) mode_rows
    ), '[]'::jsonb),
    'recent_sessions', COALESCE((
      SELECT jsonb_agg(recent.payload ORDER BY recent.ended_at DESC)
      FROM (
        SELECT jsonb_build_object(
          'mode', s.mode,
          'difficulty', s.difficulty,
          'score', s.score,
          'rounds', s.rounds,
          'correct', s.correct_answers,
          'xp_earned', s.xp_earned,
          'won', s.won,
          'ended_at', s.ended_at
        ) AS payload, s.ended_at
        FROM app_private.profile_sessions s
        WHERE s.user_id = v_uid
        ORDER BY s.ended_at DESC
        LIMIT 20
      ) recent
    ), '[]'::jsonb)
  );
END;
$$;

-- ------------------------------------------------------------
-- RPC: storico partite del chiamante (opzionalmente solo multiplayer)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_history(
  p_limit INTEGER DEFAULT 20,
  p_only_multiplayer BOOLEAN DEFAULT false
)
RETURNS TABLE (
  mode TEXT,
  difficulty TEXT,
  score INTEGER,
  rounds INTEGER,
  correct INTEGER,
  xp_earned INTEGER,
  won BOOLEAN,
  is_multiplayer BOOLEAN,
  ended_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
    SELECT s.mode, s.difficulty, s.score, s.rounds, s.correct_answers,
           s.xp_earned, s.won, (s.mode LIKE 'multiplayer%'), s.ended_at
    FROM app_private.profile_sessions s
    WHERE s.user_id = v_uid
      AND (NOT COALESCE(p_only_multiplayer, false) OR s.mode LIKE 'multiplayer%')
    ORDER BY s.ended_at DESC
    LIMIT v_limit;
END;
$$;

-- ------------------------------------------------------------
-- RPC: classifica pubblica (ora con avatar e spareggio documentato)
-- Espone solo aggregati pubblici: mai email o dati privati.
-- Nuovi utenti: compaiono dopo la prima partita registrata
-- (games_played > 0); nelle finestre week/month conta lo storico
-- delle sessioni nel periodo. Pareggi: stessi punti = stessa
-- posizione lato client; qui l'ordine è punti DESC, partite ASC
-- (efficienza), username ASC (determinismo).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_leaderboard(TEXT);

CREATE FUNCTION public.get_leaderboard(p_range TEXT DEFAULT 'all')
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  avatar_id TEXT,
  total_score BIGINT,
  games_played BIGINT,
  level INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
BEGIN
  IF p_range IS NOT NULL AND p_range NOT IN ('all', 'week', 'month') THEN
    RAISE EXCEPTION 'MG400:invalid_range' USING ERRCODE = 'P0001';
  END IF;

  IF p_range IS NULL OR p_range = 'all' THEN
    RETURN QUERY
      SELECT p.id, p.username, COALESCE(p.avatar_id, 'globe'),
             pr.total_score::bigint, pr.games_played::bigint, p.level
      FROM public.profiles p
      JOIN app_private.profile_private pr ON pr.user_id = p.id
      WHERE pr.games_played > 0
      ORDER BY pr.total_score DESC, pr.games_played ASC, p.username ASC
      LIMIT 50;
  ELSE
    RETURN QUERY
      SELECT p.id,
             p.username,
             COALESCE(p.avatar_id, 'globe'),
             COALESCE(sum(s.score), 0)::bigint,
             count(s.id)::bigint,
             p.level
      FROM app_private.profile_sessions s
      JOIN public.profiles p ON p.id = s.user_id
      WHERE s.ended_at >= now() - make_interval(days => CASE WHEN p_range = 'week' THEN 7 ELSE 30 END)
      GROUP BY p.id, p.username, p.avatar_id, p.level
      ORDER BY 4 DESC, 5 ASC, p.username ASC
      LIMIT 50;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- RPC: amici (aggiungi per username pubblico, elenco, rimuovi,
-- classifica ristretta a sé stessi + amici)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_friend(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_friend public.profiles;
  v_inserted INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.enforce_rate('add_friend');

  SELECT * INTO v_friend FROM public.profiles
  WHERE lower(username) = lower(btrim(COALESCE(p_username, '')));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MG404:friend_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_friend.id = v_uid THEN
    RAISE EXCEPTION 'MG400:cannot_friend_self' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO app_private.friendships (user_id, friend_id)
  VALUES (v_uid, v_friend.id)
  ON CONFLICT (user_id, friend_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'already_friends', v_inserted = 0,
    'friend', jsonb_build_object(
      'user_id', v_friend.id,
      'username', v_friend.username,
      'avatar_id', COALESCE(v_friend.avatar_id, 'globe'),
      'level', v_friend.level
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friend(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_deleted INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;
  PERFORM app_private.enforce_rate('remove_friend');

  DELETE FROM app_private.friendships WHERE user_id = v_uid AND friend_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'removed', v_deleted > 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_friends()
RETURNS TABLE (user_id UUID, username TEXT, avatar_id TEXT, level INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;
  RETURN QUERY
    SELECT p.id, p.username, COALESCE(p.avatar_id, 'globe'), p.level
    FROM app_private.friendships f
    JOIN public.profiles p ON p.id = f.friend_id
    WHERE f.user_id = v_uid
    ORDER BY p.username ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_friends_leaderboard(p_range TEXT DEFAULT 'all')
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  avatar_id TEXT,
  total_score BIGINT,
  games_played BIGINT,
  level INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_range IS NOT NULL AND p_range NOT IN ('all', 'week', 'month') THEN
    RAISE EXCEPTION 'MG400:invalid_range' USING ERRCODE = 'P0001';
  END IF;

  IF p_range IS NULL OR p_range = 'all' THEN
    RETURN QUERY
      SELECT p.id, p.username, COALESCE(p.avatar_id, 'globe'),
             pr.total_score::bigint, pr.games_played::bigint, p.level
      FROM public.profiles p
      JOIN app_private.profile_private pr ON pr.user_id = p.id
      WHERE pr.games_played > 0
        AND (p.id = v_uid OR EXISTS (
          SELECT 1 FROM app_private.friendships f
          WHERE f.user_id = v_uid AND f.friend_id = p.id
        ))
      ORDER BY pr.total_score DESC, pr.games_played ASC, p.username ASC
      LIMIT 50;
  ELSE
    RETURN QUERY
      SELECT p.id,
             p.username,
             COALESCE(p.avatar_id, 'globe'),
             COALESCE(sum(s.score), 0)::bigint,
             count(s.id)::bigint,
             p.level
      FROM app_private.profile_sessions s
      JOIN public.profiles p ON p.id = s.user_id
      WHERE s.ended_at >= now() - make_interval(days => CASE WHEN p_range = 'week' THEN 7 ELSE 30 END)
        AND (p.id = v_uid OR EXISTS (
          SELECT 1 FROM app_private.friendships f
          WHERE f.user_id = v_uid AND f.friend_id = p.id
        ))
      GROUP BY p.id, p.username, p.avatar_id, p.level
      ORDER BY 4 DESC, 5 ASC, p.username ASC
      LIMIT 50;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Permessi (schema privato sempre chiuso; RPC esplicite per ruolo)
-- ------------------------------------------------------------
REVOKE ALL ON app_private.user_achievements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON app_private.friendships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.evaluate_achievements(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.next_daily_streak(DATE, INTEGER, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.get_my_profile() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_solo_game(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, UUID, INTEGER, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_settings(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_avatar(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_progression() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_history(INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_leaderboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_friend(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_friend(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_friends() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_friends_leaderboard(TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_solo_game(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_settings(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_avatar(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_progression() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_history(INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_friend(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_friends() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friends_leaderboard(TEXT) TO authenticated;
