// ============================================================
// Tipi delle tabelle e funzioni Supabase esposte (schema `public`)
// ============================================================
// NB: lo schema `app_private` (risposte corrette, banca domande, statistiche
// private) NON è esposto da PostgREST e quindi non compare qui.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type RoomPhase = "lobby" | "round_active" | "round_reveal" | "finished" | "closed";
export type MemberConnection = "connected" | "disconnected" | "left" | "kicked";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          level: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          level?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          username?: string;
          avatar_url?: string | null;
          level?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      game_settings: {
        Row: {
          id: number;
          min_players: number;
          default_max_players: number;
          max_players_limit: number;
          min_rounds: number;
          default_rounds: number;
          max_rounds: number;
          min_round_seconds: number;
          default_round_seconds: number;
          max_round_seconds: number;
          reveal_seconds: number;
          answer_grace_ms: number;
          lobby_ttl_seconds: number;
          room_max_duration_seconds: number;
          reconnect_grace_seconds: number;
          host_handover_seconds: number;
          empty_room_ttl_seconds: number;
          finished_ttl_seconds: number;
          archived_retention_seconds: number;
          client_poll_ms: number;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      game_rooms: {
        Row: {
          id: string;
          code: string;
          host_id: string;
          name: string;
          quiz_type: string;
          difficulty: string;
          phase: RoomPhase;
          max_players: number;
          total_rounds: number;
          round_seconds: number;
          current_round: number;
          version: number;
          created_at: string;
          lobby_expires_at: string;
          started_at: string | null;
          phase_started_at: string;
          round_started_at: string | null;
          round_ends_at: string | null;
          reveal_ends_at: string | null;
          finished_at: string | null;
          closed_at: string | null;
          closed_reason: string | null;
          stats_recorded: boolean;
          last_activity_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      game_room_members: {
        Row: {
          room_id: string;
          user_id: string;
          username: string;
          is_host: boolean;
          is_ready: boolean;
          score: number;
          correct_count: number;
          answer_count: number;
          total_response_ms: number;
          connection: MemberConnection;
          joined_at: string;
          last_seen_at: string;
          disconnected_at: string | null;
          left_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      game_rounds: {
        Row: {
          room_id: string;
          round_index: number;
          quiz_type: string;
          prompt: string;
          options: Json;
          country_name: string;
          country_flag: string | null;
          country_iso: string | null;
          round_seconds: number;
          started_at: string | null;
          ends_at: string | null;
          revealed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      game_answers: {
        Row: {
          id: string;
          room_id: string;
          round_index: number;
          user_id: string;
          answer: string;
          is_correct: boolean;
          points: number;
          response_ms: number;
          answered_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      game_events: {
        Row: {
          id: number;
          room_id: string;
          event_type: string;
          actor_id: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      server_time: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_my_profile: {
        Args: Record<string, never>;
        Returns: Json;
      };
      set_username: {
        Args: { p_username: string };
        Returns: Json;
      };
      record_solo_game: {
        Args: {
          p_mode: string;
          p_difficulty: string | null;
          p_score: number;
          p_rounds: number;
          p_correct: number;
          p_xp: number;
        };
        Returns: Json;
      };
      get_leaderboard: {
        Args: { p_range?: string };
        Returns: {
          user_id: string;
          username: string;
          total_score: number;
          games_played: number;
          level: number;
        }[];
      };
      create_room: {
        Args: {
          p_name: string;
          p_quiz_type: string;
          p_difficulty: string;
          p_total_rounds?: number | null;
          p_max_players?: number | null;
          p_round_seconds?: number | null;
        };
        Returns: Json;
      };
      join_room: {
        Args: { p_code: string };
        Returns: Json;
      };
      reconnect_room: {
        Args: { p_room_id: string };
        Returns: Json;
      };
      heartbeat: {
        Args: { p_room_id: string };
        Returns: Json;
      };
      sync_room: {
        Args: { p_room_id: string };
        Returns: Json;
      };
      get_room_state: {
        Args: { p_room_id: string };
        Returns: Json;
      };
      set_ready: {
        Args: { p_room_id: string; p_ready: boolean };
        Returns: Json;
      };
      start_game: {
        Args: { p_room_id: string };
        Returns: Json;
      };
      submit_answer: {
        Args: { p_room_id: string; p_round_index: number; p_answer: string };
        Returns: Json;
      };
      leave_room: {
        Args: { p_room_id: string };
        Returns: Json;
      };
      kick_member: {
        Args: { p_room_id: string; p_user_id: string };
        Returns: Json;
      };
      close_room: {
        Args: { p_room_id: string };
        Returns: Json;
      };
      maintenance_tick: {
        Args: Record<string, never>;
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
