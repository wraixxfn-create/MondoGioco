import { createClient } from "@/lib/supabase/client";
import { generateRoomCode } from "@/lib/utils";
import { v4FallbackId } from "@/lib/utils/id";
import { generateQuiz } from "@/lib/utils/quiz-generator";
import { loadLocalPlayer } from "@/lib/services/player-store";
import type { Difficulty, QuizQuestion, QuizType, RoomStatus } from "@/types";
import type { Database } from "@/types/database";

export interface MultiplayerRoomInfo {
  id: string;
  code: string;
  hostId: string;
  name: string;
  isPublic: boolean;
  status: RoomStatus;
  maxPlayers: number;
  currentQuestion: number;
  totalQuestions: number;
  quizType: QuizType;
  difficulty: Difficulty;
  questions: QuizQuestion[];
  createdAt: string;
  startedAt: string | null;
}

export interface MultiplayerParticipant {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  score: number;
  answeredCount: number;
  isReady: boolean;
  isHost: boolean;
}

export interface CreateRoomParams {
  name: string;
  quizType: QuizType;
  difficulty: Difficulty;
  maxPlayers?: number;
  totalQuestions?: number;
  isPublic?: boolean;
}

export interface PublicRoomSummary {
  room: MultiplayerRoomInfo;
  playerCount: number;
}

type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type PlayerRow = Database["public"]["Tables"]["room_players"]["Row"];

const LOCAL_ROOMS_KEY = "mondogioco:rooms:v1";

interface LocalRoomBundle {
  room: MultiplayerRoomInfo;
  players: MultiplayerParticipant[];
}

function mapRoom(row: RoomRow): MultiplayerRoomInfo {
  return {
    id: row.id,
    code: row.code,
    hostId: row.host_id,
    name: row.name,
    isPublic: row.is_public,
    status: row.status as RoomStatus,
    maxPlayers: row.max_players,
    currentQuestion: row.current_question,
    totalQuestions: row.total_questions,
    quizType: row.quiz_type as QuizType,
    difficulty: row.difficulty as Difficulty,
    questions: Array.isArray(row.questions) ? row.questions : [],
    createdAt: row.created_at,
    startedAt: row.started_at,
  };
}

function mapPlayer(row: PlayerRow): MultiplayerParticipant {
  return {
    id: row.id,
    roomId: row.room_id,
    userId: row.user_id,
    username: row.username,
    score: row.score,
    answeredCount: row.answered_count,
    isReady: row.is_ready,
    isHost: row.is_host,
  };
}

function readLocalRooms(): Record<string, LocalRoomBundle> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_ROOMS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, LocalRoomBundle>) : {};
  } catch {
    return {};
  }
}

function writeLocalRooms(map: Record<string, LocalRoomBundle>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_ROOMS_KEY, JSON.stringify(map));
  } catch {
    // Ignorato.
  }
}

export async function listPublicRooms(): Promise<{
  rooms: PublicRoomSummary[];
  source: "cloud" | "local";
}> {
  try {
    const supabase = createClient();
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("status", "waiting")
      .eq("is_public", true)
      .gte("created_at", twoHoursAgo)
      .order("created_at", { ascending: false })
      .limit(12);

    if (!error && data) {
      const summaries: PublicRoomSummary[] = await Promise.all(
        data.map(async (row) => {
          const { count } = await supabase
            .from("room_players")
            .select("*", { count: "exact", head: true })
            .eq("room_id", row.id);
          return {
            room: mapRoom(row),
            playerCount: count ?? 1,
          };
        })
      );
      return { rooms: summaries, source: "cloud" };
    }
  } catch {
    // Passa al fallback locale.
  }

  const localMap = readLocalRooms();
  const rooms = Object.values(localMap)
    .filter((b) => b.room.status === "waiting" && b.room.isPublic)
    .map((b) => ({ room: b.room, playerCount: b.players.length }));
  return { rooms, source: "local" };
}

