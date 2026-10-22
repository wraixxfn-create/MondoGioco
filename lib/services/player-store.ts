/**
 * Servizio giocatore di MondoGioco: profilo locale (offline-first),
 * account cloud Supabase Auth, progressione verificata dal server,
 * storico, impostazioni, amici e classifiche.
 *
 * Principi (invariati dai passaggi precedenti, estesi):
 * - Il gioco in singolo funziona senza configurazione: i progressi vivono
 *   in localStorage e NON vengono mai presentati come dati cloud.
 * - Con un account Supabase, punteggio/XP/statistiche passano da RPC
 *   `security definer` (`record_solo_game`, migrazioni 002+005) che li
 *   valida lato server; gli XP obiettivo li accredita solo il server.
 * - Nessun dato inventato: niente giocatori "seed" in classifica. Senza
 *   cloud la classifica locale contiene solo il giocatore corrente (solo
 *   se ha davvero giocato); senza account la classifica amici è in stato
 *   esplicito "non disponibile".
 * - Anti-duplicazione: ogni partita ha un `sessionId` stabile usato come
 *   chiave di idempotenza sia in locale sia sul server (`session_key`);
 *   gli obiettivi sono sbloccati una sola volta (lista persistita in
 *   locale, PK sul server).
 */
import { getBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured, SUPABASE_SETUP_MESSAGE } from "@/lib/supabase/config";
import { calculateLevel } from "@/lib/utils";
import { v4FallbackId } from "@/lib/utils/id";
import {
  assignRanks,
  compareLeaderboardEntries,
  computeGameXp,
  DEFAULT_AVATAR_ID,
  DEFAULT_USER_SETTINGS,
  deriveStats,
  EMPTY_PROGRESSION_STATS,
  evaluateAchievements,
  getAvatar,
  isAvatarUnlocked,
  localDateKey,
  nextDailyStreak,
  normalizeUserSettings,
  userSettingsToDb,
  type AchievementDef,
  type ProgressionStats,
  type SessionStatInput,
  type UserSettings,
} from "@/lib/game/progression";

export type { UserSettings } from "@/lib/game/progression";

// ============================================================
// Tipi pubblici (compatibili con le versioni precedenti)
// ============================================================

export interface LocalPlayerState {
  playerId: string;
  authUserId: string | null;
  username: string;
  email: string | null;
  totalScore: number;
  gamesPlayed: number;
  gamesWon: number;
  bestStreak: number;
  bullseyes: number;
  xp: number;
  // --- Campi aggiunti dal passaggio "utente & progressione" (v2).
  // I profili v1 già salvati vengono migrati in `loadLocalPlayer`.
  /** Avatar cosmetico selezionato (catalogo in lib/game/progression.ts). */
  avatarId: string;
  totalRounds: number;
  totalCorrect: number;
  /** Record personale: miglior punteggio in una singola partita. */
  bestScore: number;
  dailyStreak: number;
  longestDailyStreak: number;
  /** Ultimo giorno di gioco (data locale del dispositivo) oppure null. */
  lastPlayedOn: string | null;
  /** Obiettivi già sbloccati (id): la ricompensa non è mai ripetuta. */
  unlockedAchievements: string[];
  settings: UserSettings;
}

export interface LocalSessionEntry {
  id: string;
  playerId: string;
  username: string;
  quizType: string;
  difficulty: string;
  totalScore: number;
  questionsAnswered: number;
  correctAnswers: number;
  endedAt: string;
  // Campi opzionali v2 (le sessioni v1 non li hanno: trattati come assenti).
  xpEarned?: number;
  won?: boolean;
  bullseyes?: number;
  /** Miglior serie combo della partita (missioni giornaliere/settimanali). */
  bestStreak?: number;
}

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  username: string;
  totalScore: number;
  gamesPlayed: number;
  level: number;
  avatarId: string;
  isCurrentPlayer: boolean;
}

export type TimeRange = "all" | "week" | "month";
export type LeaderboardScope = "global" | "friends";
export type LeaderboardSource = "cloud" | "local" | "unavailable";

export interface LeaderboardResult {
  entries: LeaderboardRow[];
  source: LeaderboardSource;
  /** Presente quando source = 'unavailable': spiega cosa serve per abilitarla. */
  notice?: string;
}

export interface GameResultInput {
  mode: string;
  difficulty?: string;
  score: number;
  roundsPlayed: number;
  goodRounds: number;
  bestStreak: number;
  bullseyes?: number;
  won?: boolean;
  /**
   * Identificativo stabile della partita (idempotenza). Se lo stesso
   * sessionId viene registrato due volte (doppio render, retry di rete)
   * la seconda chiamata non modifica nulla, né in locale né sul server.
   */
  sessionId?: string;
  /** Solo per i test: permette di verificare streak/storico a date diverse. */
  endedAt?: string;
}

export interface RecordGameOutcome {
  player: LocalPlayerState;
  /** XP totali accreditati (partita + nuovi obiettivi locali). */
  xpEarned: number;
  /** XP dalla sola partita, secondo le regole documentate (XP_RULES). */
  gameXp: number;
  /** XP dai nuovi obiettivi sbloccati con questa partita. */
  achievementXp: number;
  newlyUnlocked: AchievementDef[];
  synced: boolean;
  /** True se la partita era già stata registrata (niente doppia ricompensa). */
  duplicate: boolean;
  /**
   * Motivo per cui il salvataggio cloud non è riuscito (se `synced` è false
   * ma esisteva un account). La UI lo mostra: un errore non deve mai
   * sembrare un successo.
   */
  syncError?: string;
}

export interface HistoryEntry {
  mode: string;
  difficulty: string | null;
  score: number;
  rounds: number;
  correct: number;
  xpEarned: number | null;
  won: boolean;
  isMultiplayer: boolean;
  endedAt: string;
  source: "cloud" | "local";
}

export interface FriendInfo {
  userId: string;
  username: string;
  avatarId: string;
  level: number;
}

export interface CloudProgression {
  profile: LocalPlayerState;
  achievements: { id: string; xpAwarded: number; unlockedAt: string }[];
  modeStats: {
    mode: string;
    games: number;
    wins: number;
    totalScore: number;
    bestScore: number;
    rounds: number;
    correct: number;
  }[];
  recentSessions: HistoryEntry[];
}

// ============================================================
// Costanti e stato iniziale
// ============================================================

