/**
 * Client multiplayer online di MondoGioco.
 *
 * Regole di progetto
 * ------------------
 * 1. Il client NON scrive mai nelle tabelle di gioco: chiama solo RPC.
 * 2. Non esiste alcun fallback "stanza locale" spacciato per multiplayer: se
 *    Supabase non è configurato o la sessione non è disponibile, la funzione
 *    restituisce un errore esplicito.
 * 3. Lo stato mostrato deriva sempre da uno snapshot restituito dal server
 *    (timestamp, punteggi, fase, classifica). Gli eventi Realtime servono solo
 *    come "campanello" per richiedere uno snapshot aggiornato.
 * 4. Il timer del round si calcola dai timestamp del server con l'offset di
 *    clock stimato via round-trip (`syncServerClock`).
 */
import { getBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, SUPABASE_SETUP_MESSAGE } from "@/lib/supabase/config";
import type { Difficulty, QuizType } from "@/types";

// ============================================================
// Tipi dello snapshot (rispecchiano il JSON restituito dal server)
// ============================================================

export type RoomPhase = "lobby" | "round_active" | "round_reveal" | "finished" | "closed";
export type MemberConnection = "connected" | "disconnected" | "left" | "kicked";

export interface RoomInfo {
  id: string;
  code: string;
  name: string;
  host_id: string;
  quiz_type: QuizType;
  difficulty: Difficulty;
  phase: RoomPhase;
  max_players: number;
  total_rounds: number;
  round_seconds: number;
  current_round: number;
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
  version: number;
}

export interface MemberInfo {
  user_id: string;
  username: string;
  is_host: boolean;
  is_ready: boolean;
  score: number;
  correct_count: number;
  answer_count: number;
  connection: MemberConnection;
  last_seen_at: string;
}

export interface MeInfo {
  user_id: string;
  username: string;
  is_host: boolean;
  is_ready: boolean;
  score: number;
  correct_count: number;
  answer_count: number;
  connection: MemberConnection;
  answered_current_round: boolean;
}

export interface RoundView {
  index: number;
  quiz_type: QuizType;
  prompt: string;
  options: string[];
  country_name: string;
  country_flag: string | null;
  country_iso: string | null;
  started_at: string | null;
  ends_at: string | null;
  answered_count: number;
  connected_count: number;
}

export interface RevealResult {
  user_id: string;
  username: string;
  answer: string;
  is_correct: boolean;
  points: number;
  response_ms: number;
}

export interface RevealView {
  round_index: number;
  correct_answer: string;
  revealed_at: string | null;
  ends_at: string | null;
  results: RevealResult[];
}

export interface StandingInfo {
  user_id: string;
  username: string;
  score: number;
  correct_count: number;
  rank: number;
  is_host: boolean;
}

export interface RoomSettingsSnapshot {
  client_poll_ms: number;
  reveal_seconds: number;
  answer_grace_ms: number;
  reconnect_grace_seconds: number;
  host_handover_seconds: number;
  min_players: number;
  max_players_limit: number;
  min_rounds: number;
  max_rounds: number;
  min_round_seconds: number;
  max_round_seconds: number;
}

export interface RoomSnapshot {
  ok: true;
  server_time: string;
  room: RoomInfo;
  me: MeInfo | null;
  players: MemberInfo[];
  standings: StandingInfo[];
  round: RoundView | null;
  reveal: RevealView | null;
  settings: RoomSettingsSnapshot;
}

export type RoomResult = { ok: true; snapshot: RoomSnapshot } | { ok: false; error: string };

export interface MultiplayerIdentity {
  userId: string;
  username: string;
  isAnonymous: boolean;
}

export interface GameSettings {
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
  client_poll_ms: number;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  min_players: 2,
  default_max_players: 6,
  max_players_limit: 8,
  min_rounds: 3,
  default_rounds: 8,
  max_rounds: 15,
  min_round_seconds: 10,
  default_round_seconds: 25,
  max_round_seconds: 90,
  reveal_seconds: 8,
  client_poll_ms: 3000,
};

// ============================================================
// Errori
// ============================================================

