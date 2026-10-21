-- ============================================================
-- MondoGioco — Migrazione 002
-- Profili pubblici / dati privati, rate limiting, leaderboard server-side
-- ============================================================
-- Contesto
-- ---------
-- La migrazione 001 creava un'unica tabella `profiles` che conteneva sia dati
-- pubblici (username, avatar) sia dati privati (email, punteggi, XP).
-- Questa migrazione separa le due cose:
--
--   * `public.profiles`        -> SOLO dati pubblici (id, username, avatar, livello)
--   * `app_private.profile_private` -> dati privati (email, punteggi, XP, vittorie)
--
-- Lo schema `app_private` non è esposto da PostgREST e non ha GRANT per i ruoli
-- `anon` / `authenticated`: l'unico modo per leggere o scrivere quei dati è
-- passare dalle funzioni RPC `security definer` definite più sotto.
--
-- La tabella `player_profiles` e `game_sessions` della 001 consentivano a
-- QUALSIASI client (anche anonimo) di scrivere punteggi arbitrari. Vengono
-- quindi eliminate: i punteggi "solo" ora passano da `record_solo_game`, che
-- valida e limita gli incrementi lato server.
-- ============================================================

-- ------------------------------------------------------------
-- Schema privato
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

-- ------------------------------------------------------------
-- Rate limiting (fixed window) usato dalle RPC esposte
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.rate_limits (
  bucket TEXT NOT NULL,
  subject UUID NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0 CHECK (counter >= 0),
  PRIMARY KEY (bucket, subject, window_start)
);

ALTER TABLE app_private.rate_limits ENABLE ROW LEVEL SECURITY;
-- Nessuna policy e nessun GRANT: la tabella è accessibile solo dalle funzioni
-- `security definer` sottostanti (di proprietà del ruolo di migrazione).

CREATE OR REPLACE FUNCTION app_private.consume_rate_limit(
  p_bucket TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, pg_temp
AS $$
DECLARE
  v_subject UUID := auth.uid();
  v_window TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_bucket IS NULL OR char_length(p_bucket) < 3 THEN
    RAISE EXCEPTION 'MG500:invalid_rate_limit_bucket' USING ERRCODE = 'P0001';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 OR p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'MG500:invalid_rate_limit_config' USING ERRCODE = 'P0001';
  END IF;

  v_window := to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds);

  INSERT INTO app_private.rate_limits (bucket, subject, window_start, counter)
  VALUES (p_bucket, v_subject, v_window, 1)
  ON CONFLICT (bucket, subject, window_start)
  DO UPDATE SET counter = app_private.rate_limits.counter + 1
  RETURNING counter INTO v_count;

  IF v_count > p_limit THEN
    RAISE EXCEPTION 'MG429:rate_limited' USING ERRCODE = 'P0001', DETAIL = p_bucket;
  END IF;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION app_private.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;

-- Politiche di rate limiting configurabili.
-- In produzione si modificano con un ruolo amministrativo (service_role / SQL editor):
--   UPDATE app_private.rate_limit_policies SET max_hits = 10 WHERE bucket = 'create_room';
CREATE TABLE IF NOT EXISTS app_private.rate_limit_policies (
  bucket TEXT PRIMARY KEY,
  max_hits INTEGER NOT NULL CHECK (max_hits BETWEEN 1 AND 100000),
  window_seconds INTEGER NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  description TEXT NOT NULL DEFAULT ''
);

INSERT INTO app_private.rate_limit_policies (bucket, max_hits, window_seconds, description) VALUES
  ('set_username',        5,   3600, 'Cambio nickname: 5/ora'),
  ('record_solo_game',   40,   3600, 'Salvataggio partite singole: 40/ora'),
  ('create_room',         6,    600, 'Creazione stanze: 6/10 minuti'),
  ('join_room',          15,     60, 'Tentativi di ingresso: 15/minuto'),
  ('reconnect_room',     30,     60, 'Riconnessioni: 30/minuto'),
  ('heartbeat',         120,     60, 'Heartbeat: 2/secondo'),
  ('sync_room',         180,     60, 'Sincronizzazioni: 3/secondo'),
  ('set_ready',          60,     60, 'Cambio pronto: 1/secondo'),
  ('start_game',         15,     60, 'Avvio partita: 15/minuto'),
  ('submit_answer',     120,     60, 'Invio risposte: 2/secondo'),
  ('leave_room',         30,     60, 'Uscita stanza: 30/minuto'),
  ('kick_member',        30,     60, 'Espulsioni: 30/minuto'),
  ('close_room',         20,     60, 'Chiusura stanza: 20/minuto'),
  ('maintenance_tick',   10,     60, 'Manutenzione: 10/minuto')
ON CONFLICT (bucket) DO NOTHING;