const PLAYER_STORAGE_KEY = "mondogioco:player:v1";
const SESSIONS_STORAGE_KEY = "mondogioco:sessions:v1";

export const AUTH_NOT_CONFIGURED_MESSAGE =
  "Account cloud non disponibile: Supabase non è configurato su questo sito. Puoi continuare a giocare: i progressi restano salvati su questo dispositivo.";

export const NETWORK_ERROR_MESSAGE =
  "Connessione a Supabase non riuscita (offline o rete lenta). I progressi locali sono salvi: riprova quando sei online.";

export const INITIAL_PLAYER_STATE: LocalPlayerState = {
  playerId: "00000000-0000-4000-8000-000000000000",
  authUserId: null,
  username: "Esploratore",
  email: null,
  totalScore: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  bestStreak: 0,
  bullseyes: 0,
  xp: 0,
  avatarId: DEFAULT_AVATAR_ID,
  totalRounds: 0,
  totalCorrect: 0,
  bestScore: 0,
  dailyStreak: 0,
  longestDailyStreak: 0,
  lastPlayedOn: null,
  unlockedAchievements: [],
  settings: { ...DEFAULT_USER_SETTINGS },
};

/**
 * Nessun giocatore di esempio: la classifica parte vuota e viene riempita
 * solo da dati reali (cloud o storico locale del giocatore corrente).
 */
export const INITIAL_LEADERBOARD_ROWS: LeaderboardRow[] = [];

// ============================================================
// Persistenza locale (con migrazione trasparente v1 → v2)
// ============================================================

/**
 * Numero finito e non negativo. localStorage e payload cloud possono
 * contenere NaN/Infinity/stringhe: senza questa normalizzazione un valore
 * corrotto avvelena XP, livelli e classifiche (e in passato bloccava
 * `calculateLevel` in un loop infinito).
 */
function safeCount(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function safeDateString(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? value : fallback;
}

function normalizeSessionEntry(raw: unknown): LocalSessionEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Partial<LocalSessionEntry>;
  if (typeof entry.id !== "string" || entry.id.length === 0) return null;
  if (typeof entry.quizType !== "string" || entry.quizType.length === 0) return null;
  return {
    id: entry.id,
    playerId: typeof entry.playerId === "string" ? entry.playerId : "",
    username: typeof entry.username === "string" ? entry.username : "Esploratore",
    quizType: entry.quizType,
    difficulty: typeof entry.difficulty === "string" ? entry.difficulty : "medium",
    totalScore: safeCount(entry.totalScore),
    questionsAnswered: safeCount(entry.questionsAnswered),
    correctAnswers: safeCount(entry.correctAnswers),
    endedAt: safeDateString(entry.endedAt, new Date(0).toISOString()),
    xpEarned: safeCount(entry.xpEarned),
    won: Boolean(entry.won),
    bullseyes: safeCount(entry.bullseyes),
    bestStreak: safeCount(entry.bestStreak),
  };
}

function createDefaultPlayer(): LocalPlayerState {
  const id = v4FallbackId();
  const suffix = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return {
    ...INITIAL_PLAYER_STATE,
    playerId: id,
    username: `Esploratore_${suffix}`,
    settings: { ...DEFAULT_USER_SETTINGS },
    unlockedAchievements: [],
  };
}

export function loadLocalPlayer(): LocalPlayerState {
  if (typeof window === "undefined") {
    return createDefaultPlayer();
  }
  try {
    const raw = window.localStorage.getItem(PLAYER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalPlayerState>;
      if (parsed.playerId && parsed.username) {
        // I profili v1 non hanno gli aggregati nuovi: li ricostruiamo dallo
        // storico solo in quel caso (leggere 50 sessioni a ogni render del
        // profilo è inutile per i profili già migrati).
        const needsDerived =
          parsed.totalRounds === undefined ||
          parsed.totalCorrect === undefined ||
          parsed.bestScore === undefined;
        const derived = needsDerived
          ? deriveStats(loadLocalSessions().map(sessionToStatInput))
          : null;
        return {
          playerId: parsed.playerId,
          authUserId: parsed.authUserId ?? null,
          username: parsed.username,
          email: parsed.email ?? null,
          totalScore: safeCount(parsed.totalScore),
          gamesPlayed: safeCount(parsed.gamesPlayed),
          gamesWon: safeCount(parsed.gamesWon),
          bestStreak: safeCount(parsed.bestStreak),
          bullseyes: safeCount(parsed.bullseyes),
          xp: safeCount(parsed.xp),
          avatarId: typeof parsed.avatarId === "string" ? parsed.avatarId : DEFAULT_AVATAR_ID,
          // Profili v1: ricostruisci gli aggregati nuovi dallo storico reale.
          totalRounds: safeCount(parsed.totalRounds, derived?.totalRounds ?? 0),
          totalCorrect: safeCount(parsed.totalCorrect, derived?.totalCorrect ?? 0),
          bestScore: safeCount(parsed.bestScore, derived?.bestScore ?? 0),
          dailyStreak: safeCount(parsed.dailyStreak),
          longestDailyStreak: safeCount(parsed.longestDailyStreak),
          lastPlayedOn: typeof parsed.lastPlayedOn === "string" ? parsed.lastPlayedOn : null,
          unlockedAchievements: Array.isArray(parsed.unlockedAchievements)
            ? parsed.unlockedAchievements.filter((id): id is string => typeof id === "string")
            : [],
          settings: normalizeUserSettings(parsed.settings),
        };
      }
    }
  } catch {
    // Storage non disponibile o corrotto: ricrea stato pulito.
  }
  const fresh = createDefaultPlayer();
  saveLocalPlayer(fresh);
  return fresh;
}

/**
 * Evento emesso a ogni salvataggio del profilo locale. Header e altre
 * viste si aggiornano ascoltandolo, invece di interrogare localStorage
 * ogni 2 secondi (polling che prima girava su ogni pagina).
 */
export const PLAYER_CHANGED_EVENT = "mondogioco:player-changed";

export function saveLocalPlayer(player: LocalPlayerState): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(player);
    if (window.localStorage.getItem(PLAYER_STORAGE_KEY) === serialized) return;
    window.localStorage.setItem(PLAYER_STORAGE_KEY, serialized);
    window.dispatchEvent(new Event(PLAYER_CHANGED_EVENT));
  } catch {
    // Ignorato in modalità privata ristretta.
  }
}

