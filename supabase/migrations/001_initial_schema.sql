-- ============================================================
-- MondoGioco — Schema Database Supabase
-- ============================================================
-- Esegui questa migration nel tuo progetto Supabase tramite
-- il SQL Editor oppure con il CLI di Supabase.

-- Abilita l'estensione UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Profili utente (estensione di auth.users)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  avatar_url TEXT,
  total_score INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Crea profilo automaticamente alla registrazione
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Sessioni di gioco
-- ============================================================
CREATE TABLE game_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  quiz_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0,
  questions_answered INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_game_sessions_user ON game_sessions(user_id);
CREATE INDEX idx_game_sessions_score ON game_sessions(total_score DESC);

-- ============================================================
-- Stanze multiplayer
-- ============================================================
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 6 CHECK (max_players BETWEEN 2 AND 8),
  current_question INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 10,
  quiz_type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ
);

CREATE INDEX idx_rooms_code ON rooms(code);
CREATE INDEX idx_rooms_status ON rooms(status);

-- ============================================================
-- Giocatori nelle stanze
-- ============================================================
CREATE TABLE room_players (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  is_ready BOOLEAN NOT NULL DEFAULT false,
  is_host BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX idx_room_players_room ON room_players(room_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Profili: tutti possono leggere, solo proprietario può modificare
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profili visibili a tutti" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Aggiornamento solo proprietario" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Sessioni di gioco: utente vede le proprie, può inserirne
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sessioni proprie visibili" ON game_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Inserimento sessioni" ON game_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Stanze: tutti possono leggere quelle attive, host può modificare
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Stanze visibili" ON rooms
  FOR SELECT USING (true);

CREATE POLICY "Creazione stanze" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Aggiornamento stanza host" ON rooms
  FOR UPDATE USING (auth.uid() = host_id);

-- Giocatori stanze: tutti possono leggere, inserimento libero
ALTER TABLE room_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Giocatori visibili" ON room_players
  FOR SELECT USING (true);

CREATE POLICY "Unirsi a stanza" ON room_players
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Aggiorna proprio punteggio" ON room_players
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================
-- Realtime: abilita per stanze multiplayer
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