export async function createMultiplayerRoom(params: CreateRoomParams): Promise<{
  room: MultiplayerRoomInfo;
  players: MultiplayerParticipant[];
  source: "cloud" | "local";
}> {
  const me = loadLocalPlayer();
  const code = generateRoomCode();
  const totalQuestions = params.totalQuestions ?? 8;
  const maxPlayers = params.maxPlayers ?? 6;
  const isPublic = params.isPublic ?? true;
  const roomName = (params.name.trim() || `Sfida di ${me.username}`).slice(0, 50);
  // I quiz testuali multipiano funzionano su tutti i dispositivi in sincronia immediata.
  const effectiveType: QuizType = params.quizType === "location" ? "capital" : params.quizType;
  const questions = generateQuiz(effectiveType, params.difficulty, totalQuestions);

  try {
    const supabase = createClient();
    const { data: roomRow, error: roomErr } = await supabase
      .from("rooms")
      .insert({
        code,
        host_id: me.playerId,
        name: roomName,
        is_public: isPublic,
        status: "waiting",
        max_players: maxPlayers,
        current_question: 0,
        total_questions: questions.length,
        quiz_type: effectiveType,
        difficulty: params.difficulty,
        questions,
      })
      .select("*")
      .single();

    if (!roomErr && roomRow) {
      const { data: hostPlayer, error: playerErr } = await supabase
        .from("room_players")
        .upsert(
          {
            room_id: roomRow.id,
            user_id: me.playerId,
            username: me.username,
            score: 0,
            answered_count: 0,
            is_ready: true,
            is_host: true,
          },
          { onConflict: "room_id,user_id" }
        )
        .select("*")
        .single();

      if (!playerErr && hostPlayer) {
        return {
          room: mapRoom(roomRow),
          players: [mapPlayer(hostPlayer)],
          source: "cloud",
        };
      }
    }
  } catch {
    // Fallback locale.
  }

  const roomId = v4FallbackId();
  const localRoom: MultiplayerRoomInfo = {
    id: roomId,
    code,
    hostId: me.playerId,
    name: roomName,
    isPublic,
    status: "waiting",
    maxPlayers,
    currentQuestion: 0,
    totalQuestions: questions.length,
    quizType: effectiveType,
    difficulty: params.difficulty,
    questions,
    createdAt: new Date().toISOString(),
    startedAt: null,
  };
  const hostEntry: MultiplayerParticipant = {
    id: v4FallbackId(),
    roomId,
    userId: me.playerId,
    username: me.username,
    score: 0,
    answeredCount: 0,
    isReady: true,
    isHost: true,
  };
  const map = readLocalRooms();
  map[roomId] = { room: localRoom, players: [hostEntry] };
  writeLocalRooms(map);
  return { room: localRoom, players: [hostEntry], source: "local" };
}

export async function joinMultiplayerRoom(rawCode: string): Promise<{
  ok: boolean;
  room?: MultiplayerRoomInfo;
  players?: MultiplayerParticipant[];
  source: "cloud" | "local";
  error?: string;
}> {
  const code = rawCode.trim().toUpperCase();
  if (code.length !== 6) {
    return {
      ok: false,
      source: "local",
      error: "Il codice stanza deve avere 6 caratteri.",
    };
  }
  const me = loadLocalPlayer();

  try {
    const supabase = createClient();
    const { data: roomRow, error: roomErr } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code)
      .maybeSingle();

    if (!roomErr && roomRow) {
      if (roomRow.status === "finished") {
        return { ok: false, source: "cloud", error: "Questa partita è già terminata." };
      }

      const { data: existingPlayers } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomRow.id);

      const alreadyIn = existingPlayers?.some((p) => p.user_id === me.playerId);
      if (!alreadyIn && (existingPlayers?.length ?? 0) >= roomRow.max_players) {
        return { ok: false, source: "cloud", error: "La stanza è al completo." };
      }

      await supabase.from("room_players").upsert(
        {
          room_id: roomRow.id,
          user_id: me.playerId,
          username: me.username,
          is_host: roomRow.host_id === me.playerId,
          is_ready: roomRow.host_id === me.playerId,
        },
        { onConflict: "room_id,user_id" }
      );

      const { data: updatedPlayers } = await supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomRow.id)
        .order("score", { ascending: false });

      return {
        ok: true,
        room: mapRoom(roomRow),
        players: (updatedPlayers ?? []).map(mapPlayer),
        source: "cloud",
      };
    }
  } catch {
    // Controlla eventuali stanze locali.
  }

  const localMap = readLocalRooms();
  const found = Object.values(localMap).find((b) => b.room.code === code);
  if (!found) {
    return {
      ok: false,
      source: "local",
      error: `Nessuna stanza trovata con il codice ${code}.`,
    };
  }
  if (!found.players.some((p) => p.userId === me.playerId)) {
    found.players.push({
      id: v4FallbackId(),
      roomId: found.room.id,
      userId: me.playerId,
      username: me.username,
      score: 0,
      answeredCount: 0,
      isReady: true,
      isHost: false,
    });
    writeLocalRooms(localMap);
  }
  return { ok: true, room: found.room, players: found.players, source: "local" };
}