export const MULTIPLAYER_ERRORS: Record<string, string> = {
  NOT_CONFIGURED: SUPABASE_SETUP_MESSAGE,
  NETWORK: "Connessione a Supabase non riuscita. Controlla la rete e riprova.",
  ANONYMOUS_DISABLED:
    "Accesso anonimo disattivato su Supabase. Attivalo in Authentication → Providers → Anonymous (vedi docs/SUPABASE_SETUP.md).",
  SESSION: "Sessione non valida o scaduta. Ricarica la pagina per riconnetterti.",
  "MG401:authentication_required": "Devi essere autenticato per giocare online.",
  "MG403:not_a_member": "Non fai parte di questa stanza (o ne sei uscito).",
  "MG403:not_allowed": "Non hai i permessi per restare in questa stanza.",
  "MG403:host_only": "Solo l'host può eseguire questa azione.",
  "MG403:profile_missing": "Profilo non ancora creato. Attendi un istante e riprova.",
  "MG403:permission_denied": "Permesso negato dal database.",
  "MG404:room_not_found": "Codice stanza non valido o stanza non più disponibile.",
  "MG404:member_not_found": "Giocatore non presente nella stanza.",
  "MG400:invalid_room_name": "Il nome della stanza deve avere tra 3 e 40 caratteri.",
  "MG400:invalid_quiz_type": "Tipo di quiz non valido.",
  "MG400:invalid_difficulty": "Difficoltà non valida.",
  "MG400:invalid_round_count": "Numero di round non valido.",
  "MG400:invalid_max_players": "Numero di giocatori non valido.",
  "MG400:invalid_round_duration": "Durata del round non valida.",
  "MG400:invalid_answer": "Risposta non valida: scegli una delle opzioni proposte.",
  "MG400:cannot_kick_self": "Non puoi espellere te stesso.",
  "MG400:invalid_username": "Nome non valido: 3-20 caratteri (lettere, numeri, spazi, - e _).",
  "MG400:invalid_mode": "Modalità di gioco non valida.",
  "MG400:invalid_score": "Punteggio non plausibile: il server ha rifiutato il salvataggio.",
  "MG400:invalid_rounds": "Numero di round non valido.",
  "MG400:invalid_correct_count": "Numero di risposte corrette non valido.",
  "MG400:invalid_xp": "XP non plausibili: il server ha rifiutato il salvataggio.",
  "MG400:invalid_range": "Intervallo classifica non valido.",
  "MG409:duplicate_answer": "Hai già risposto a questo round.",
  "MG409:wrong_round": "Il round è già cambiato: risposta rifiutata.",
  "MG409:round_closed": "Tempo scaduto: risposta rifiutata.",
  "MG409:round_not_active": "Il round non è attivo.",
  "MG409:game_already_started": "La partita è già iniziata.",
  "MG409:room_closed": "La stanza è stata chiusa.",
  "MG409:room_full": "La stanza è al completo.",
  "MG409:not_enough_players": "Servono almeno 2 giocatori connessi.",
  "MG409:players_not_ready": "Tutti i giocatori devono essere pronti.",
  "MG409:not_connected": "Sei disconnesso: ricarica la pagina per rientrare.",
  "MG409:username_taken": "Nickname già in uso: scegline un altro.",
  "MG429:rate_limited": "Troppe richieste in poco tempo. Attendi qualche secondo.",
  "MG500:code_generation_failed": "Impossibile generare un codice stanza: riprova.",
  "MG500:round_generation_failed": "Impossibile preparare le domande: riprova.",
  "MG500:bad_response": "Risposta del server non valida.",
};

const ERROR_ALIASES: Record<string, string> = {
  "MG400:invalid_rounds": "MG400:invalid_round_count",
};

export function describeMultiplayerError(code: string | null | undefined): string {
  if (!code) return "Errore sconosciuto.";
  const normalized = ERROR_ALIASES[code] ?? code;
  return MULTIPLAYER_ERRORS[normalized] ?? `Errore multiplayer (${code}).`;
}

function fail(error: string): RoomResult {
  return { ok: false, error };
}

function isConfigured(): boolean {
  return isSupabaseConfigured;
}

export function isMultiplayerAvailable(): boolean {
  return isConfigured();
}

