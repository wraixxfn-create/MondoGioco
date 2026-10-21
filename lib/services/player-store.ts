import { createClient, OFFLINE_ERROR_MESSAGE } from "@/lib/supabase/client";
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
 * Sincronizza il profilo del giocatore su Supabase (tabella `player_profiles`
 * e, se autenticato, anche `profiles`).
 */
export async function syncPlayerToCloud(player: LocalPlayerState): Promise<boolean> {
  try {
    const supabase = createClient();
    const level = calculateLevel(player.xp).level;
    const { error } = await supabase.from("player_profiles").upsert(
      {
        player_id: player.playerId,
        auth_user_id: player.authUserId,
        username: player.username,
        total_score: player.totalScore,
        games_played: player.gamesPlayed,
        games_won: player.gamesWon,
        best_streak: player.bestStreak,
        bullseyes: player.bullseyes,
        level,
        xp: player.xp,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "player_id" }
    );
    if (error) return false;

    if (player.authUserId) {
      await supabase.from("profiles").upsert(
        {
          id: player.authUserId,
          username: player.username,
          email: player.email ?? "",
          total_score: player.totalScore,
          games_played: player.gamesPlayed,
          games_won: player.gamesWon,
          best_streak: player.bestStreak,
          level,
          xp: player.xp,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    }
    return true;
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

  try {
    const supabase = createClient();
    const [profileOk, sessionRes] = await Promise.all([
      syncPlayerToCloud(next),
      supabase.from("game_sessions").insert({
        user_id: next.authUserId,
        player_id: next.playerId,
        username: next.username,
        quiz_type: sessionEntry.quizType,
        difficulty: sessionEntry.difficulty,
        total_score: sessionEntry.totalScore,
        questions_answered: sessionEntry.questionsAnswered,
        correct_answers: sessionEntry.correctAnswers,
        ended_at: endedAt,
      }),
    ]);
    return { player: next, xpEarned, synced: profileOk && !sessionRes.error };
  } catch {
    return { player: next, xpEarned, synced: false };
  }
}

export async function renamePlayer(
  rawUsername: string
): Promise<{ ok: boolean; player: LocalPlayerState; error?: string }> {
  const cleaned = rawUsername.trim();
  if (cleaned.length < 2 || cleaned.length > 24) {
    return {
      ok: false,
      player: loadLocalPlayer(),
      error: "Il nome giocatore deve avere tra 2 e 24 caratteri.",
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

/**
 * Carica la classifica reale da Supabase (con filtro temporale) o ripiega
 * in modo trasparente sui dati salvati in locale quando si è offline.
 */
export async function fetchLeaderboard(
  range: TimeRange
): Promise<{ entries: LeaderboardRow[]; source: "cloud" | "local" }> {
  const me = loadLocalPlayer();

  try {
    const supabase = createClient();
    if (range === "all") {
      const { data, error } = await supabase
        .from("player_profiles")
        .select("player_id, username, total_score, games_played, level")
        .order("total_score", { ascending: false })
        .limit(25);

      if (!error && data) {
        const byId = new Map<string, Omit<LeaderboardRow, "rank" | "isCurrentPlayer">>();
        for (const row of data) {
          byId.set(row.player_id, {
            playerId: row.player_id,
            username: row.username,
            totalScore: row.total_score,
            gamesPlayed: row.games_played,
            level: row.level,
          });
        }
        if (me.gamesPlayed > 0) {
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
    } else {
      const days = range === "week" ? 7 : 30;
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("game_sessions")
        .select("player_id, username, total_score, ended_at")
        .gte("ended_at", since)
        .order("total_score", { ascending: false })
        .limit(200);

      if (!error && data) {
        const agg = new Map<string, Omit<LeaderboardRow, "rank" | "isCurrentPlayer">>();
        for (const row of data) {
          const key = row.player_id ?? row.username;
          const cur = agg.get(key);
          const totalScore = (cur?.totalScore ?? 0) + row.total_score;
          const gamesPlayed = (cur?.gamesPlayed ?? 0) + 1;
          agg.set(key, {
            playerId: key,
            username: row.username,
            totalScore,
            gamesPlayed,
            level: calculateLevel(Math.round(totalScore / 10)).level,
          });
        }
        return {
          entries: rankEntries(Array.from(agg.values()), me.playerId),
          source: "cloud",
        };
      }
    }
  } catch {
    // Passa al fallback locale sotto.
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
 * Ripristina ed allinea l'eventuale sessione Supabase Auth con il profilo locale.
 */
export async function syncAuthSession(): Promise<LocalPlayerState> {
  const local = loadLocalPlayer();
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return local;

    const { data: cloudProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const merged: LocalPlayerState = {
      playerId: local.playerId,
      authUserId: user.id,
      username:
        cloudProfile?.username ||
        (user.user_metadata?.username as string | undefined) ||
        local.username,
      email: user.email ?? local.email,
      totalScore: Math.max(local.totalScore, cloudProfile?.total_score ?? 0),
      gamesPlayed: Math.max(local.gamesPlayed, cloudProfile?.games_played ?? 0),
      gamesWon: Math.max(local.gamesWon, cloudProfile?.games_won ?? 0),
      bestStreak: Math.max(local.bestStreak, cloudProfile?.best_streak ?? 0),
      bullseyes: local.bullseyes,
      xp: Math.max(local.xp, cloudProfile?.xp ?? 0),
    };
    saveLocalPlayer(merged);
    await syncPlayerToCloud(merged);
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
  const desiredName = (username?.trim() || cleanEmail.split("@")[0] || "Esploratore").slice(0, 24);

  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: { data: { username: desiredName } },
    });
    if (error) {
      if (error.message === OFFLINE_ERROR_MESSAGE) {
        const local = loadLocalPlayer();
        const next: LocalPlayerState = {
          ...local,
          username: desiredName,
          email: cleanEmail,
        };
        saveLocalPlayer(next);
        return { ok: true, player: next, mode: "local" };
      }
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
    const local = loadLocalPlayer();
    const next: LocalPlayerState = {
      ...local,
      username: desiredName,
      email: cleanEmail,
    };
    saveLocalPlayer(next);
    return { ok: true, player: next, mode: "local" };
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

  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    if (error) {
      if (error.message === OFFLINE_ERROR_MESSAGE) {
        const local = loadLocalPlayer();
        const next: LocalPlayerState = {
          ...local,
          email: cleanEmail,
        };
        saveLocalPlayer(next);
        return { ok: true, player: next, mode: "local" };
      }
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
    const local = loadLocalPlayer();
    const next: LocalPlayerState = {
      ...local,
      email: cleanEmail,
    };
    saveLocalPlayer(next);
    return { ok: true, player: next, mode: "local" };
  }
}

export async function signOutAccount(): Promise<LocalPlayerState> {
  try {
    const supabase = createClient();
    await supabase.auth.signOut();
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