CREATE OR REPLACE FUNCTION app_private.enforce_rate(p_bucket TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app_private, pg_temp
AS $$
DECLARE
  v_policy app_private.rate_limit_policies;
BEGIN
  SELECT * INTO v_policy FROM app_private.rate_limit_policies WHERE bucket = p_bucket;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'MG500:unknown_rate_bucket' USING ERRCODE = 'P0001', DETAIL = p_bucket;
  END IF;
  PERFORM app_private.consume_rate_limit(v_policy.bucket, v_policy.max_hits, v_policy.window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION app_private.enforce_rate(TEXT) FROM PUBLIC;

-- ------------------------------------------------------------
-- Profilo pubblico (leggibile da tutti, scrivibile solo via RPC)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrazione dei dati dalla vecchia tabella `profiles` (se la 001 è già stata
-- applicata). Le colonne private vengono rimosse dopo la copia.
CREATE TABLE IF NOT EXISTS app_private.profile_private (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 100000000),
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  games_won INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
  best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  bullseyes INTEGER NOT NULL DEFAULT 0 CHECK (bullseyes >= 0),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'total_score'
  ) THEN
    EXECUTE $mig$
      INSERT INTO app_private.profile_private
        (user_id, email, total_score, games_played, games_won, best_streak, xp, created_at, updated_at)
      SELECT
        p.id,
        COALESCE(p.email, ''),
        GREATEST(0, LEAST(COALESCE(p.total_score, 0), 100000000)),
        GREATEST(COALESCE(p.games_played, 0), 0),
        GREATEST(COALESCE(p.games_won, 0), 0),
        GREATEST(COALESCE(p.best_streak, 0), 0),
        GREATEST(COALESCE(p.xp, 0), 0),
        COALESCE(p.created_at, now()),
        COALESCE(p.updated_at, now())
      FROM public.profiles p
      ON CONFLICT (user_id) DO NOTHING
    $mig$;
  ELSE
    INSERT INTO app_private.profile_private (user_id)
    SELECT p.id FROM public.profiles p
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END;
$$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS total_score;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS games_played;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS games_won;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS best_streak;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS xp;

-- Username unici (case-insensitive). Se esistono duplicati storici, la migrazione
-- non si interrompe: viene emesso un warning e l'indice non viene creato.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
    ON public.profiles (lower(username));
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'MondoGioco: username duplicati presenti, indice case-insensitive non creato';
END;
$$;

-- ------------------------------------------------------------
-- Sessioni "solo" validate dal server (usate per le classifiche filtrate)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_private.profile_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (char_length(mode) BETWEEN 1 AND 32),
  difficulty TEXT,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100000),
  rounds INTEGER NOT NULL CHECK (rounds BETWEEN 0 AND 100),
  correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  xp_earned INTEGER NOT NULL DEFAULT 0 CHECK (xp_earned BETWEEN 0 AND 100000),
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_sessions_user_ended
  ON app_private.profile_sessions (user_id, ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_sessions_ended
  ON app_private.profile_sessions (ended_at DESC);

-- ------------------------------------------------------------
-- Trigger di creazione profilo (pubblico + privato) per ogni utente Auth
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_base TEXT;
  v_final TEXT;
  v_attempt INTEGER := 0;
BEGIN
  v_base := btrim(COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    ''
  ));
  v_base := regexp_replace(v_base, '[^a-zA-Z0-9_ -]', '', 'g');
  v_base := left(btrim(v_base), 20);
  IF v_base IS NULL OR char_length(v_base) < 3 THEN
    v_base := 'Esploratore';
  END IF;

  v_final := v_base;
  WHILE EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.username) = lower(v_final)) LOOP
    v_attempt := v_attempt + 1;
    v_final := left(v_base, 12) || '_' || substr(replace(NEW.id::text, '-', ''), 1, 5);
    IF v_attempt > 3 THEN
      v_final := left(v_base, 12) || '_' || substr(replace(NEW.id::text, '-', ''), 1, 5) || v_attempt::text;
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, v_final)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO app_private.profile_private (user_id, email)
  VALUES (NEW.id, COALESCE(NEW.email, ''))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- RLS: profili pubblici in sola lettura per i client
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profili visibili a tutti" ON public.profiles;
DROP POLICY IF EXISTS "Inserimento proprio profilo" ON public.profiles;
DROP POLICY IF EXISTS "Aggiornamento solo proprietario" ON public.profiles;
DROP POLICY IF EXISTS profiles_public_read ON public.profiles;

CREATE POLICY profiles_public_read ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (true);

-- Nessuna policy di INSERT/UPDATE/DELETE per i client: ogni modifica passa
-- dalle RPC `set_username` (proprio profilo) o dal trigger di Auth.

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO anon, authenticated;