/**
 * Traduce gli errori di PostgREST/fetch in codici interni stabili.
 */
export function mapTransportError(message: string | null | undefined): string {
  if (!message) return "NETWORK";
  const mg = message.match(/MG\d{3}:[a-z_]+/);
  if (mg) return mg[0];
  // Un rifiuto di RLS/autorizzazione NON è un problema di rete: mostrarlo
  // come "NETWORK" faceva riprovare all'infinito e nascondeva la causa
  // reale (policy mancante o sessione con ruolo sbagliato).
  if (/permission denied|row-level security|not authorized/i.test(message)) {
    return "MG403:permission_denied";
  }
  if (/jwt expired|invalid jwt|invalid claim|no session/i.test(message)) return "SESSION";
  if (/Failed to fetch|NetworkError|AbortError|timeout|fetch|offline/i.test(message)) {
    return "NETWORK";
  }
  return "NETWORK";
}

export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

export function isValidRoomCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}$/.test(code);
}

// ============================================================
// Orologio server
// ============================================================

let clockOffsetMs = 0;

export function getServerClockOffset(): number {
  return clockOffsetMs;
}

export function serverNowMs(): number {
  return Date.now() + clockOffsetMs;
}

export function msRemaining(isoDate: string | null | undefined, now = serverNowMs()): number {
  if (!isoDate) return 0;
  const target = new Date(isoDate).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, target - now);
}

export async function syncServerClock(): Promise<number | null> {
  if (!isConfigured()) return null;
  const supabase = getBrowserClient();
  if (!supabase) return null;
  try {
    const before = performance.now();
    const { data, error } = await supabase.rpc("server_time");
    const after = performance.now();
    if (error || !data) return null;
    const roundTrip = after - before;
    const serverMs = new Date(data).getTime() + roundTrip / 2;
    clockOffsetMs = serverMs - Date.now();
    return clockOffsetMs;
  } catch {
    return null;
  }
}

/**
 * Allinea l'orologio usando un timestamp ricevuto in uno snapshot.
 * Meno preciso di `syncServerClock` (non conosce il round-trip), ma evita
 * derive durante una partita lunga.
 */
export function applyServerTimestamp(isoDate: string | null | undefined): void {
  if (!isoDate) return;
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) return;
  clockOffsetMs = timestamp - Date.now();
}

// ============================================================
// Identità (sessione Supabase, anche anonima)
// ============================================================

export async function ensureMultiplayerIdentity(): Promise<
  { ok: true; identity: MultiplayerIdentity } | { ok: false; error: string }
> {
  if (!isConfigured()) return { ok: false, error: "NOT_CONFIGURED" };
  const supabase = getBrowserClient();
  if (!supabase) return { ok: false, error: "NOT_CONFIGURED" };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    let user = sessionData.session?.user ?? null;

    if (!user) {
      // Gli ospiti ricevono una vera sessione Supabase (ruolo `authenticated`),
      // necessaria perché RLS e autorizzazioni funzionino davvero.
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        return {
          ok: false,
          error: /anonymous/i.test(error.message) ? "ANONYMOUS_DISABLED" : "SESSION",
        };
      }
      user = data.user;
    }
    if (!user) return { ok: false, error: "SESSION" };

    const { data: profile, error: profileError } = await supabase.rpc("get_my_profile");
    if (profileError) return { ok: false, error: mapTransportError(profileError.message) };

    const username =
      profile && typeof profile === "object" && !Array.isArray(profile)
        ? String((profile as { username?: string }).username ?? "Esploratore")
        : "Esploratore";

    return {
      ok: true,
      identity: {
        userId: user.id,
        username,
        isAnonymous: !user.email,
      },
    };
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

// ============================================================
// Chiamate RPC
// ============================================================