export function loadLocalSessions(): LocalSessionEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeSessionEntry)
      .filter((entry): entry is LocalSessionEntry => entry !== null)
      .slice(0, 50);
  } catch {
    return [];
  }
}

function appendLocalSession(entry: LocalSessionEntry): void {
  if (typeof window === "undefined") return;
  try {
    const current = loadLocalSessions();
    const updated = [entry, ...current].slice(0, 50);
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignorato.
  }
}

export function sessionToStatInput(session: LocalSessionEntry): SessionStatInput {
  return {
    mode: session.quizType,
    score: session.totalScore,
    rounds: session.questionsAnswered,
    correct: session.correctAnswers,
    endedAt: session.endedAt,
    won: session.won,
    bullseyes: session.bullseyes ?? 0,
    bestStreak: session.bestStreak ?? 0,
  };
}

/**
 * Statistiche di progressione correnti del giocatore locale, nella forma
 * usata da obiettivi, record e grafici. I contatori multiplayer derivano
 * dallo storico (in locale di solito assenti: le partite online vengono
 * registrate dal server e rientrano via `fetchMyProgression`).
 */
export function progressionStatsOf(player: LocalPlayerState): ProgressionStats {
  const derived = deriveStats(loadLocalSessions().map(sessionToStatInput));
  return {
    ...EMPTY_PROGRESSION_STATS,
    gamesPlayed: player.gamesPlayed,
    gamesWon: player.gamesWon,
    totalScore: player.totalScore,
    bullseyes: player.bullseyes,
    bestStreak: player.bestStreak,
    bestScore: Math.max(player.bestScore, derived.bestScore),
    totalRounds: Math.max(player.totalRounds, derived.totalRounds),
    totalCorrect: Math.max(player.totalCorrect, derived.totalCorrect),
    multiplayerGames: derived.multiplayerGames,
    multiplayerWins: derived.multiplayerWins,
    longestDailyStreak: player.longestDailyStreak,
  };
}

// ============================================================
// XP (regole in lib/game/progression.ts, qui ri-esportate per compatibilità)
// ============================================================

export function computeXpGain(input: GameResultInput): number {
  return computeGameXp(input);
}

// ============================================================
// Mappatura errori Supabase Auth → messaggi comprensibili in italiano
// ============================================================

export function describeAuthError(rawMessage: string | null | undefined): string {
  const message = (rawMessage ?? "").trim();
  if (!message) return "Operazione non riuscita. Riprova tra poco.";
  if (/modalità offline|offline|failed to fetch|network|abort/i.test(message)) {
    return NETWORK_ERROR_MESSAGE;
  }
  if (/MG401/.test(message)) return "Devi accedere con il tuo account per continuare.";
  if (/MG409:username_taken/.test(message)) return "Nickname già in uso: scegline un altro.";
  if (/MG400:invalid_username/.test(message)) {
    return "Il nome deve avere 3-20 caratteri: lettere, numeri, spazi, trattini o underscore.";
  }
  if (/MG400:invalid_avatar/.test(message)) return "Avatar non valido.";
  if (/MG403:avatar_locked/.test(message)) return "Questo avatar si sblocca salendo di livello.";
  if (/MG400:invalid_settings/.test(message)) return "Impostazioni non valide.";
  if (/MG404:friend_not_found/.test(message)) return "Nessun giocatore con questo nickname.";
  if (/MG400:cannot_friend_self/.test(message)) return "Non puoi aggiungere te stesso agli amici.";
  if (/MG429/.test(message))
    return "Troppe richieste in poco tempo. Attendi qualche secondo e riprova.";
  if (/does not exist|not found in the schema cache|could not find the function/i.test(message)) {
    return "Funzione non ancora disponibile sul server: il database non ha ancora le migrazioni più recenti (vedi docs/SUPABASE_SETUP.md). I dati locali restano validi.";
  }
  if (/invalid login credentials/i.test(message)) {
    return "Email o password non corrette. Controlla i dati o usa «Password dimenticata».";
  }
  if (/user already registered|already.*regist/i.test(message)) {
    return "Esiste già un account con questa email: prova ad accedere.";
  }
  if (/email not confirmed/i.test(message)) {
    return "Email non ancora confermata: apri il link ricevuto via email, poi accedi.";
  }
  if (/password.*(weak|short|least)/i.test(message)) {
    return "Password troppo debole: usa almeno 6 caratteri (meglio 10+ con numeri e simboli).";
  }
  if (/same password/i.test(message))
    return "La nuova password deve essere diversa dalla precedente.";
  if (/invalid.*email/i.test(message)) return "Indirizzo email non valido.";
  if (/rate limit|too many/i.test(message)) {
    return "Troppi tentativi: attendi qualche minuto prima di riprovare.";
  }
  if (/session missing|auth session/i.test(message)) {
    return "Sessione non valida o link scaduto: richiedi una nuova email di recupero.";
  }
  return message;
}

function mapRpcError(message: string | null | undefined): string {
  return describeAuthError(message);
}

// ============================================================
// Profilo cloud: parsing e merge
// ============================================================

interface CloudProfileShape {
  username?: string;
  email?: string;
  avatar_id?: string;
  total_score?: number;
  games_played?: number;
  games_won?: number;
  best_streak?: number;
  bullseyes?: number;
  xp?: number;
  total_rounds?: number;
  total_correct?: number;
  best_score?: number;
  daily_streak?: number;
  longest_daily_streak?: number;
  last_played_on?: string | null;
  settings?: unknown;
  unlocked_achievements?: string[];
}

function asCloudProfile(data: unknown): CloudProfileShape | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as CloudProfileShape;
}

/**
 * Unisce il profilo cloud a quello locale. Strategia documentata: per i
 * contatori cumulativi vince il valore maggiore (un dispositivo offline
 * non può "abbassare" i progressi), mentre nickname/avatar/impostazioni
 * arrivano dal server se presenti. Gli obiettivi si uniscono (mai persi).
 */
function hasSettingsKeys(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const keys = Object.keys(raw);
  return keys.some((k) =>
    ["reduceMotion", "globeAutoRotate", "reduce_motion", "globe_auto_rotate"].includes(k)
  );
}

