// ============================================================
// Tipi per le tabelle Supabase
// ============================================================

import type { QuizQuestion } from "@/types";

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
          email?: string;
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
        Relationships: [];
      };
      player_profiles: {
        Row: {
          player_id: string;
          auth_user_id: string | null;
          username: string;
          total_score: number;
          games_played: number;
          games_won: number;
          best_streak: number;
          bullseyes: number;
          level: number;
          xp: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          player_id: string;
          auth_user_id?: string | null;
          username: string;
          total_score?: number;
          games_played?: number;
          games_won?: number;
          best_streak?: number;
          bullseyes?: number;
          level?: number;
          xp?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          auth_user_id?: string | null;
          username?: string;
          total_score?: number;
          games_played?: number;
          games_won?: number;
          best_streak?: number;
          bullseyes?: number;
          level?: number;
          xp?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_sessions: {
        Row: {
          id: string;
          user_id: string | null;
          player_id: string | null;
          username: string;
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
          player_id?: string | null;
          username?: string;
          quiz_type: string;
          difficulty: string;
          total_score?: number;
          questions_answered?: number;
          correct_answers?: number;
          started_at?: string;
          ended_at?: string | null;
        };
        Update: {
          total_score?: number;
          questions_answered?: number;
          correct_answers?: number;
          ended_at?: string | null;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          code: string;
          host_id: string;
          name: string;
          is_public: boolean;
          status: string;
          max_players: number;
          current_question: number;
          total_questions: number;
          quiz_type: string;
          difficulty: string;
          questions: QuizQuestion[];
          created_at: string;
          started_at: string | null;
        };
        Insert: {
          id?: string;
          code: string;
          host_id: string;
          name: string;
          is_public?: boolean;
          status?: string;
          max_players?: number;
          current_question?: number;
          total_questions?: number;
          quiz_type: string;
          difficulty: string;
          questions?: QuizQuestion[];
          created_at?: string;
          started_at?: string | null;
        };
        Update: {
          status?: string;
          current_question?: number;
          started_at?: string | null;
        };
        Relationships: [];
      };
      room_players: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          username: string;
          score: number;
          answered_count: number;
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
          answered_count?: number;
          is_ready?: boolean;
          is_host?: boolean;
          joined_at?: string;
        };
        Update: {
          username?: string;
          score?: number;
          answered_count?: number;
          is_ready?: boolean;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