-- ------------------------------------------------------------
-- RPC: aggiorna il proprio username
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_username(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT;
  v_profile public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'MG401:authentication_required' USING ERRCODE = 'P0001';
  END IF;

  PERFORM app_private.enforce_rate('set_username');

  v_name := btrim(regexp_replace(COALESCE(p_username, ''), '[\x00-\x1F\x7F]', '', 'g'));
  IF v_name !~ '^[A-Za-z0-9_][A-Za-z0-9_ -]{2,19}$' THEN
    RAISE EXCEPTION 'MG400:invalid_username' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(p.username) = lower(v_name) AND p.id <> v_uid
  ) THEN
    RAISE EXCEPTION 'MG409:username_taken' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
  SET username = v_name, updated_at = now()
  WHERE id = v_uid
  RETURNING * INTO v_profile;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MG403:profile_missing' USING ERRCODE = 'P0001';
  END IF;

  RETURN app_private.get_my_profile();
END;
$$;

-- ------------------------------------------------------------
-- RPC: profilo del chiamante (pubblico + privato)
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
    'level', p.level,
    'created_at', p.created_at,
    'email', COALESCE(pr.email, ''),
    'total_score', COALESCE(pr.total_score, 0),
    'games_played', COALESCE(pr.games_played, 0),
    'games_won', COALESCE(pr.games_won, 0),
    'best_streak', COALESCE(pr.best_streak, 0),
    'bullseyes', COALESCE(pr.bullseyes, 0),
    'xp', COALESCE(pr.xp, 0)
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
-- Livello calcolato dagli XP (stessa formula del client)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.level_from_xp(p_xp INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_level INTEGER := 1;
  v_required NUMERIC := 0;
  v_total NUMERIC := GREATEST(COALESCE(p_xp, 0), 0);
BEGIN
  WHILE v_required + floor(100 * power(v_level, 1.5)) <= v_total AND v_level < 200 LOOP
    v_required := v_required + floor(100 * power(v_level, 1.5));
    v_level := v_level + 1;
  END LOOP;
  RETURN v_level;
END;
$$;

-- ------------------------------------------------------------
-- RPC: registra il risultato di una partita in singolo
-- Il punteggio in singolo è intrinsecamente auto-dichiarato (gioco offline);
-- il server impone comunque limiti di plausibilità, monotonicità e rate limit.
-- Le classifiche multiplayer NON usano questo percorso.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_solo_game(
  p_mode TEXT,
  p_difficulty TEXT,
  p_score INTEGER,
  p_rounds INTEGER,
  p_correct INTEGER,
  p_xp INTEGER
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
  v_max_score INTEGER;
  v_max_xp INTEGER;
  v_new_xp INTEGER;
  v_level INTEGER;
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

  INSERT INTO app_private.profile_private (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE app_private.profile_private
  SET total_score = LEAST(total_score + v_score, 100000000),
      games_played = games_played + 1,
      xp = xp + p_xp,
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING xp INTO v_new_xp;

  v_level := app_private.level_from_xp(v_new_xp);

  UPDATE public.profiles
  SET level = v_level, updated_at = now()
  WHERE id = v_uid;

  INSERT INTO app_private.profile_sessions
    (user_id, mode, difficulty, score, rounds, correct_answers, xp_earned)
  VALUES
    (v_uid, p_mode, p_difficulty, v_score, v_rounds, p_correct, p_xp);

  RETURN app_private.get_my_profile();
END;
$$;

-- ------------------------------------------------------------
-- RPC: classifica pubblica
-- Espone solo aggregati (username, punteggio, partite, livello): niente email.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_range TEXT DEFAULT 'all')
RETURNS TABLE (
  user_id UUID,
  username TEXT,
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
      SELECT p.id, p.username, pr.total_score::bigint, pr.games_played::bigint, p.level
      FROM public.profiles p
      JOIN app_private.profile_private pr ON pr.user_id = p.id
      WHERE pr.games_played > 0
      ORDER BY pr.total_score DESC, p.username ASC
      LIMIT 50;
  ELSE
    RETURN QUERY
      SELECT p.id,
             p.username,
             COALESCE(sum(s.score), 0)::bigint,
             count(s.id)::bigint,
             p.level
      FROM app_private.profile_sessions s
      JOIN public.profiles p ON p.id = s.user_id
      WHERE s.ended_at >= now() - make_interval(days => CASE WHEN p_range = 'week' THEN 7 ELSE 30 END)
      GROUP BY p.id, p.username, p.level
      ORDER BY 3 DESC, p.username ASC
      LIMIT 50;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- Rimozione delle vecchie tabelle permissive
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.game_sessions CASCADE;
DROP TABLE IF EXISTS public.player_profiles CASCADE;

-- ------------------------------------------------------------
-- Permessi
-- ------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app_private FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.set_username(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_solo_game(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_leaderboard(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_username(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_solo_game(TEXT, TEXT, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(TEXT) TO anon, authenticated;