async function callRoomRpc(
  functionName:
    | "create_room"
    | "join_room"
    | "reconnect_room"
    | "heartbeat"
    | "sync_room"
    | "get_room_state"
    | "set_ready"
    | "start_game"
    | "submit_answer"
    | "leave_room"
    | "kick_member"
    | "close_room",
  args: Record<string, unknown>
): Promise<RoomResult> {
  if (!isConfigured()) return fail("NOT_CONFIGURED");
  const supabase = getBrowserClient();
  if (!supabase) return fail("NOT_CONFIGURED");

  try {
    const { data, error } = await supabase.rpc(functionName, args as never);
    if (error) return fail(mapTransportError(error.message));
    if (!data || typeof data !== "object" || Array.isArray(data)) return fail("MG500:bad_response");

    const payload = data as Record<string, unknown>;
    if (payload.ok === false) {
      return fail(typeof payload.error === "string" ? payload.error : "MG500:bad_response");
    }
    return { ok: true, snapshot: payload as unknown as RoomSnapshot };
  } catch {
    return fail("NETWORK");
  }
}

export interface CreateRoomOptions {
  name: string;
  quizType: QuizType;
  difficulty: Difficulty;
  totalRounds?: number;
  maxPlayers?: number;
  roundSeconds?: number;
}

export async function createMultiplayerRoom(options: CreateRoomOptions): Promise<RoomResult> {
  return callRoomRpc("create_room", {
    p_name: options.name,
    p_quiz_type: options.quizType,
    p_difficulty: options.difficulty,
    p_total_rounds: options.totalRounds ?? null,
    p_max_players: options.maxPlayers ?? null,
    p_round_seconds: options.roundSeconds ?? null,
  });
}

export async function joinMultiplayerRoom(code: string): Promise<RoomResult> {
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) return fail("MG404:room_not_found");
  return callRoomRpc("join_room", { p_code: normalized });
}

export async function reconnectToRoom(roomId: string): Promise<RoomResult> {
  return callRoomRpc("reconnect_room", { p_room_id: roomId });
}

export async function fetchRoomState(roomId: string): Promise<RoomResult> {
  return callRoomRpc("get_room_state", { p_room_id: roomId });
}

export async function syncRoom(roomId: string): Promise<RoomResult> {
  return callRoomRpc("sync_room", { p_room_id: roomId });
}

export async function sendHeartbeat(roomId: string): Promise<RoomResult> {
  return callRoomRpc("heartbeat", { p_room_id: roomId });
}

export async function setPlayerReady(roomId: string, ready: boolean): Promise<RoomResult> {
  return callRoomRpc("set_ready", { p_room_id: roomId, p_ready: ready });
}

export async function startMultiplayerGame(roomId: string): Promise<RoomResult> {
  return callRoomRpc("start_game", { p_room_id: roomId });
}

export async function submitMultiplayerAnswer(
  roomId: string,
  roundIndex: number,
  answer: string
): Promise<RoomResult> {
  return callRoomRpc("submit_answer", {
    p_room_id: roomId,
    p_round_index: roundIndex,
    p_answer: answer,
  });
}

export async function leaveMultiplayerRoom(roomId: string): Promise<RoomResult> {
  return callRoomRpc("leave_room", { p_room_id: roomId });
}

export async function closeMultiplayerRoom(roomId: string): Promise<RoomResult> {
  return callRoomRpc("close_room", { p_room_id: roomId });
}

export async function kickRoomMember(roomId: string, userId: string): Promise<RoomResult> {
  return callRoomRpc("kick_member", { p_room_id: roomId, p_user_id: userId });
}

// ============================================================
// Impostazioni di gioco (limiti configurabili lato server)
// ============================================================

export async function fetchGameSettings(): Promise<GameSettings | null> {
  if (!isConfigured()) return null;
  const supabase = getBrowserClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("game_settings")
      .select(
        "min_players, default_max_players, max_players_limit, min_rounds, default_rounds, max_rounds, min_round_seconds, default_round_seconds, max_round_seconds, reveal_seconds, client_poll_ms"
      )
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return null;
    return data as GameSettings;
  } catch {
    return null;
  }
}

// ============================================================
// Manutenzione (stanze abbandonate)
// ============================================================

export async function runRoomMaintenance(): Promise<boolean> {
  if (!isConfigured()) return false;
  const supabase = getBrowserClient();
  if (!supabase) return false;
  try {
    const { error } = await supabase.rpc("maintenance_tick");
    return !error;
  } catch {
    return false;
  }
}