function mergeCloudProfile(
  local: LocalPlayerState,
  cloud: CloudProfileShape | null,
  authUserId: string,
  email: string | null
): LocalPlayerState {
  const unlocked = new Set(local.unlockedAchievements);
  for (const id of cloud?.unlocked_achievements ?? []) unlocked.add(id);
  return {
    ...local,
    authUserId,
    username: cloud?.username || local.username,
    email: email ?? cloud?.email ?? local.email,
    avatarId: cloud?.avatar_id || local.avatarId,
    totalScore: Math.max(local.totalScore, safeCount(cloud?.total_score)),
    gamesPlayed: Math.max(local.gamesPlayed, safeCount(cloud?.games_played)),
    gamesWon: Math.max(local.gamesWon, safeCount(cloud?.games_won)),
    bestStreak: Math.max(local.bestStreak, safeCount(cloud?.best_streak)),
    bullseyes: Math.max(local.bullseyes, safeCount(cloud?.bullseyes)),
    xp: Math.max(local.xp, safeCount(cloud?.xp)),
    totalRounds: Math.max(local.totalRounds, safeCount(cloud?.total_rounds)),
    totalCorrect: Math.max(local.totalCorrect, safeCount(cloud?.total_correct)),
    bestScore: Math.max(local.bestScore, safeCount(cloud?.best_score)),
    dailyStreak: Math.max(local.dailyStreak, safeCount(cloud?.daily_streak)),
    longestDailyStreak: Math.max(local.longestDailyStreak, safeCount(cloud?.longest_daily_streak)),
    lastPlayedOn: cloud?.last_played_on ?? local.lastPlayedOn,
    // Le impostazioni cloud vincono solo se contengono davvero delle chiavi:
    // il default del DB è '{}' e non deve cancellare le scelte locali.
    settings: hasSettingsKeys(cloud?.settings)
      ? normalizeUserSettings(cloud?.settings)
      : local.settings,
    unlockedAchievements: Array.from(unlocked),
  };
}

/**
 * Sincronizza il nickname del giocatore autenticato su Supabase.
 * I punteggi NON vengono mai inviati come totali assoluti: passano dalla
 * RPC `record_solo_game`, che valida e limita gli incrementi lato server.
 */
export async function syncPlayerToCloud(player: LocalPlayerState): Promise<boolean> {
  if (!isSupabaseConfigured || !player.authUserId) return false;
  try {
    const supabase = getBrowserClient();
    if (!supabase) return false;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return false;

    const { data: profile, error: profileError } = await supabase.rpc("get_my_profile");
    if (profileError) return false;
    const cloud = asCloudProfile(profile);
    if (cloud?.username === player.username) return true;

    const { error } = await supabase.rpc("set_username", { p_username: player.username });
    return !error;
  } catch {
    return false;
  }
}

// ============================================================
// Registrazione partita: locale immediato + server autorevole
// ============================================================

/** Messaggio leggibile per gli errori di salvataggio della partita. */
function describeRecordError(message: string | null | undefined): string {
  const code = (message ?? "").match(/MG\d{3}:[a-z_]+/)?.[0] ?? "";
  const messages: Record<string, string> = {
    "MG400:invalid_score": "il server ha rifiutato il punteggio (fuori dal massimo teorico).",
    "MG400:invalid_xp": "il server ha rifiutato gli XP dichiarati.",
    "MG400:invalid_round_count": "numero di round non valido per il server.",
    "MG400:invalid_correct_count": "numero di risposte corrette non valido.",
    "MG400:invalid_bullseyes": "numero di bullseye non coerente con le risposte corrette.",
    "MG400:invalid_best_streak": "serie migliore non coerente con le risposte corrette.",
    "MG429:rate_limited": "troppe partite in poco tempo: riprova tra qualche minuto.",
    "MG401:authentication_required": "sessione scaduta: accedi di nuovo per sincronizzare.",
  };
  return messages[code] ?? "il server non ha accettato il salvataggio (riprova più tardi).";
}

