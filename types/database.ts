// ============================================================
// Tipi per le tabelle Supabase (generati manualmente)
// ============================================================

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          email: string;
          avatar_url: string | null;
          total_score: number;
          games_played: number;
          games_won: number;
          best_streak: number;
          level: number;
          xp: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          email: string;
          avatar_url?: string | null;
          total_score?: number;
          games_played?: number;
          games_won?: number;
          best_streak?: number;
          level?: number;
          xp?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          email?: string;
          avatar_url?: string | null;
          total_score?: number;
          games_played?: number;
          games_won?: number;
          best_streak?: number;
          level?: number;
          xp?: number;
          updated_at?: string;
        };
      };
      game_sessions: {
        Row: {
          id: string;
          user_id: string | null;
          quiz_type: string;
          difficulty: string;
          total_score: number;
          questions_answered: number;
          correct_answers: number;
          started_at: string;
          ended_at: string | null;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          quiz_type: string;
          difficulty: string;
          total_score: number;
          questions_answered: number;
          correct_answers: number;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: {
          total_score?: number;
          questions_answered?: number;
          correct_answers?: number;
          ended_at?: string | null;
        };
      };
      rooms: {
        Row: {
          id: string;
          code: string;
          host_id: string;
          name: string;
          status: string;
          max_players: number;
          current_question: number;
          total_questions: number;
          quiz_type: string;
          difficulty: string;
          created_at: string;
          started_at: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          host_id: string;
          name: string;
          status?: string;
          max_players?: number;
          current_question?: number;
          total_questions?: number;
          quiz_type: string;
          difficulty: string;
          created_at?: string;
          started_at?: string | null;
        };
        Update: {
          status?: string;
          current_question?: number;
          started_at?: string | null;
        };
      };
      room_players: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          username: string;
          score: number;
          is_ready: boolean;
          is_host: boolean;
          joined_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          username: string;
          score?: number;
          is_ready?: boolean;
          is_host?: boolean;
          joined_at?: string;
        };
        Update: {
          score?: number;
          is_ready?: boolean;
        };
      };
    };
  };
}