export async function refreshRoomSnapshot(roomId: string): Promise<{
  room: MultiplayerRoomInfo;
  players: MultiplayerParticipant[];
} | null> {
  try {
    const supabase = createClient();
    const [{ data: roomRow }, { data: playerRows }] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
      supabase
        .from("room_players")
        .select("*")
        .eq("room_id", roomId)
        .order("score", { ascending: false }),
    ]);
    if (roomRow) {
      return {
        room: mapRoom(roomRow),
        players: (playerRows ?? []).map(mapPlayer),
      };
    }
  } catch {
    // Fallback locale.
  }

  const local = readLocalRooms()[roomId];
  return local ?? null;
}

export async function togglePlayerReady(roomId: string, ready: boolean): Promise<void> {
  const me = loadLocalPlayer();
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("room_players")
      .update({ is_ready: ready })
      .eq("room_id", roomId)
      .eq("user_id", me.playerId);
    if (!error) return;
  } catch {
    // Fallback locale.
  }

  const map = readLocalRooms();
  const bundle = map[roomId];
  if (bundle) {
    bundle.players = bundle.players.map((p) =>
      p.userId === me.playerId ? { ...p, isReady: ready } : p
    );
    writeLocalRooms(map);
  }
}

export async function startMultiplayerMatch(roomId: string): Promise<void> {
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("rooms")
      .update({
        status: "playing",
        current_question: 0,
        started_at: new Date().toISOString(),
      })
      .eq("id", roomId);
    if (!error) return;
  } catch {
    // Fallback locale.
  }

  const map = readLocalRooms();
  const bundle = map[roomId];
  if (bundle) {
    bundle.room = {
      ...bundle.room,
      status: "playing",
      currentQuestion: 0,
      startedAt: new Date().toISOString(),
    };
    writeLocalRooms(map);
  }
}

export async function submitMultiplayerPoints(
  roomId: string,
  newScore: number,
  answeredCount: number
): Promise<void> {
  const me = loadLocalPlayer();
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("room_players")
      .update({
        score: newScore,
        answered_count: answeredCount,
      })
      .eq("room_id", roomId)
      .eq("user_id", me.playerId);
    if (!error) return;
  } catch {
    // Fallback locale.
  }

  const map = readLocalRooms();
  const bundle = map[roomId];
  if (bundle) {
    bundle.players = bundle.players.map((p) =>
      p.userId === me.playerId ? { ...p, score: newScore, answeredCount } : p
    );
    writeLocalRooms(map);
  }
}

export async function advanceMultiplayerQuestion(
  roomId: string,
  nextIndex: number,
  totalQuestions: number
): Promise<void> {
  const finished = nextIndex >= totalQuestions;
  try {
    const supabase = createClient();
    const { error } = await supabase
      .from("rooms")
      .update({
        current_question: finished ? totalQuestions - 1 : nextIndex,
        status: finished ? "finished" : "playing",
      })
      .eq("id", roomId);
    if (!error) return;
  } catch {
    // Fallback locale.
  }

  const map = readLocalRooms();
  const bundle = map[roomId];
  if (bundle) {
    bundle.room = {
      ...bundle.room,
      currentQuestion: finished ? totalQuestions - 1 : nextIndex,
      status: finished ? "finished" : "playing",
    };
    writeLocalRooms(map);
  }
}

export async function leaveMultiplayerRoom(roomId: string): Promise<void> {
  const me = loadLocalPlayer();
  try {
    const supabase = createClient();
    await supabase.from("room_players").delete().eq("room_id", roomId).eq("user_id", me.playerId);
  } catch {
    // Ignorato.
  }
}

export function subscribeToRoomState(roomId: string, onChange: () => void): () => void {
  let active = true;
  const interval = setInterval(() => {
    if (active) onChange();
  }, 2500);

  let cleanupChannel = () => {};
  try {
    const supabase = createClient();
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        () => {
          if (active) onChange();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => {
          if (active) onChange();
        }
      )
      .subscribe();

    cleanupChannel = () => {
      void supabase.removeChannel(channel);
    };
  } catch {
    // In assenza di WebSocket resta attivo il refresh periodico.
  }

  return () => {
    active = false;
    clearInterval(interval);
    cleanupChannel();
  };
}