export async function recordGameResult(input: GameResultInput): Promise<RecordGameOutcome> {
  const prev = loadLocalPlayer();
  const empty: RecordGameOutcome = {
    player: prev,
    xpEarned: 0,
    gameXp: 0,
    achievementXp: 0,
    newlyUnlocked: [],
    synced: false,
    duplicate: false,
  };
  if (input.roundsPlayed <= 0) return empty;

  const sessionId = input.sessionId ?? v4FallbackId();
  // Idempotenza locale: stessa partita già nello storico → nessun doppio XP.
  if (input.sessionId && loadLocalSessions().some((s) => s.id === sessionId)) {
    return { ...empty, duplicate: true };
  }

  const endedAt = input.endedAt ?? new Date().toISOString();
  const todayKey = localDateKey(new Date(endedAt));
  const score = Math.max(0, Math.round(input.score));
  const gameXp = computeGameXp(input);

  const dailyStreak = nextDailyStreak(prev.lastPlayedOn, prev.dailyStreak, todayKey);
  let next: LocalPlayerState = {
    ...prev,
    totalScore: prev.totalScore + score,
    gamesPlayed: prev.gamesPlayed + 1,
    gamesWon: prev.gamesWon + (input.won ? 1 : 0),
    bestStreak: Math.max(prev.bestStreak, input.bestStreak),
    bullseyes: prev.bullseyes + (input.bullseyes ?? 0),
    totalRounds: prev.totalRounds + input.roundsPlayed,
    totalCorrect: prev.totalCorrect + Math.min(input.goodRounds, input.roundsPlayed),
    bestScore: Math.max(prev.bestScore, score),
    dailyStreak,
    longestDailyStreak: Math.max(prev.longestDailyStreak, dailyStreak),
    lastPlayedOn: todayKey,
    xp: prev.xp + gameXp,
  };

  // Obiettivi: valutati sullo stato aggiornato, accreditati una sola volta.
  const stats = progressionStatsOf(next);
  const { newlyUnlocked, xpAwarded } = evaluateAchievements(stats, next.unlockedAchievements);
  if (newlyUnlocked.length > 0) {
    next = {
      ...next,
      xp: next.xp + xpAwarded,
      unlockedAchievements: [...next.unlockedAchievements, ...newlyUnlocked.map((a) => a.id)],
    };
  }
  saveLocalPlayer(next);

  const sessionEntry: LocalSessionEntry = {
    id: sessionId,
    playerId: next.playerId,
    username: next.username,
    quizType: input.mode,
    difficulty: input.difficulty ?? "medium",
    totalScore: score,
    questionsAnswered: input.roundsPlayed,
    correctAnswers: input.goodRounds,
    endedAt,
    xpEarned: gameXp,
    won: Boolean(input.won),
    bullseyes: input.bullseyes ?? 0,
    bestStreak: input.bestStreak,
  };
  appendLocalSession(sessionEntry);

  const outcome: RecordGameOutcome = {
    player: next,
    xpEarned: gameXp + xpAwarded,
    gameXp,
    achievementXp: xpAwarded,
    newlyUnlocked,
    synced: false,
    duplicate: false,
  };

  if (!isSupabaseConfigured || !next.authUserId) return outcome;

  try {
    const supabase = getBrowserClient();
    if (!supabase) return outcome;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return outcome;

    // Il server valida punteggio/round/XP e accredita da sé gli obiettivi.
    // Al server inviamo SOLO gli XP di partita (gameXp): sommare anche gli
    // XP obiettivo locali li duplicherebbe, perché li assegna il database.
    const baseArgs = {
      p_mode: sessionEntry.quizType,
      p_difficulty: sessionEntry.difficulty,
      p_score: sessionEntry.totalScore,
      p_rounds: sessionEntry.questionsAnswered,
      p_correct: sessionEntry.correctAnswers,
      p_xp: gameXp,
    };
    let { data, error } = await supabase.rpc("record_solo_game", {
      ...baseArgs,
      p_session_key: sessionId,
      p_bullseyes: input.bullseyes ?? 0,
      p_best_streak: input.bestStreak,
      p_won: Boolean(input.won),
    });
    if (error) {
      // Retry SOLO quando il database non conosce ancora la nuova firma
      // (deploy progressivo, migrazione 002-004). Un errore di rete NON
      // viene ritentato: la prima chiamata potrebbe essere andata a buon
      // fine e il retry senza `session_key` registrerebbe la partita due
      // volte.
      const missingFunction = /could not find the function|does not exist|PGRST202|404/i.test(
        error.message
      );
      if (!missingFunction) {
        return { ...outcome, syncError: describeRecordError(error.message) };
      }
      const retry = await supabase.rpc("record_solo_game", baseArgs);
      data = retry.data;
      error = retry.error;
      if (error) return { ...outcome, syncError: describeRecordError(error.message) };
    }

    const cloud = asCloudProfile(data);
    if (cloud && sessionData.session.user) {
      const merged = mergeCloudProfile(
        loadLocalPlayer(),
        cloud,
        sessionData.session.user.id,
        sessionData.session.user.email ?? null
      );
      saveLocalPlayer(merged);
      return { ...outcome, player: merged, synced: true };
    }
    return { ...outcome, synced: true };
  } catch {
    return outcome;
  }
}

export async function renamePlayer(
  rawUsername: string
): Promise<{ ok: boolean; player: LocalPlayerState; error?: string }> {
  const cleaned = rawUsername.trim().replace(/[\x00-\x1F\x7F]/g, "");
  // Stesse regole del server (RPC `set_username`), così non si creano
  // discrepanze tra profilo locale e profilo cloud.
  if (!/^[A-Za-z0-9_][A-Za-z0-9_ -]{2,19}$/.test(cleaned)) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      error: "Il nome deve avere 3-20 caratteri: lettere, numeri, spazi, trattini o underscore.",
    };
  }
  const current = loadLocalPlayer();
  const updated: LocalPlayerState = { ...current, username: cleaned };

  if (updated.authUserId && isSupabaseConfigured) {
    // Sul cloud il nickname è unico: se il server lo rifiuta non fingiamo
    // il salvataggio, così locale e classifiche restano coerenti.
    try {
      const supabase = getBrowserClient();
      const { data: sessionData } = (await supabase?.auth.getSession()) ?? {
        data: { session: null },
      };
      if (supabase && sessionData.session) {
        const { data, error } = await supabase.rpc("set_username", { p_username: cleaned });
        if (error) {
          return { ok: false, player: current, error: mapRpcError(error.message) };
        }
        const merged = mergeCloudProfile(
          updated,
          asCloudProfile(data),
          sessionData.session.user.id,
          sessionData.session.user.email ?? null
        );
        saveLocalPlayer(merged);
        return { ok: true, player: merged };
      }
    } catch {
      return { ok: false, player: current, error: NETWORK_ERROR_MESSAGE };
    }
  }

  saveLocalPlayer(updated);
  return { ok: true, player: updated };
}

// ============================================================
// Avatar e impostazioni
// ============================================================

export async function setAvatar(
  avatarId: string
): Promise<{ ok: boolean; player: LocalPlayerState; synced: boolean; error?: string }> {
  const current = loadLocalPlayer();
  const avatar = getAvatar(avatarId);
  if (avatar.id !== avatarId) {
    return { ok: false, player: current, synced: false, error: "Avatar non valido." };
  }
  const level = calculateLevel(current.xp).level;
  if (!isAvatarUnlocked(avatarId, level)) {
    return {
      ok: false,
      player: current,
      synced: false,
      error: `L'avatar ${avatar.label} si sblocca al livello ${avatar.unlockLevel} (sei al ${level}).`,
    };
  }

  const updated: LocalPlayerState = { ...current, avatarId };
  saveLocalPlayer(updated);

  if (!updated.authUserId || !isSupabaseConfigured) {
    return { ok: true, player: updated, synced: false };
  }
  try {
    const supabase = getBrowserClient();
    if (!supabase) return { ok: true, player: updated, synced: false };
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { ok: true, player: updated, synced: false };
    const { error } = await supabase.rpc("set_avatar", { p_avatar_id: avatarId });
    if (error) {
      return {
        ok: true,
        player: updated,
        synced: false,
        error: `Avatar salvato sul dispositivo; sincronizzazione cloud non riuscita (${mapRpcError(error.message)}).`,
      };
    }
    return { ok: true, player: updated, synced: true };
  } catch {
    return { ok: true, player: updated, synced: false, error: NETWORK_ERROR_MESSAGE };
  }
}

