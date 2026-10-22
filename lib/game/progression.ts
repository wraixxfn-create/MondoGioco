// ============================================================
// MondoGioco — Progressione: XP, livelli, obiettivi, streak
// ============================================================
//
// Logica PURA (nessuna dipendenza da React/DOM/localStorage) condivisa da
// `lib/services/player-store.ts` (offline/locale) e rispecchiata lato server
// nella migrazione `supabase/migrations/005_progression.sql`.
//
// Le due implementazioni DEVONO restare allineate: stesse id degli obiettivi,
// stesse soglie, stessi XP, stessi avatar cosmetici. La fonte autorevole per
// gli utenti autenticati è il server: gli XP obiettivo vengono accreditati
// una sola volta grazie alla chiave primaria (user_id, achievement_id) di
// `app_private.user_achievements`. Il locale usa la stessa lista
// `unlockedAchievements` persistita nel profilo del dispositivo, così una
// ricompensa non è duplicabile nemmeno con richieste/chiamate ripetute.
//
// Regole XP documentate (vedi docs/PROGRESSION.md):
//   XP partita = max(25, round(score/12) + 40·bullseyes + 15·round + 75 se vinto)
//   XP obiettivo = valore fisso in `ACHIEVEMENTS`, una sola volta per sempre.
//   Livello: costo del livello n = floor(100 · n^1.5) XP (vedi calculateLevel).

// ------------------------------------------------------------
// XP di partita
// ------------------------------------------------------------

export interface GameXpInput {
  score: number;
  roundsPlayed: number;
  bullseyes?: number;
  won?: boolean;
}

/** Costanti delle regole XP (unica fonte per UI, test e documentazione). */
export const XP_RULES = {
  /** XP minimi per qualsiasi partita con almeno un round giocato. */
  minimumPerGame: 25,
  /** Un XP ogni N punti di punteggio. */
  scoreDivisor: 12,
  /** XP per ogni colpo entro 100 km ("bullseye"). */
  perBullseye: 40,
  /** XP per ogni round giocato. */
  perRound: 15,
  /** Bonus XP se la partita è considerata vinta. */
  winBonus: 75,
} as const;

export function computeGameXp(input: GameXpInput): number {
  if (input.roundsPlayed <= 0) return 0;
  const fromScore = Math.round(input.score / XP_RULES.scoreDivisor);
  const fromBullseyes = (input.bullseyes ?? 0) * XP_RULES.perBullseye;
  const fromRounds = input.roundsPlayed * XP_RULES.perRound;
  const winBonus = input.won ? XP_RULES.winBonus : 0;
  return Math.max(XP_RULES.minimumPerGame, fromScore + fromBullseyes + fromRounds + winBonus);
}

// ------------------------------------------------------------
// Statistiche aggregate usate per obiettivi e record
// ------------------------------------------------------------

export interface ProgressionStats {
  gamesPlayed: number;
  gamesWon: number;
  totalScore: number;
  bullseyes: number;
  bestStreak: number;
  bestScore: number;
  totalRounds: number;
  totalCorrect: number;
  multiplayerGames: number;
  multiplayerWins: number;
  longestDailyStreak: number;
}

export const EMPTY_PROGRESSION_STATS: ProgressionStats = {
  gamesPlayed: 0,
  gamesWon: 0,
  totalScore: 0,
  bullseyes: 0,
  bestStreak: 0,
  bestScore: 0,
  totalRounds: 0,
  totalCorrect: 0,
  multiplayerGames: 0,
  multiplayerWins: 0,
  longestDailyStreak: 0,
};

// ------------------------------------------------------------
// Obiettivi (achievement)
// ------------------------------------------------------------

export type AchievementMetric = keyof ProgressionStats;

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  xp: number;
  metric: AchievementMetric;
  threshold: number;
}

