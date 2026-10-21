import { getBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { calculateLevel } from "@/lib/utils";
import { v4FallbackId } from "@/lib/utils/id";

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
}

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  username: string;
  totalScore: number;
  gamesPlayed: number;
  level: number;
  isCurrentPlayer: boolean;
}

export type TimeRange = "all" | "week" | "month";

export interface GameResultInput {
  mode: string;
  difficulty?: string;
  score: number;
  roundsPlayed: number;
  goodRounds: number;
  bestStreak: number;
  bullseyes?: number;
  won?: boolean;
}

const PLAYER_STORAGE_KEY = "mondogioco:player:v1";
const SESSIONS_STORAGE_KEY = "mondogioco:sessions:v1";

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
};

export const INITIAL_LEADERBOARD_ROWS: LeaderboardRow[] = [
  {
    rank: 1,
    playerId: "00000000-0000-4000-8000-000000000101",
    username: "GeoMaster_MI",
    totalScore: 48250,
    gamesPlayed: 14,
    level: 8,
    isCurrentPlayer: false,
  },
  {
    rank: 2,
    playerId: "00000000-0000-4000-8000-000000000102",
    username: "Marco Polo",
    totalScore: 39600,
    gamesPlayed: 11,
    level: 7,
    isCurrentPlayer: false,
  },
  {
    rank: 3,
    playerId: "00000000-0000-4000-8000-000000000103",
    username: "Elena_Navigatrice",
    totalScore: 31840,
    gamesPlayed: 9,
    level: 6,
    isCurrentPlayer: false,
  },
  {
    rank: 4,
    playerId: "00000000-0000-4000-8000-000000000104",
    username: "AtlanteNord",
    totalScore: 24190,
    gamesPlayed: 7,
    level: 5,
    isCurrentPlayer: false,
  },
  {
    rank: 5,
    playerId: "00000000-0000-4000-8000-000000000105",
    username: "BussolaSud",
    totalScore: 17520,
    gamesPlayed: 5,
    level: 4,
    isCurrentPlayer: false,
  },
];

const SEED_ENTRIES: Omit<LeaderboardRow, "rank" | "isCurrentPlayer">[] = [
  {
    playerId: "00000000-0000-4000-8000-000000000101",
    username: "GeoMaster_MI",
    totalScore: 48250,
    gamesPlayed: 14,
    level: 8,
  },
  {
    playerId: "00000000-0000-4000-8000-000000000102",
    username: "Marco Polo",
    totalScore: 39600,
    gamesPlayed: 11,
    level: 7,
  },
  {
    playerId: "00000000-0000-4000-8000-000000000103",
    username: "Elena_Navigatrice",
    totalScore: 31840,
    gamesPlayed: 9,
    level: 6,
  },
  {
    playerId: "00000000-0000-4000-8000-000000000104",
    username: "AtlanteNord",
    totalScore: 24190,
    gamesPlayed: 7,
    level: 5,
  },
  {
    playerId: "00000000-0000-4000-8000-000000000105",
    username: "BussolaSud",
    totalScore: 17520,
    gamesPlayed: 5,
    level: 4,
  },
];