export async function updateSettings(
  patch: Partial<UserSettings>
): Promise<{ ok: boolean; player: LocalPlayerState; synced: boolean; error?: string }> {
  const current = loadLocalPlayer();
  const settings = normalizeUserSettings({ ...current.settings, ...patch });
  const updated: LocalPlayerState = { ...current, settings };
  saveLocalPlayer(updated);
  if (typeof window !== "undefined") {
    document.documentElement.dataset.reduceMotion = settings.reduceMotion ? "true" : "false";
  }

  if (!updated.authUserId || !isSupabaseConfigured) {
    return { ok: true, player: updated, synced: false };
  }
  try {
    const supabase = getBrowserClient();
    if (!supabase) return { ok: true, player: updated, synced: false };
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { ok: true, player: updated, synced: false };
    const { error } = await supabase.rpc("set_my_settings", {
      p_settings: userSettingsToDb(settings),
    });
    return { ok: true, player: updated, synced: !error };
  } catch {
    return { ok: true, player: updated, synced: false };
  }
}

// ============================================================
// Classifiche
// ============================================================

type RankableEntry = Omit<LeaderboardRow, "rank" | "isCurrentPlayer">;

function rankEntries(
  items: RankableEntry[],
  currentPlayerId: string,
  authUserId: string | null
): LeaderboardRow[] {
  const sorted = [...items].sort(compareLeaderboardEntries);
  return assignRanks(sorted)
    .slice(0, 50)
    .map((item) => ({
      ...item,
      isCurrentPlayer:
        item.playerId === currentPlayerId || (authUserId !== null && item.playerId === authUserId),
    }));
}

/** Aggrega lo storico locale nella finestra richiesta (dati reali del solo giocatore corrente). */
function localLeaderboardEntries(range: TimeRange): RankableEntry[] {
  const me = loadLocalPlayer();
  if (me.gamesPlayed <= 0) return [];

  if (range === "all") {
    return [
      {
        playerId: me.playerId,
        username: me.username,
        totalScore: me.totalScore,
        gamesPlayed: me.gamesPlayed,
        level: calculateLevel(me.xp).level,
        avatarId: me.avatarId,
      },
    ];
  }

  const days = range === "week" ? 7 : 30;
  const cutoff = Date.now() - days * 24 * 3600_000;
  const recent = loadLocalSessions().filter((s) => new Date(s.endedAt).getTime() >= cutoff);
  if (recent.length === 0) return [];
  return [
    {
      playerId: me.playerId,
      username: me.username,
      totalScore: recent.reduce((sum, s) => sum + s.totalScore, 0),
      gamesPlayed: recent.length,
      level: calculateLevel(me.xp).level,
      avatarId: me.avatarId,
    },
  ];
}

/**
 * Carica una classifica.
 * - Globale: RPC `get_leaderboard` (solo aggregati pubblici, mai email);
 *   senza cloud/rete ripiega sullo storico locale del giocatore corrente.
 * - Amici: richiede account cloud autenticato; altrimenti stato esplicito
 *   `unavailable` (mai dati inventati).
 * Nuovi utenti: compaiono dopo la prima partita registrata. Pareggi:
 * stessa posizione a pari punti (vedi assignRanks/compareLeaderboardEntries).
 */
export async function fetchLeaderboard(
  range: TimeRange,
  scope: LeaderboardScope = "global"
): Promise<LeaderboardResult> {
  const me = loadLocalPlayer();

  if (scope === "friends") {
    if (!isSupabaseConfigured) {
      return {
        entries: [],
        source: "unavailable",
        notice:
          "La classifica amici richiede il cloud, ma Supabase non è configurato su questo sito.",
      };
    }
    try {
      const supabase = getBrowserClient();
      if (!supabase) throw new Error("no-client");
      // Fonte di verità sull'autenticazione: la sessione Supabase reale,
      // non la copia locale dell'id (potrebbe non essere ancora allineata).
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        return {
          entries: [],
          source: "unavailable",
          notice: "Accedi con il tuo account per vedere la classifica dei tuoi amici.",
        };
      }
      const authUserId = sessionData.session.user.id;
      const { data, error } = await supabase.rpc("get_friends_leaderboard", { p_range: range });
      if (error) throw error;
      const entries: RankableEntry[] = (data ?? []).map((row) => ({
        playerId: row.user_id,
        username: row.username,
        totalScore: Number(row.total_score),
        gamesPlayed: Number(row.games_played),
        level: Number(row.level),
        avatarId: row.avatar_id ?? DEFAULT_AVATAR_ID,
      }));
      return { entries: rankEntries(entries, me.playerId, authUserId), source: "cloud" };
    } catch (err) {
      const raw = err && typeof err === "object" && "message" in err ? String(err.message) : "";
      return {
        entries: [],
        source: "unavailable",
        notice: raw ? describeAuthError(raw) : NETWORK_ERROR_MESSAGE,
      };
    }
  }

  if (isSupabaseConfigured) {
    try {
      const supabase = getBrowserClient();
      if (!supabase) throw new Error("no-client");
      const { data, error } = await supabase.rpc("get_leaderboard", { p_range: range });

      if (!error && Array.isArray(data)) {
        const byId = new Map<string, RankableEntry>();
        for (const row of data) {
          byId.set(row.user_id, {
            playerId: row.user_id,
            username: row.username,
            totalScore: Number(row.total_score),
            gamesPlayed: Number(row.games_played),
            level: Number(row.level),
            avatarId: row.avatar_id ?? DEFAULT_AVATAR_ID,
          });
        }
        // Il giocatore locale non ancora sincronizzato compare con i SUOI
        // dati reali del dispositivo (nessun altro dato inventato).
        if (range === "all" && me.gamesPlayed > 0 && !me.authUserId) {
          byId.set(me.playerId, {
            playerId: me.playerId,
            username: me.username,
            totalScore: me.totalScore,
            gamesPlayed: me.gamesPlayed,
            level: calculateLevel(me.xp).level,
            avatarId: me.avatarId,
          });
        }
        return {
          entries: rankEntries(Array.from(byId.values()), me.playerId, me.authUserId),
          source: "cloud",
        };
      }
    } catch {
      // Passa al fallback locale sotto.
    }
  }

  return {
    entries: rankEntries(localLeaderboardEntries(range), me.playerId, me.authUserId),
    source: "local",
  };
}

// ============================================================
// Amici
// ============================================================