/**
 * Catalogo completo. Gli `id` sono stabili e non vanno mai riusati per un
 * significato diverso: sono chiavi persistite nel DB e nel profilo locale.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_game",
    title: "Prima Partita",
    description: "Completa la tua prima partita",
    icon: "🎲",
    xp: 100,
    metric: "gamesPlayed",
    threshold: 1,
  },
  {
    id: "bullseye_1",
    title: "Occhio di Falco",
    description: "Centra almeno un obiettivo entro 100 km",
    icon: "🎯",
    xp: 250,
    metric: "bullseyes",
    threshold: 1,
  },
  {
    id: "multiplayer_1",
    title: "Debutto Online",
    description: "Termina una partita multiplayer online",
    icon: "🌐",
    xp: 200,
    metric: "multiplayerGames",
    threshold: 1,
  },
  {
    id: "streak_5",
    title: "Serie Perfetta",
    description: "Ottieni una serie di 5 risposte buone di fila in una partita",
    icon: "🔥",
    xp: 300,
    metric: "bestStreak",
    threshold: 5,
  },
  {
    id: "multiplayer_win_1",
    title: "Prima Vittoria Online",
    description: "Vinci una partita multiplayer online",
    icon: "🥇",
    xp: 400,
    metric: "multiplayerWins",
    threshold: 1,
  },
  {
    id: "explorer_10",
    title: "Esploratore",
    description: "Gioca almeno 10 partite",
    icon: "🧭",
    xp: 500,
    metric: "gamesPlayed",
    threshold: 10,
  },
  {
    id: "correct_50",
    title: "Mente Geografica",
    description: "Totalizza 50 round buoni in carriera",
    icon: "🧠",
    xp: 600,
    metric: "totalCorrect",
    threshold: 50,
  },
  {
    id: "daily_7",
    title: "Settimana da Esploratore",
    description: "Gioca per 7 giorni consecutivi",
    icon: "📅",
    xp: 700,
    metric: "longestDailyStreak",
    threshold: 7,
  },
  {
    id: "winner_5",
    title: "Campione",
    description: "Vinci 5 partite",
    icon: "🏆",
    xp: 750,
    metric: "gamesWon",
    threshold: 5,
  },
  {
    id: "best_score_20000",
    title: "Partita da Record",
    description: "Segna almeno 20.000 punti in una singola partita",
    icon: "💎",
    xp: 800,
    metric: "bestScore",
    threshold: 20000,
  },
  {
    id: "cartographer_25000",
    title: "Cartografo",
    description: "Supera 25.000 punti complessivi",
    icon: "🗺️",
    xp: 1000,
    metric: "totalScore",
    threshold: 25000,
  },
  {
    id: "games_50",
    title: "Giramondo",
    description: "Gioca almeno 50 partite",
    icon: "🌍",
    xp: 1500,
    metric: "gamesPlayed",
    threshold: 50,
  },
];

export function getAchievement(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Avanzamento 0..1 verso un obiettivo (per le barre di progresso nella UI). */
export function achievementProgress(def: AchievementDef, stats: ProgressionStats): number {
  if (def.threshold <= 0) return 1;
  return Math.min(1, Math.max(0, stats[def.metric] / def.threshold));
}

/**
 * Valuta quali obiettivi risultano NUOVAMENTE sbloccati dato lo stato
 * corrente. Gli obiettivi già in `alreadyUnlocked` non vengono mai
 * restituiti di nuovo: è il meccanismo anti-duplicazione lato client,
 * equivalente alla PK (user_id, achievement_id) lato server.
 */
export function evaluateAchievements(
  stats: ProgressionStats,
  alreadyUnlocked: Iterable<string>
): { newlyUnlocked: AchievementDef[]; xpAwarded: number } {
  const owned = new Set(alreadyUnlocked);
  const newlyUnlocked = ACHIEVEMENTS.filter(
    (def) => !owned.has(def.id) && stats[def.metric] >= def.threshold
  );
  return {
    newlyUnlocked,
    xpAwarded: newlyUnlocked.reduce((sum, def) => sum + def.xp, 0),
  };
}

// ------------------------------------------------------------
// Streak giornaliera
// ------------------------------------------------------------