// ============================================================
// Realtime (solo trigger: lo stato arriva dalle RPC)
// ============================================================

export type RealtimeStatus = "connecting" | "subscribed" | "error" | "closed";

export function subscribeToRoom(
  roomId: string,
  handlers: { onChange: () => void; onStatus?: (status: RealtimeStatus) => void }
): () => void {
  const supabase = getBrowserClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
      () => handlers.onChange()
    )
    // `game_room_members` non è più leggibile dai client (migrazione 006:
    // i punteggi live non devono trapelare) e non è nella publication.
    // Ogni cambio di membri aggiorna `game_rooms.version`, già ascoltata.
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_events", filter: `room_id=eq.${roomId}` },
      () => handlers.onChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_rounds", filter: `room_id=eq.${roomId}` },
      () => handlers.onChange()
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") handlers.onStatus?.("subscribed");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") handlers.onStatus?.("error");
      else if (status === "CLOSED") handlers.onStatus?.("closed");
      else handlers.onStatus?.("connecting");
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

// ============================================================
// Stanza attiva (per riconnessione dopo un refresh)
// ============================================================

const ACTIVE_ROOM_KEY = "mondogioco:multiplayer:active-room:v1";
const ACTIVE_ROOM_TTL_MS = 6 * 3600_000;

export interface RememberedRoom {
  roomId: string;
  code: string;
  savedAt: number;
}

export function rememberActiveRoom(roomId: string, code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ACTIVE_ROOM_KEY,
      JSON.stringify({ roomId, code, savedAt: Date.now() } satisfies RememberedRoom)
    );
  } catch {
    // Storage non disponibile.
  }
}

export function getRememberedRoom(): RememberedRoom | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_ROOM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedRoom>;
    if (!parsed.roomId || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > ACTIVE_ROOM_TTL_MS) return null;
    return { roomId: parsed.roomId, code: parsed.code ?? "", savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function forgetActiveRoom(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_ROOM_KEY);
  } catch {
    // Ignorato.
  }
}

// ============================================================
// Helper di presentazione
// ============================================================

export function phaseLabel(phase: RoomPhase): string {
  const labels: Record<RoomPhase, string> = {
    lobby: "Lobby",
    round_active: "Round in corso",
    round_reveal: "Soluzione",
    finished: "Partita terminata",
    closed: "Stanza chiusa",
  };
  return labels[phase];
}

export function connectionLabel(connection: MemberConnection): string {
  const labels: Record<MemberConnection, string> = {
    connected: "Connesso",
    disconnected: "Disconnesso",
    left: "Uscito",
    kicked: "Espulso",
  };
  return labels[connection];
}

export function closedReasonLabel(reason: string | null): string {
  const labels: Record<string, string> = {
    host_closed: "chiusa dall'host",
    lobby_expired: "lobby scaduta",
    game_expired: "durata massima della partita raggiunta",
    abandoned: "stanza abbandonata",
    results_expired: "risultati archiviati",
    empty: "nessun giocatore connesso",
  };
  return reason ? (labels[reason] ?? reason) : "chiusa";
}

/** Lato client, l'host è "assente" se la sua connessione non è attiva. */
export function isHostAway(snapshot: RoomSnapshot): boolean {
  const host = snapshot.players.find((player) => player.user_id === snapshot.room.host_id);
  return !host || host.connection !== "connected";
}

/** Verifica locale delle condizioni di avvio (il server le rivalida comunque). */
export function canStartGame(snapshot: RoomSnapshot): {
  allowed: boolean;
  reason: string | null;
} {
  if (snapshot.room.phase !== "lobby")
    return { allowed: false, reason: "La partita è già iniziata." };
  if (!snapshot.me?.is_host) return { allowed: false, reason: "Solo l'host può avviare." };
  const connected = snapshot.players.filter((player) => player.connection === "connected");
  if (connected.length < snapshot.settings.min_players) {
    return { allowed: false, reason: `Servono almeno ${snapshot.settings.min_players} giocatori.` };
  }
  if (connected.some((player) => !player.is_ready)) {
    return { allowed: false, reason: "Tutti i giocatori devono essere pronti." };
  }
  return { allowed: true, reason: null };
}