export async function fetchFriends(): Promise<{ friends: FriendInfo[]; error?: string }> {
  if (!isSupabaseConfigured) return { friends: [], error: AUTH_NOT_CONFIGURED_MESSAGE };
  try {
    const supabase = getBrowserClient();
    if (!supabase) return { friends: [], error: AUTH_NOT_CONFIGURED_MESSAGE };
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return { friends: [], error: "Accedi con il tuo account per gestire gli amici." };
    }
    const { data, error } = await supabase.rpc("list_friends");
    if (error) return { friends: [], error: mapRpcError(error.message) };
    return {
      friends: (data ?? []).map((row) => ({
        userId: row.user_id,
        username: row.username,
        avatarId: row.avatar_id ?? DEFAULT_AVATAR_ID,
        level: Number(row.level),
      })),
    };
  } catch {
    return { friends: [], error: NETWORK_ERROR_MESSAGE };
  }
}

export async function addFriendByUsername(
  username: string
): Promise<{ ok: boolean; alreadyFriends?: boolean; friend?: FriendInfo; error?: string }> {
  const cleaned = username.trim();
  if (cleaned.length < 3) return { ok: false, error: "Inserisci il nickname esatto dell'amico." };
  if (!isSupabaseConfigured) return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
  try {
    const supabase = getBrowserClient();
    if (!supabase) return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
    const { data, error } = await supabase.rpc("add_friend", { p_username: cleaned });
    if (error) return { ok: false, error: mapRpcError(error.message) };
    const payload = data as {
      already_friends?: boolean;
      friend?: { user_id: string; username: string; avatar_id?: string; level: number };
    } | null;
    return {
      ok: true,
      alreadyFriends: Boolean(payload?.already_friends),
      friend: payload?.friend
        ? {
            userId: payload.friend.user_id,
            username: payload.friend.username,
            avatarId: payload.friend.avatar_id ?? DEFAULT_AVATAR_ID,
            level: Number(payload.friend.level),
          }
        : undefined,
    };
  } catch {
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
}

export async function removeFriend(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
  try {
    const supabase = getBrowserClient();
    if (!supabase) return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
    const { error } = await supabase.rpc("remove_friend", { p_user_id: userId });
    if (error) return { ok: false, error: mapRpcError(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
}

// ============================================================
// Progressione e storico dal server (solo i propri dati)
// ============================================================

/**
 * Scarica la progressione completa dal server e allinea il profilo locale.
 * Restituisce null quando cloud/account/sessione non sono disponibili:
 * la UI in quel caso usa (e dichiara) i soli dati locali.
 */
export async function fetchMyProgression(): Promise<CloudProgression | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const supabase = getBrowserClient();
    if (!supabase) return null;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return null;

    const { data, error } = await supabase.rpc("get_my_progression");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
    const payload = data as {
      profile?: unknown;
      achievements?: { id: string; xp_awarded: number; unlocked_at: string }[];
      mode_stats?: {
        mode: string;
        games: number;
        wins: number;
        total_score: number;
        best_score: number;
        rounds: number;
        correct: number;
      }[];
      recent_sessions?: {
        mode: string;
        difficulty: string | null;
        score: number;
        rounds: number;
        correct: number;
        xp_earned: number;
        won: boolean;
        ended_at: string;
      }[];
    };

    const merged = mergeCloudProfile(
      loadLocalPlayer(),
      asCloudProfile(payload.profile),
      user.id,
      user.email ?? null
    );
    saveLocalPlayer(merged);

    return {
      profile: merged,
      achievements: (payload.achievements ?? []).map((a) => ({
        id: a.id,
        xpAwarded: Number(a.xp_awarded),
        unlockedAt: a.unlocked_at,
      })),
      modeStats: (payload.mode_stats ?? []).map((m) => ({
        mode: m.mode,
        games: Number(m.games),
        wins: Number(m.wins),
        totalScore: Number(m.total_score),
        bestScore: Number(m.best_score),
        rounds: Number(m.rounds),
        correct: Number(m.correct),
      })),
      recentSessions: (payload.recent_sessions ?? []).map((s) => ({
        mode: s.mode,
        difficulty: s.difficulty,
        score: Number(s.score),
        rounds: Number(s.rounds),
        correct: Number(s.correct),
        xpEarned: Number(s.xp_earned),
        won: Boolean(s.won),
        isMultiplayer: s.mode.startsWith("multiplayer"),
        endedAt: s.ended_at,
        source: "cloud" as const,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Storico partite da mostrare nel profilo. Con account cloud usa lo
 * storico del server (include il multiplayer); altrimenti quello locale.
 * Restituisce anche la sorgente, così la UI può dichiararla onestamente.
 */
export async function fetchMyHistory(
  limit = 20,
  onlyMultiplayer = false
): Promise<{ entries: HistoryEntry[]; source: "cloud" | "local" }> {
  const localEntries = (): HistoryEntry[] =>
    loadLocalSessions()
      .filter((s) => !onlyMultiplayer || s.quizType.startsWith("multiplayer"))
      .slice(0, limit)
      .map((s) => ({
        mode: s.quizType,
        difficulty: s.difficulty,
        score: s.totalScore,
        rounds: s.questionsAnswered,
        correct: s.correctAnswers,
        xpEarned: s.xpEarned ?? null,
        won: Boolean(s.won),
        isMultiplayer: s.quizType.startsWith("multiplayer"),
        endedAt: s.endedAt,
        source: "local" as const,
      }));

  if (!isSupabaseConfigured) return { entries: localEntries(), source: "local" };
  try {
    const supabase = getBrowserClient();
    if (!supabase) return { entries: localEntries(), source: "local" };
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { entries: localEntries(), source: "local" };

    const { data, error } = await supabase.rpc("get_my_history", {
      p_limit: limit,
      p_only_multiplayer: onlyMultiplayer,
    });
    if (error || !Array.isArray(data)) return { entries: localEntries(), source: "local" };
    return {
      entries: data.map((row) => ({
        mode: row.mode,
        difficulty: row.difficulty,
        score: Number(row.score),
        rounds: Number(row.rounds),
        correct: Number(row.correct),
        xpEarned: Number(row.xp_earned),
        won: Boolean(row.won),
        isMultiplayer: Boolean(row.is_multiplayer),
        endedAt: row.ended_at,
        source: "cloud" as const,
      })),
      source: "cloud",
    };
  } catch {
    return { entries: localEntries(), source: "local" };
  }
}

// ============================================================
// Account: sessione, registrazione, login, recupero password, logout
// ============================================================

/**
 * Ripristina e allinea l'eventuale sessione Supabase Auth con il profilo
 * locale. Senza sessione (ospite) restituisce il profilo locale così
 * com'è: nessun finto login, nessun dato cloud inventato.
 */
export async function syncAuthSession(): Promise<LocalPlayerState> {
  const local = loadLocalPlayer();
  if (!isSupabaseConfigured) return local;

  try {
    const supabase = getBrowserClient();
    if (!supabase) return local;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      // Sessione scaduta/assente: il profilo locale torna "ospite" ma i
      // progressi del dispositivo non vengono cancellati.
      if (local.authUserId || local.email) {
        const guest: LocalPlayerState = { ...local, authUserId: null, email: null };
        saveLocalPlayer(guest);
        return guest;
      }
      return local;
    }

    const { data: cloudData } = await supabase.rpc("get_my_profile");
    const merged = mergeCloudProfile(local, asCloudProfile(cloudData), user.id, user.email ?? null);
    saveLocalPlayer(merged);
    return merged;
  } catch {
    return local;
  }
}

export interface AuthOutcome {
  ok: boolean;
  player: LocalPlayerState;
  mode: "cloud" | "local";
  /** True quando Supabase richiede la conferma email prima del login. */
  needsEmailConfirmation?: boolean;
  error?: string;
}

function validateEmailPassword(
  email: string,
  password: string
): { ok: true; email: string } | { ok: false; error: string } {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, error: "Inserisci un indirizzo email valido." };
  }
  if (password.length < 6) {
    return { ok: false, error: "La password deve avere almeno 6 caratteri." };
  }
  return { ok: true, email: cleanEmail };
}

export async function signUpWithEmail(
  email: string,
  password: string,
  username?: string
): Promise<AuthOutcome> {
  const validation = validateEmailPassword(email, password);
  if (!validation.ok) {
    return { ok: false, player: loadLocalPlayer(), mode: "local", error: validation.error };
  }
  const cleanEmail = validation.email;
  const desiredName = (username?.trim() || cleanEmail.split("@")[0] || "Esploratore").slice(0, 20);

  if (!isSupabaseConfigured) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error: AUTH_NOT_CONFIGURED_MESSAGE,
    };
  }

  try {
    const supabase = getBrowserClient();
    if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { username: desiredName },
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/auth` : undefined,
      },
    });
    if (error) {
      return {
        ok: false,
        player: loadLocalPlayer(),
        mode: "cloud",
        error: describeAuthError(error.message),
      };
    }

    const local = loadLocalPlayer();
    if (!data.session) {
      // Conferma email attiva sul progetto: l'account esiste ma non c'è
      // ancora una sessione. Non fingiamo la sincronizzazione cloud.
      return {
        ok: true,
        player: local,
        mode: "cloud",
        needsEmailConfirmation: true,
      };
    }

    const next: LocalPlayerState = {
      ...local,
      authUserId: data.user?.id ?? local.authUserId,
      username: desiredName,
      email: cleanEmail,
    };
    saveLocalPlayer(next);
    await syncPlayerToCloud(next);
    const synced = await syncAuthSession();
    return { ok: true, player: synced, mode: "cloud" };
  } catch {
    return { ok: false, player: loadLocalPlayer(), mode: "local", error: NETWORK_ERROR_MESSAGE };
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthOutcome> {
  const validation = validateEmailPassword(email, password);
  if (!validation.ok) {
    return { ok: false, player: loadLocalPlayer(), mode: "local", error: validation.error };
  }
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error: AUTH_NOT_CONFIGURED_MESSAGE,
    };
  }

  try {
    const supabase = getBrowserClient();
    if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validation.email,
      password,
    });
    if (error) {
      return {
        ok: false,
        player: loadLocalPlayer(),
        mode: "cloud",
        error: describeAuthError(error.message),
      };
    }
    const synced = await syncAuthSession();
    return {
      ok: true,
      player: {
        ...synced,
        authUserId: data.user.id,
        email: data.user.email ?? validation.email,
      },
      mode: "cloud",
    };
  } catch {
    return { ok: false, player: loadLocalPlayer(), mode: "local", error: NETWORK_ERROR_MESSAGE };
  }
}

/**
 * Invia l'email di recupero password (Supabase Auth). Per non permettere
 * l'enumerazione degli account, la UI deve mostrare lo stesso messaggio
 * di successo sia per email registrate sia non registrate.
 */
export async function requestPasswordReset(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { ok: false, error: "Inserisci un indirizzo email valido." };
  }
  if (!isSupabaseConfigured) return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };

  try {
    const supabase = getBrowserClient();
    if (!supabase) return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/auth/reset` : undefined,
    });
    if (error) {
      // Errori di rete vengono mostrati; errori "utente non trovato"
      // vengono normalizzati in successo (anti-enumerazione).
      if (/offline|failed to fetch|network|abort/i.test(error.message)) {
        return { ok: false, error: NETWORK_ERROR_MESSAGE };
      }
      if (/rate limit|too many/i.test(error.message)) {
        return { ok: false, error: describeAuthError(error.message) };
      }
      return { ok: true };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
}

/**
 * Imposta la nuova password. Funziona (a) dalla pagina /auth/reset dopo
 * il click sul link email (sessione di recovery) e (b) per un utente già
 * loggato che vuole cambiarla dal profilo.
 */
export async function updatePassword(
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  if (newPassword.length < 6) {
    return { ok: false, error: "La nuova password deve avere almeno 6 caratteri." };
  }
  if (!isSupabaseConfigured) return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
  try {
    const supabase = getBrowserClient();
    if (!supabase) return { ok: false, error: AUTH_NOT_CONFIGURED_MESSAGE };
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return {
        ok: false,
        error: "Sessione non valida o link scaduto: richiedi una nuova email di recupero.",
      };
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: describeAuthError(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
}

export async function signOutAccount(): Promise<LocalPlayerState> {
  try {
    const supabase = getBrowserClient();
    await supabase?.auth.signOut();
  } catch {
    // Ignorato se offline: la sessione locale viene comunque scollegata.
  }
  const current = loadLocalPlayer();
  const next: LocalPlayerState = {
    ...current,
    authUserId: null,
    email: null,
  };
  saveLocalPlayer(next);
  return next;
}

export { SUPABASE_SETUP_MESSAGE };