/** Chiave data locale `YYYY-MM-DD` a partire da una data (fuso del dispositivo). */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function previousDateKey(dateKey: string): string {
  // Mezzogiorno UTC evita gli scivolamenti di ora legale nel calcolo ±1 giorno.
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Calcola la nuova streak giornaliera registrando una partita "oggi".
 * - stesso giorno dell'ultima partita → streak invariata;
 * - giorno immediatamente successivo → streak + 1;
 * - qualsiasi altro caso (salto, prima partita) → streak ricomincia da 1.
 */
export function nextDailyStreak(
  lastPlayedOn: string | null,
  currentStreak: number,
  todayKey: string
): number {
  if (lastPlayedOn === todayKey) return Math.max(1, currentStreak);
  if (lastPlayedOn && previousDateKey(todayKey) === lastPlayedOn) {
    return Math.max(1, currentStreak) + 1;
  }
  return 1;
}

// ------------------------------------------------------------
// Avatar e ricompense cosmetiche (mai vantaggi di gioco)
// ------------------------------------------------------------

export interface AvatarDef {
  id: string;
  emoji: string;
  label: string;
  /** Livello minimo per poterlo selezionare (ricompensa puramente cosmetica). */
  unlockLevel: number;
}

export const AVATARS: AvatarDef[] = [
  { id: "globe", emoji: "🌍", label: "Globo", unlockLevel: 1 },
  { id: "compass", emoji: "🧭", label: "Bussola", unlockLevel: 1 },
  { id: "owl", emoji: "🦉", label: "Gufo", unlockLevel: 2 },
  { id: "fox", emoji: "🦊", label: "Volpe", unlockLevel: 3 },
  { id: "penguin", emoji: "🐧", label: "Pinguino", unlockLevel: 4 },
  { id: "rocket", emoji: "🚀", label: "Razzo", unlockLevel: 5 },
  { id: "crown", emoji: "👑", label: "Corona", unlockLevel: 7 },
  { id: "dragon", emoji: "🐲", label: "Drago", unlockLevel: 10 },
];

export const DEFAULT_AVATAR_ID = "globe";

export function getAvatar(id: string | null | undefined): AvatarDef {
  return AVATARS.find((a) => a.id === id) ?? AVATARS[0];
}

export function isAvatarUnlocked(id: string, level: number): boolean {
  const avatar = AVATARS.find((a) => a.id === id);
  return Boolean(avatar) && level >= avatar!.unlockLevel;
}

/** Titolo cosmetico associato al livello (mostrato nel profilo/classifiche). */
export function levelTitle(level: number): string {
  if (level >= 15) return "Leggenda dei Sette Mari";
  if (level >= 10) return "Grande Navigatore";
  if (level >= 7) return "Cartografo";
  if (level >= 5) return "Viaggiatore Esperto";
  if (level >= 3) return "Esploratore";
  return "Apprendista Esploratore";
}

// ------------------------------------------------------------
// Impostazioni utente
// ------------------------------------------------------------

export interface UserSettings {
  /** Disattiva animazioni e rotazione automatica (oltre a prefers-reduced-motion). */
  reduceMotion: boolean;
  /** Rotazione automatica del globo nelle schermate non di gioco. */
  globeAutoRotate: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  reduceMotion: false,
  globeAutoRotate: true,
};

/** Normalizza impostazioni da storage/DB (accetta anche le chiavi snake_case del DB). */
export function normalizeUserSettings(raw: unknown): UserSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_USER_SETTINGS };
  const obj = raw as Record<string, unknown>;
  return {
    reduceMotion:
      typeof obj.reduceMotion === "boolean"
        ? obj.reduceMotion
        : typeof obj.reduce_motion === "boolean"
          ? obj.reduce_motion
          : DEFAULT_USER_SETTINGS.reduceMotion,
    globeAutoRotate:
      typeof obj.globeAutoRotate === "boolean"
        ? obj.globeAutoRotate
        : typeof obj.globe_auto_rotate === "boolean"
          ? obj.globe_auto_rotate
          : DEFAULT_USER_SETTINGS.globeAutoRotate,
  };
}

/** Forma persistita nel DB (`app_private.profile_private.settings`). */
export function userSettingsToDb(settings: UserSettings): Record<string, boolean> {
  return { reduce_motion: settings.reduceMotion, globe_auto_rotate: settings.globeAutoRotate };
}

// ------------------------------------------------------------
// Statistiche derivate dallo storico partite
// ------------------------------------------------------------

/** Forma normalizzata di una partita conclusa, indipendente dalla sorgente. */
export interface SessionStatInput {
  mode: string;
  score: number;
  rounds: number;
  correct: number;
  endedAt: string;
  won?: boolean;
}

export function isMultiplayerMode(mode: string): boolean {
  return mode.startsWith("multiplayer");
}

export interface ModeStats {
  mode: string;
  games: number;
  wins: number;
  totalScore: number;
  bestScore: number;
  rounds: number;
  correct: number;
  /** 0..1, oppure null se non è stato giocato alcun round (dato mancante ≠ 0%). */
  accuracy: number | null;
  averageScore: number | null;
}

export interface DerivedStats {
  games: number;
  totalRounds: number;
  totalCorrect: number;
  /** 0..1 oppure null quando non ci sono round: mai mostrare "0%" inventato. */
  accuracy: number | null;
  /** Media punti per partita, null senza partite. */
  averageScore: number | null;
  /** Miglior punteggio in una singola partita (record personale). */
  bestScore: number;
  multiplayerGames: number;
  multiplayerWins: number;
  byMode: ModeStats[];
}