function createDefaultPlayer(): LocalPlayerState {
  const id = v4FallbackId();
  const suffix = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return {
    playerId: id,
    authUserId: null,
    username: `Esploratore_${suffix}`,
    email: null,
    totalScore: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    bestStreak: 0,
    bullseyes: 0,
    xp: 0,
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
        return {
          playerId: parsed.playerId,
          authUserId: parsed.authUserId ?? null,
          username: parsed.username,
          email: parsed.email ?? null,
          totalScore: Number(parsed.totalScore ?? 0),
          gamesPlayed: Number(parsed.gamesPlayed ?? 0),
          gamesWon: Number(parsed.gamesWon ?? 0),
          bestStreak: Number(parsed.bestStreak ?? 0),
          bullseyes: Number(parsed.bullseyes ?? 0),
          xp: Number(parsed.xp ?? 0),
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

export function saveLocalPlayer(player: LocalPlayerState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(player));
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
    return Array.isArray(parsed) ? (parsed as LocalSessionEntry[]) : [];
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

export function computeXpGain(input: GameResultInput): number {
  if (input.roundsPlayed <= 0) return 0;
  const fromScore = Math.round(input.score / 12);
  const fromBullseyes = (input.bullseyes ?? 0) * 40;
  const fromRounds = input.roundsPlayed * 15;
  const winBonus = input.won ? 75 : 0;
  return Math.max(25, fromScore + fromBullseyes + fromRounds + winBonus);
}

/**
 * Sincronizza il nickname del giocatore autenticato su Supabase.
 *
 * I punteggi NON vengono più inviati come totali assoluti: passano dalla RPC
 * `record_solo_game`, che valida e limita gli incrementi lato server.
 * I giocatori ospiti restano solo locali (nessun finto salvataggio cloud).
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
    if (profile && typeof profile === "object" && !Array.isArray(profile)) {
      if ((profile as { username?: string }).username === player.username) return true;
    }

    const { error } = await supabase.rpc("set_username", { p_username: player.username });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Registra il risultato di una partita sia in locale sia su Supabase.
 */
export async function recordGameResult(
  input: GameResultInput
): Promise<{ player: LocalPlayerState; xpEarned: number; synced: boolean }> {
  const prev = loadLocalPlayer();
  if (input.roundsPlayed <= 0) {
    return { player: prev, xpEarned: 0, synced: false };
  }

  const xpEarned = computeXpGain(input);
  const next: LocalPlayerState = {
    ...prev,
    totalScore: prev.totalScore + Math.max(0, Math.round(input.score)),
    gamesPlayed: prev.gamesPlayed + 1,
    gamesWon: prev.gamesWon + (input.won ? 1 : 0),
    bestStreak: Math.max(prev.bestStreak, input.bestStreak),
    bullseyes: prev.bullseyes + (input.bullseyes ?? 0),
    xp: prev.xp + xpEarned,
  };
  saveLocalPlayer(next);

  const endedAt = new Date().toISOString();
  const sessionEntry: LocalSessionEntry = {
    id: v4FallbackId(),
    playerId: next.playerId,
    username: next.username,
    quizType: input.mode,
    difficulty: input.difficulty ?? "medium",
    totalScore: Math.max(0, Math.round(input.score)),
    questionsAnswered: input.roundsPlayed,
    correctAnswers: input.goodRounds,
    endedAt,
  };
  appendLocalSession(sessionEntry);

  if (!isSupabaseConfigured || !next.authUserId) {
    return { player: next, xpEarned, synced: false };
  }

  try {
    const supabase = getBrowserClient();
    if (!supabase) return { player: next, xpEarned, synced: false };
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { player: next, xpEarned, synced: false };

    // Il server valida punteggio, round, risposte corrette e XP.
    const { error } = await supabase.rpc("record_solo_game", {
      p_mode: sessionEntry.quizType,
      p_difficulty: sessionEntry.difficulty,
      p_score: sessionEntry.totalScore,
      p_rounds: sessionEntry.questionsAnswered,
      p_correct: sessionEntry.correctAnswers,
      p_xp: xpEarned,
    });
    return { player: next, xpEarned, synced: !error };
  } catch {
    return { player: next, xpEarned, synced: false };
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
  const updated: LocalPlayerState = {
    ...loadLocalPlayer(),
    username: cleaned,
  };
  saveLocalPlayer(updated);
  if (updated.gamesPlayed > 0 || updated.authUserId) {
    await syncPlayerToCloud(updated);
  }
  return { ok: true, player: updated };
}

function rankEntries(
  items: Omit<LeaderboardRow, "rank" | "isCurrentPlayer">[],
  currentPlayerId: string
): LeaderboardRow[] {
  return [...items]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 20)
    .map((item, idx) => ({
      ...item,
      rank: idx + 1,
      isCurrentPlayer: item.playerId === currentPlayerId,
    }));
}

/**
 * Carica la classifica reale tramite la RPC `get_leaderboard`
 * (che espone solo aggregati pubblici, mai email o dati privati) e ripiega
 * in modo trasparente sui dati locali quando si è offline o non configurati.
 */
export async function fetchLeaderboard(
  range: TimeRange
): Promise<{ entries: LeaderboardRow[]; source: "cloud" | "local" }> {
  const me = loadLocalPlayer();

  if (isSupabaseConfigured) {
    try {
      const supabase = getBrowserClient();
      if (!supabase) throw new Error("no-client");
      const { data, error } = await supabase.rpc("get_leaderboard", { p_range: range });

      if (!error && Array.isArray(data) && data.length > 0) {
        const byId = new Map<string, Omit<LeaderboardRow, "rank" | "isCurrentPlayer">>();
        for (const row of data) {
          byId.set(row.user_id, {
            playerId: row.user_id,
            username: row.username,
            totalScore: Number(row.total_score),
            gamesPlayed: Number(row.games_played),
            level: Number(row.level),
          });
        }
        if (range === "all" && me.gamesPlayed > 0) {
          const existing = byId.get(me.playerId);
          if (!existing || me.totalScore >= existing.totalScore) {
            byId.set(me.playerId, {
              playerId: me.playerId,
              username: me.username,
              totalScore: me.totalScore,
              gamesPlayed: me.gamesPlayed,
              level: calculateLevel(me.xp).level,
            });
          }
        }
        return {
          entries: rankEntries(Array.from(byId.values()), me.playerId),
          source: "cloud",
        };
      }
    } catch {
      // Passa al fallback locale sotto.
    }
  }

  const fallback = [...SEED_ENTRIES];
  if (me.gamesPlayed > 0) {
    fallback.push({
      playerId: me.playerId,
      username: me.username,
      totalScore: me.totalScore,
      gamesPlayed: me.gamesPlayed,
      level: calculateLevel(me.xp).level,
    });
  }
  return {
    entries: rankEntries(fallback, me.playerId),
    source: "local",
  };
}

/**
 * Ripristina ed allinea l'eventuale sessione Supabase Auth con il profilo locale.
 * Il profilo pubblico (username, livello) e i dati privati (email, punteggi)
 * arrivano dalla RPC `get_my_profile`, che restituisce solo il proprio profilo.
 */
export async function syncAuthSession(): Promise<LocalPlayerState> {
  const local = loadLocalPlayer();
  if (!isSupabaseConfigured) return local;

  try {
    const supabase = getBrowserClient();
    if (!supabase) return local;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return local;

    const { data: cloudData } = await supabase.rpc("get_my_profile");
    const cloud =
      cloudData && typeof cloudData === "object" && !Array.isArray(cloudData)
        ? (cloudData as {
            username?: string;
            email?: string;
            total_score?: number;
            games_played?: number;
            games_won?: number;
            best_streak?: number;
            bullseyes?: number;
            xp?: number;
          })
        : null;

    const merged: LocalPlayerState = {
      ...local,
      authUserId: user.id,
      username: cloud?.username || local.username,
      email: user.email ?? cloud?.email ?? local.email,
      totalScore: Math.max(local.totalScore, Number(cloud?.total_score ?? 0)),
      gamesPlayed: Math.max(local.gamesPlayed, Number(cloud?.games_played ?? 0)),
      gamesWon: Math.max(local.gamesWon, Number(cloud?.games_won ?? 0)),
      bestStreak: Math.max(local.bestStreak, Number(cloud?.best_streak ?? 0)),
      bullseyes: Math.max(local.bullseyes, Number(cloud?.bullseyes ?? 0)),
      xp: Math.max(local.xp, Number(cloud?.xp ?? 0)),
    };
    saveLocalPlayer(merged);
    return merged;
  } catch {
    return local;
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  username?: string
): Promise<{ ok: boolean; player: LocalPlayerState; mode: "cloud" | "local"; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error: "Inserisci un indirizzo email valido.",
    };
  }
  if (password.length < 6) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error: "La password deve avere almeno 6 caratteri.",
    };
  }
  const desiredName = (username?.trim() || cleanEmail.split("@")[0] || "Esploratore").slice(0, 20);
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error:
        "Account cloud non disponibile: Supabase non è configurato. Puoi comunque giocare in locale.",
    };
  }

  try {
    const supabase = getBrowserClient();
    if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { username: desiredName } },
    });
    if (error) {
      return { ok: false, player: loadLocalPlayer(), mode: "cloud", error: error.message };
    }
    const local = loadLocalPlayer();
    const next: LocalPlayerState = {
      ...local,
      authUserId: data.user?.id ?? local.authUserId,
      username: desiredName,
      email: cleanEmail,
    };
    saveLocalPlayer(next);
    await syncPlayerToCloud(next);
    return { ok: true, player: next, mode: "cloud" };
  } catch {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error: "Connessione a Supabase non riuscita. Riprova quando sei online.",
    };
  }
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<{ ok: boolean; player: LocalPlayerState; mode: "cloud" | "local"; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes("@")) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error: "Inserisci un indirizzo email valido.",
    };
  }
  if (password.length < 6) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error: "La password deve avere almeno 6 caratteri.",
    };
  }

  if (!isSupabaseConfigured) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error:
        "Account cloud non disponibile: Supabase non è configurato. Puoi comunque giocare in locale.",
    };
  }

  try {
    const supabase = getBrowserClient();
    if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      return { ok: false, player: loadLocalPlayer(), mode: "cloud", error: error.message };
    }
    const synced = await syncAuthSession();
    return {
      ok: true,
      player: {
        ...synced,
        authUserId: data.user.id,
        email: data.user.email ?? cleanEmail,
      },
      mode: "cloud",
    };
  } catch {
    return {
      ok: false,
      player: loadLocalPlayer(),
      mode: "local",
      error: "Connessione a Supabase non riuscita. Riprova quando sei online.",
    };
  }
}

export async function signOutAccount(): Promise<LocalPlayerState> {
  try {
    const supabase = getBrowserClient();
    await supabase?.auth.signOut();
  } catch {
    // Ignorato se offline.
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
