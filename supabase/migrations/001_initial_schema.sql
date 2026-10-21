-- ============================================================
-- MondoGioco — Schema Database Supabase
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Profili autenticati (collegati a auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0),
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  games_won INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
  best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
BEGIN
  base_username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'Esploratore'
  );
  final_username := base_username;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username) THEN
    final_username := base_username || '_' || substr(replace(NEW.id::text, '-', ''), 1, 5);
  END IF;

  INSERT INTO public.profiles (id, username, email)
  VALUES (NEW.id, final_username, COALESCE(NEW.email, ''))
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Classifica globale e statistiche giocatori (ospiti + registrati)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.player_profiles (
  player_id UUID PRIMARY KEY,
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  username TEXT NOT NULL CHECK (char_length(username) BETWEEN 2 AND 32),
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100000000),
  games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
  games_won INTEGER NOT NULL DEFAULT 0 CHECK (games_won >= 0),
  best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  bullseyes INTEGER NOT NULL DEFAULT 0 CHECK (bullseyes >= 0),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_player_profiles_score ON public.player_profiles(total_score DESC);

-- ============================================================
-- Sessioni di gioco
-- ============================================================
CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  player_id UUID,
  username TEXT NOT NULL DEFAULT 'Giocatore',
  quiz_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 500000),
  questions_answered INTEGER NOT NULL DEFAULT 0 CHECK (questions_answered >= 0),
  correct_answers INTEGER NOT NULL DEFAULT 0 CHECK (correct_answers >= 0),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_user ON public.game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_player ON public.game_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_ended ON public.game_sessions(ended_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_score ON public.game_sessions(total_score DESC);

-- ============================================================
-- Stanze multiplayer
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE CHECK (char_length(code) = 6),
  host_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  is_public BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 6 CHECK (max_players BETWEEN 2 AND 8),
  current_question INTEGER NOT NULL DEFAULT 0 CHECK (current_question >= 0),
  total_questions INTEGER NOT NULL DEFAULT 10 CHECK (total_questions BETWEEN 3 AND 25),
  quiz_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status, created_at DESC);

-- ============================================================
-- Giocatori nelle stanze
-- ============================================================
CREATE TABLE IF NOT EXISTS public.room_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  username TEXT NOT NULL CHECK (char_length(username) BETWEEN 2 AND 32),
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100000),
  answered_count INTEGER NOT NULL DEFAULT 0 CHECK (answered_count >= 0),
  is_ready BOOLEAN NOT NULL DEFAULT false,
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_players_room ON public.room_players(room_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profili visibili a tutti" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Inserimento proprio profilo" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Aggiornamento solo proprietario" ON public.profiles FOR UPDATE USING (auth.uid() = id);

ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Classifica visibile a tutti" ON public.player_profiles FOR SELECT USING (true);
CREATE POLICY "Registrazione punteggio giocatore" ON public.player_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Aggiornamento punteggio giocatore" ON public.player_profiles FOR UPDATE USING (true);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sessioni visibili per classifiche" ON public.game_sessions FOR SELECT USING (true);
CREATE POLICY "Inserimento sessioni di gioco" ON public.game_sessions FOR INSERT WITH CHECK (true);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stanze visibili" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Creazione stanze aperta" ON public.rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Aggiornamento stanza attivo" ON public.rooms FOR UPDATE USING (true);

ALTER TABLE public.room_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Giocatori stanza visibili" ON public.room_players FOR SELECT USING (true);
CREATE POLICY "Ingresso in stanza aperto" ON public.room_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Aggiornamento stato giocatore in stanza" ON public.room_players FOR UPDATE USING (true);
CREATE POLICY "Uscita da stanza" ON public.room_players FOR DELETE USING (true);

-- ============================================================
-- Realtime per multiplayer in tempo reale
-- ============================================================
ALTER TABLE public.rooms REPLICA IDENTITY FULL;
ALTER TABLE public.room_players REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_players;