export function deriveStats(sessions: SessionStatInput[]): DerivedStats {
  let totalRounds = 0;
  let totalCorrect = 0;
  let totalScore = 0;
  let bestScore = 0;
  let multiplayerGames = 0;
  let multiplayerWins = 0;
  const modes = new Map<string, ModeStats>();

  for (const s of sessions) {
    const rounds = Math.max(0, s.rounds);
    const correct = Math.min(Math.max(0, s.correct), rounds || Math.max(0, s.correct));
    const score = Math.max(0, s.score);
    totalRounds += rounds;
    totalCorrect += correct;
    totalScore += score;
    bestScore = Math.max(bestScore, score);

    if (isMultiplayerMode(s.mode)) {
      multiplayerGames += 1;
      if (s.won) multiplayerWins += 1;
    }

    const existing = modes.get(s.mode) ?? {
      mode: s.mode,
      games: 0,
      wins: 0,
      totalScore: 0,
      bestScore: 0,
      rounds: 0,
      correct: 0,
      accuracy: null,
      averageScore: null,
    };
    existing.games += 1;
    existing.wins += s.won ? 1 : 0;
    existing.totalScore += score;
    existing.bestScore = Math.max(existing.bestScore, score);
    existing.rounds += rounds;
    existing.correct += correct;
    modes.set(s.mode, existing);
  }

  const byMode = Array.from(modes.values())
    .map((m) => ({
      ...m,
      accuracy: m.rounds > 0 ? m.correct / m.rounds : null,
      averageScore: m.games > 0 ? Math.round(m.totalScore / m.games) : null,
    }))
    .sort((a, b) => b.games - a.games || b.totalScore - a.totalScore);

  return {
    games: sessions.length,
    totalRounds,
    totalCorrect,
    accuracy: totalRounds > 0 ? totalCorrect / totalRounds : null,
    averageScore: sessions.length > 0 ? Math.round(totalScore / sessions.length) : null,
    bestScore,
    multiplayerGames,
    multiplayerWins,
    byMode,
  };
}

/** Etichetta italiana della modalità (incluso il quiz delle partite multiplayer). */
export function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    training: "Allenamento libero",
    challenge: "Sfida a round",
    timed: "Contro il tempo",
    multiplayer: "Multiplayer online",
  };
  if (labels[mode]) return labels[mode];
  if (mode.startsWith("multiplayer_")) {
    const quiz = mode.slice("multiplayer_".length);
    const quizLabels: Record<string, string> = {
      capital: "Capitali",
      flag: "Bandiere",
      location: "Posizione",
      population: "Popolazione",
      continent: "Continenti",
    };
    return `Multiplayer · ${quizLabels[quiz] ?? quiz}`;
  }
  return mode;
}

// ------------------------------------------------------------
// Classifiche: ordinamento e pareggi
// ------------------------------------------------------------

/**
 * Regola di ordinamento condivisa client/server:
 *   1. punteggio totale decrescente;
 *   2. a parità di punti, chi ha giocato MENO partite sta davanti
 *      (stesso risultato con meno tentativi = efficienza maggiore);
 *   3. infine username crescente, per un ordine deterministico e stabile.
 * La POSIZIONE (rank) dipende però solo dai punti: due giocatori con lo
 * stesso punteggio condividono la posizione ("competition ranking":
 * 1, 2, 2, 4) anche se l'ordinamento visuale li distingue.
 */
export function compareLeaderboardEntries(
  a: { totalScore: number; gamesPlayed: number; username: string },
  b: { totalScore: number; gamesPlayed: number; username: string }
): number {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;
  return a.username.localeCompare(b.username, "it");
}

/** Assegna le posizioni con pareggi condivisi (1, 2, 2, 4). Input già ordinato. */
export function assignRanks<T extends { totalScore: number }>(
  sorted: T[]
): Array<T & { rank: number }> {
  let previousScore: number | null = null;
  let previousRank = 0;
  return sorted.map((entry, index) => {
    const rank =
      previousScore !== null && entry.totalScore === previousScore ? previousRank : index + 1;
    previousScore = entry.totalScore;
    previousRank = rank;
    return { ...entry, rank };
  });
}

/** Formatta un'accuratezza 0..1 come percentuale, o "—" se il dato manca. */
export function formatAccuracy(accuracy: number | null | undefined): string {
  if (accuracy === null || accuracy === undefined) return "—";
  return `${Math.round(accuracy * 100)}%`;
}
