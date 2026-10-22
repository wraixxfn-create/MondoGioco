"use client";
"use no memo";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Card, Pill } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Timer } from "@/components/ui/Timer";
import { LOCATIONS, categoryLabel } from "@/data/locations";
import {
  createGame,
  submitGuess,
  advanceRound,
  revealNextHint,
  finishGame,
  currentTarget,
  summarize,
  EmptyDatasetError,
  createSeededRng,
  dailySeed,
  type GeoGameState,
  type GeoGameConfig,
} from "@/lib/game/engine";
import {
  formatDistance,
  distanceVerdict,
  greatCircleMidpoint,
  isValidCoordinates,
} from "@/lib/game/geo";
import { formatNumber, continentLabel } from "@/lib/utils";
import { recordGameResult } from "@/lib/services/player-store";
import { v4FallbackId } from "@/lib/utils/id";
import type { AchievementDef } from "@/lib/game/progression";
import Link from "next/link";
import type { GeoCoordinates, GeoGameMode } from "@/types";

const GlobeContainer = dynamic(
  () => import("@/components/globe/Globe").then((mod) => mod.GlobeContainer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[360px] flex items-center justify-center bg-gradient-to-br from-[#0f1a33]/60 to-[#16244d]/40 rounded-[1.5rem] border border-white/10 backdrop-blur-sm">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-3">
            <div className="absolute inset-0 rounded-full border-4 border-white/10" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#00d9a5] animate-spin" />
            <span className="absolute inset-0 flex items-center justify-center text-2xl">🌍</span>
          </div>
          <p className="text-white/60 text-sm font-medium">Caricamento del globo…</p>
        </div>
      </div>
    ),
  }
);

type Screen = "menu" | "game" | "summary" | "error";

const MODE_CARDS: {
  mode: GeoGameMode;
  icon: string;
  badge?: string;
  title: string;
  description: string;
  rules: string;
  accent: string;
}[] = [
  {
    mode: "challenge",
    icon: "🏆",
    badge: "CLASSICA",
    title: "Sfida a round",
    description: "5–10 round, 60s l'uno. La modalità regina.",
    rules: "Punteggio cumulativo · indizi −10%",
    accent: "from-amber-400 to-orange-500",
  },
  {
    mode: "sprint",
    icon: "⚡",
    title: "Sprint",
    description: "5 round in 15s l'uno. Riflessi puri.",
    rules: "15s/round · combo +5% per streak",
    accent: "from-cyan-400 to-blue-500",
  },
  {
    mode: "precision",
    icon: "🎯",
    title: "Precisione",
    description: "5 round senza timer. Ogni metro conta.",
    rules: "No timer · indizi −25% · bonus combo",
    accent: "from-emerald-400 to-teal-500",
  },
  {
    mode: "survival",
    icon: "🛡️",
    title: "Sopravvivenza",
    description: "3 vite. Ogni errore >1500 km ti costa.",
    rules: "Vite 3 · 45s/round · infinito",
    accent: "from-rose-400 to-pink-500",
  },
  {
    mode: "daily",
    icon: "📅",
    badge: "OGGI",
    title: "Sfida quotidiana",
    description: "Stessi 5 luoghi per tutti, ogni giorno.",
    rules: "Seed giornaliero · classifica del giorno",
    accent: "from-violet-400 to-purple-500",
  },
  {
    mode: "timed",
    icon: "⏱️",
    title: "Contro il tempo",
    description: "120s totali. Più round possibili.",
    rules: "Timer totale · ritmo serrato",
    accent: "from-slate-400 to-slate-600",
  },
  {
    mode: "training",
    icon: "🧭",
    title: "Allenamento",
    description: "Senza pressione, indizi gratis.",
    rules: "∞ round · impara esplorando",
    accent: "from-sky-400 to-indigo-500",
  },
];

export default function PlayPage() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [selectedMode, setSelectedMode] = useState<GeoGameMode>("challenge");
  const [challengeRounds, setChallengeRounds] = useState(5);
  const [timedSeconds, setTimedSeconds] = useState(120);
  const [game, setGame] = useState<GeoGameState | null>(null);
  const [pendingGuess, setPendingGuess] = useState<GeoCoordinates | null>(null);
  const [focusCoords, setFocusCoords] = useState<GeoCoordinates | null>(null);
  const [now, setNow] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const [newAchievements, setNewAchievements] = useState<AchievementDef[]>([]);
  const [resultSynced, setResultSynced] = useState<boolean | null>(null);
  const [showHintCost, setShowHintCost] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const savedGameRef = useRef<GeoGameState | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const pendingRef = useRef<GeoCoordinates | null>(null);
  pendingRef.current = pendingGuess;
  const gameRef = useRef<GeoGameState | null>(null);
  gameRef.current = game;

  const buildConfig = useCallback((): GeoGameConfig => {
    switch (selectedMode) {
      case "training":
        return { mode: "training", totalRounds: Infinity, secondsPerRound: 0, totalSeconds: 0 };
      case "challenge":
        return {
          mode: "challenge",
          totalRounds: challengeRounds,
          secondsPerRound: 60,
          totalSeconds: 0,
        };
      case "timed":
        return {
          mode: "timed",
          totalRounds: Infinity,
          secondsPerRound: 0,
          totalSeconds: timedSeconds,
        };
      case "sprint":
        return { mode: "sprint", totalRounds: 5, secondsPerRound: 15, totalSeconds: 0, comboEnabled: true };
      case "precision":
        return { mode: "precision", totalRounds: 5, secondsPerRound: 0, totalSeconds: 0, comboEnabled: true };
      case "survival":
        return { mode: "survival", totalRounds: Infinity, secondsPerRound: 45, totalSeconds: 0, lives: 3, comboEnabled: true };
      case "daily":
        return { mode: "daily", totalRounds: 5, secondsPerRound: 60, totalSeconds: 0, comboEnabled: true };
      default:
        return { mode: "challenge", totalRounds: 5, secondsPerRound: 60, totalSeconds: 0 };
    }
  }, [selectedMode, challengeRounds, timedSeconds]);

  const startGame = useCallback(() => {
    try {
      const cfg = buildConfig();
      const rng = cfg.mode === "daily" ? createSeededRng(dailySeed(new Date())) : Math.random;
      const g = createGame(LOCATIONS, cfg, rng as unknown as () => number, Date.now());
      setGame(g);
      setNow(Date.now());
      setPendingGuess(null);
      setFocusCoords(null);
      setAnnouncement("");
      setXpEarned(null);
      setNewAchievements([]);
      setResultSynced(null);
      sessionIdRef.current = v4FallbackId();
      savedGameRef.current = null;
      setScreen("game");
    } catch (err) {
      setErrorMsg(
        err instanceof EmptyDatasetError
          ? "Il dataset dei luoghi non è disponibile: impossibile avviare la partita. Ricarica la pagina o riprova più tardi."
          : "Si è verificato un errore imprevisto durante l'avvio della partita."
      );
      setScreen("error");
    }
  }, [buildConfig]);

  const doSubmit = useCallback((guess: GeoCoordinates | null, at: number) => {
    setGame((prev) => {
      if (!prev || prev.phase !== "playing") return prev;
      const next = submitGuess(prev, guess, at);
      const result = next.results[next.results.length - 1];
      if (result) {
        setAnnouncement(
          result.timedOut
            ? `Tempo scaduto. La destinazione era ${result.location.name}, ${result.location.country}. Zero punti.`
            : `${distanceVerdict(result.distanceKm!)} Distanza ${formatDistance(result.distanceKm!)}. Hai guadagnato ${result.score} punti.${result.bonusScore ? ` Bonus combo +${result.bonusScore}!` : ""}`
        );
        setFocusCoords(
          result.guess
            ? greatCircleMidpoint(result.guess, result.location.coordinates)
            : result.location.coordinates
        );
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (screen !== "game") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const g = gameRef.current;
      if (!g || g.phase !== "playing") return;
      const roundOut = g.roundExpiresAt !== null && t >= g.roundExpiresAt;
      const gameOut = g.gameExpiresAt !== null && t >= g.gameExpiresAt;
      if (roundOut || gameOut) {
        const deadline = gameOut ? g.gameExpiresAt! : g.roundExpiresAt!;
        doSubmit(pendingRef.current, Math.min(t, deadline - 1));
      }
    }, 200);
    return () => clearInterval(id);
  }, [screen, doSubmit]);

  // Auto-advance opzionale dopo reveal (evita tempi morti)
  useEffect(() => {
    if (!autoAdvance || screen !== "game" || game?.phase !== "revealed") return;
    const id = setTimeout(() => {
      handleNext();
    }, 2200);
    return () => clearTimeout(id);
  }, [autoAdvance, screen, game?.phase]);

  useEffect(() => {
    if (screen !== "summary" || !game || savedGameRef.current === game) return;
    savedGameRef.current = game;
    const summary = summarize(game);
    if (summary.roundsPlayed === 0) return;

    let streak = 0;
    let bestStreak = 0;
    let goodRounds = 0;
    for (const r of summary.results) {
      if (!r.timedOut && r.distanceKm != null && r.distanceKm <= 700) {
        goodRounds++;
        streak++;
        bestStreak = Math.max(bestStreak, streak);
      } else {
        streak = 0;
      }
    }

    void recordGameResult({
      mode: game.config.mode,
      difficulty: game.config.mode === "training" ? "easy" : "medium",
      score: summary.totalScore,
      roundsPlayed: summary.roundsPlayed,
      goodRounds,
      bestStreak: summary.bestStreak ?? bestStreak,
      bullseyes: summary.bullseyes,
      won: summary.averageScore >= 2500,
      sessionId: sessionIdRef.current ?? undefined,
    }).then((res) => {
      setXpEarned(res.xpEarned);
      setNewAchievements(res.newlyUnlocked);
      setResultSynced(res.synced);
    });
  }, [screen, game]);

  const target = game ? currentTarget(game) : undefined;
  const lastResult = game?.results[game.results.length - 1];
  const revealed = game?.phase === "revealed";

  const handleConfirm = useCallback(() => {
    if (pendingRef.current) doSubmit(pendingRef.current, Date.now());
  }, [doSubmit]);

  const handleNext = useCallback(() => {
    const prev = gameRef.current;
    if (!prev) return;
    const next = advanceRound(prev, Date.now());
    setGame(next);
    if (next.phase === "finished") {
      setScreen("summary");
    } else {
      setPendingGuess(null);
    }
  }, []);

  const handleQuitToSummary = useCallback(() => {
    setGame((prev) => (prev ? finishGame(prev) : prev));
    setScreen("summary");
  }, []);

  const roundSecondsLeft =
    game?.roundExpiresAt != null
      ? Math.max(0, Math.ceil((game.roundExpiresAt - now) / 1000))
      : null;
  const gameSecondsLeft =
    game?.gameExpiresAt != null ? Math.max(0, Math.ceil((game.gameExpiresAt - now) / 1000)) : null;
  const totalProgress =
    game && ["challenge", "sprint", "precision", "daily"].includes(game.config.mode)
      ? Math.min(100, (game.results.length / game.config.totalRounds) * 100)
      : null;

  if (screen === "error") {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-4xl">🧭</div>
        <h1 className="text-3xl font-bold text-white">Impossibile avviare la partita</h1>
        <p className="text-white/60">{errorMsg}</p>
        <Button size="lg" onClick={() => setScreen("menu")}>
          Torna al menu
        </Button>
      </div>
    );
  }

  if (screen === "summary" && game) {
    const s = summarize(game);
    const grade =
      s.roundsPlayed === 0
        ? "Nessun round giocato"
        : s.averageScore >= 4200
          ? "🌟 Leggenda cartografica!"
          : s.averageScore >= 3200
            ? "🧭 Maestro esploratore!"
            : s.averageScore >= 2200
              ? "🗺️ Viaggiatore brillante!"
              : s.averageScore >= 1200
                ? "🎒 Promessa del globo"
                : "🌱 Ogni viaggio inizia così";
    const modeLabelMap: Record<string, string> = {
      challenge: "Sfida a round",
      sprint: "Sprint",
      precision: "Precisione",
      survival: "Sopravvivenza",
      daily: "Sfida giornaliera",
      timed: "Contro il tempo",
      training: "Allenamento",
    };

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header risultato */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase text-white/70">
              {modeLabelMap[game.config.mode] ?? game.config.mode} • {s.roundsPlayed} round
            </span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">{grade}</h1>
          <p className="text-white/60">Ecco come è andata — ogni metro conta, ogni gara insegna.</p>
        </div>

        {/* Card punteggio hero */}
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-b from-[#16244d]/90 to-[#0f1a33]/95 backdrop-blur-xl p-6 md:p-8">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-gradient-to-br from-[#00d9a5]/20 to-[#38bdf8]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-gradient-to-br from-violet-500/15 to-pink-500/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div>
                <div className="text-xs font-bold tracking-widest uppercase text-white/50">Punteggio totale</div>
                <div className="text-5xl md:text-6xl font-black tracking-tighter text-white">
                  {formatNumber(s.totalScore)}
                  <span className="text-lg font-semibold text-white/40 ml-2">/ {formatNumber(s.maxPossibleScore)}</span>
                </div>
                {s.totalBonus > 0 && (
                  <div className="inline-flex items-center gap-2 mt-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/20">
                    <span className="text-amber-300 text-sm font-bold">🔥 Bonus combo +{formatNumber(s.totalBonus)}</span>
                  </div>
                )}
              </div>

              {xpEarned != null && xpEarned > 0 && (
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2 w-fit">
                  <span className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-xs text-white font-bold">XP</span>
                  +{formatNumber(xpEarned)} XP · {resultSynced ? "Sincronizzato nel cloud" : "Salvato localmente"}
                </div>
              )}

              {newAchievements.length > 0 && (
                <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-500/15 to-orange-500/10 px-4 py-3">
                  <p className="text-sm font-bold text-amber-200">
                    🏆 {newAchievements.length === 1 ? "Nuovo obiettivo sbloccato!" : "Nuovi obiettivi sbloccati!"}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {newAchievements.map((a) => (
                      <li key={a.id} className="text-sm text-white/90 flex items-center gap-2">
                        <span>{a.icon}</span> <strong>{a.title}</strong> <span className="ml-auto text-amber-300">+{a.xp} XP</span>
                      </li>
                    ))}
                  </ul>
                  <Link href="/profile" className="inline-block mt-3 text-sm font-semibold text-emerald-300 underline underline-offset-4">
                    Vedi tutti gli obiettivi →
                  </Link>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                <div className="text-2xl font-black text-white">{s.roundsPlayed}</div>
                <div className="text-[11px] font-bold tracking-widest uppercase text-white/50">Round giocati</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                <div className="text-2xl font-black text-cyan-300">{s.bestStreak > 0 ? `×${s.bestStreak}` : "—"}</div>
                <div className="text-[11px] font-bold tracking-widest uppercase text-white/50">Miglior combo</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                <div className="text-2xl font-black text-emerald-300">{s.bestDistanceKm != null ? formatDistance(s.bestDistanceKm) : "—"}</div>
                <div className="text-[11px] font-bold tracking-widest uppercase text-white/50">Migliore distanza</div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 text-center">
                <div className="text-2xl font-black text-violet-300">{s.bullseyes}</div>
                <div className="text-[11px] font-bold tracking-widest uppercase text-white/50">Bullseye ≤100km</div>
              </div>
            </div>
          </div>

          {/* Barra precisione */}
          <div className="mt-6">
            <div className="flex justify-between text-xs font-semibold text-white/60 mb-2">
              <span>Precisione media</span>
              <span>{s.averageDistanceKm != null ? formatDistance(s.averageDistanceKm) : "—"} • {s.averageScore} pt/round</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00d9a5] to-[#38bdf8] transition-all duration-700"
                style={{ width: `${Math.min(100, (s.averageScore / 5000) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Confronto round */}
        {s.results.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-bold tracking-widest uppercase text-white/60">Dettaglio round — cosa hai imparato</h2>
            <div className="grid gap-3">
              {s.results.map((r, i) => {
                const quality =
                  r.timedOut
                    ? { bg: "bg-white/5 border-white/10", emoji: "⌛", label: "Tempo scaduto" }
                    : r.distanceKm! <= 100
                      ? { bg: "bg-emerald-500/10 border-emerald-500/20", emoji: "🎯", label: "Perfetto" }
                      : r.distanceKm! <= 700
                        ? { bg: "bg-cyan-500/10 border-cyan-500/20", emoji: "👏", label: "Ottimo" }
                        : r.distanceKm! <= 1500
                          ? { bg: "bg-amber-500/10 border-amber-500/20", emoji: "🧭", label: "Buono" }
                          : { bg: "bg-rose-500/10 border-rose-500/20", emoji: "🌍", label: "Lontano" };
                return (
                  <div key={`${r.location.id}-${i}`} className={`rounded-2xl border p-4 backdrop-blur-sm transition-all hover:scale-[1.01] ${quality.bg}`}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-xl shrink-0">
                        {quality.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold truncate">{r.location.name}</span>
                          <span className="text-white/50 text-sm truncate">• {r.location.country}</span>
                          {r.bonusScore ? (
                            <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/20">
                              Combo ×{r.comboMultiplier?.toFixed(2)} +{r.bonusScore}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-white/60 flex flex-wrap gap-2 mt-1">
                          <span>{r.timedOut ? "Nessuna risposta in tempo" : `A ${formatDistance(r.distanceKm!)} • ${r.timeSpentSeconds.toFixed(1)}s`}</span>
                          {r.hintsUsed > 1 && <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/10">{r.hintsUsed} indizi</span>}
                          <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${quality.bg}`}>{quality.label}</span>
                        </div>
                      </div>
                      <div className={`text-lg font-black ${r.score > 0 ? "text-white" : "text-white/30"}`}>+{formatNumber(r.score)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <Button size="lg" onClick={startGame} className="flex-1">
            🔄 Gioca ancora
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setScreen("menu")} className="flex-1">
            Cambia modalità
          </Button>
          <Link href="/leaderboard" className="flex-1">
            <Button size="lg" variant="secondary" className="w-full">
              🏆 Classifica
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (screen === "menu" || !game) {
    return (
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Hero menu */}
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#16244d]/80 via-[#111e3a]/90 to-[#0f1a33]/95 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-br from-[#00d9a5]/10 via-transparent to-[#0ea5e9]/10 pointer-events-none" />
          <div className="absolute -top-20 -right-20 w-96 h-96 bg-cyan-400/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-emerald-400/10 rounded-full blur-3xl" />
          <div className="relative p-6 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-bold tracking-widest uppercase text-white/80">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Nuova stagione • Globe premium
                </div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tighter text-white leading-none">
                  Trova il luogo
                  <span className="gradient-text block">sul globo.</span>
                </h1>
                <p className="text-white/60 leading-relaxed">
                  Indizi chiari, non banali. Un globo NASA al centro dell&apos;azione. Combo che premiano la precisione, non la fortuna.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Pill tone="success">130+ luoghi</Pill>
                  <Pill tone="info">Combo ×1.25</Pill>
                  <Pill tone="accent">Sfida giornaliera</Pill>
                </div>
              </div>
              <div className="hidden md:block w-56 h-56 rounded-[1.5rem] bg-gradient-to-br from-white/5 to-transparent border border-white/10 p-3 backdrop-blur-sm">
                <div className="w-full h-full rounded-xl overflow-hidden opacity-90">
                  <div className="w-full h-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center text-5xl">🌍</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mode grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold tracking-widest uppercase text-white/60">Scegli la modalità</h2>
            <span className="text-xs text-white/40">{LOCATIONS.length} luoghi • tutti i continenti</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" role="radiogroup" aria-label="Modalità di gioco">
            {MODE_CARDS.map((card) => {
              const active = selectedMode === card.mode;
              return (
                <button
                  key={card.mode}
                  onClick={() => setSelectedMode(card.mode)}
                  role="radio"
                  aria-checked={active}
                  className={`text-left rounded-[1.5rem] p-5 border backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 text-white ${
                    active
                      ? "bg-gradient-to-br from-white to-white/95 text-[#0a1433] border-white shadow-[0_16px_40px_rgba(0,0,0,0.25)] scale-[1.02]"
                      : "bg-white/[0.04] border-white/10 hover:bg-white/[0.08] hover:border-white/15"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${active ? "bg-[#0a1433] text-white" : `bg-gradient-to-br ${card.accent} text-white shadow-md`}`}>
                      {card.icon}
                    </div>
                    {card.badge && (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-widest ${active ? "bg-amber-400 text-[#0a1433]" : "bg-white/15 text-white border border-white/10"}`}>
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <h3 className={`text-[16px] font-bold leading-tight ${active ? "text-[#0a1433]" : "text-white"}`}>{card.title}</h3>
                  <p className={`text-sm mt-1 leading-snug ${active ? "text-[#0a1433]/60" : "text-white/60"}`}>{card.description}</p>
                  <p className={`text-xs mt-3 font-semibold px-2.5 py-1 rounded-full inline-block ${active ? "bg-[#0a1433]/10 text-[#0a1433]" : "bg-white/10 text-white/70 border border-white/10"}`}>
                    {card.rules}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Options per mode */}
        <div className="space-y-4">
          {selectedMode === "challenge" && (
            <OptionRow
              label="Numero di round"
              options={[5, 10]}
              value={challengeRounds}
              onChange={setChallengeRounds}
              render={(n) => `${n} round`}
            />
          )}
          {selectedMode === "timed" && (
            <OptionRow
              label="Tempo totale"
              options={[90, 120, 180]}
              value={timedSeconds}
              onChange={setTimedSeconds}
              render={(n) => `${n} secondi`}
            />
          )}
          {selectedMode === "daily" && (
            <Card className="!p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">📅</div>
              <div>
                <div className="text-white font-semibold">Sfida di oggi — {new Date().toLocaleDateString("it-IT")}</div>
                <div className="text-sm text-white/60">Stessi luoghi per tutti. Torna domani per una nuova mappa.</div>
              </div>
              <div className="ml-auto hidden sm:block">
                <Pill tone="accent">Seed giornaliero</Pill>
              </div>
            </Card>
          )}
          {selectedMode === "survival" && (
            <Card className="!p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center">❤️❤️❤️</div>
              <div>
                <div className="text-white font-semibold">3 vite • errore oltre 1500 km = -1 vita</div>
                <div className="text-sm text-white/60">Sopravvivi più a lungo possibile. Combo e vite extra per serie perfette.</div>
              </div>
            </Card>
          )}
        </div>

        <Card className="!p-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-sm">📐</span>
            Come si vincono punti — chiaro e non abusabile
          </h2>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-sm font-bold text-white">Distanza → punti</div>
              <div className="text-xs text-white/60 mt-1">5000·e<sup>−d/2000</sup> — 25 km = massimo, antipodi ≈0. Verificato con Haversine.</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-sm font-bold text-white">Combo equilibrata</div>
              <div className="text-xs text-white/60 mt-1">Streak entro 700 km: ×1.05 a streak 2, fino a ×1.25 cap. Non rende il gioco farmabile.</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
              <div className="text-sm font-bold text-white">Indizi pesati</div>
              <div className="text-xs text-white/60 mt-1">1° indizio gratis, poi −10% (Precisione −25%). Nessun vantaggio pay-to-win.</div>
            </div>
          </div>
        </Card>

        <Button size="lg" onClick={startGame} className="w-full text-base">
          Inizia la partita — {MODE_CARDS.find((c) => c.mode === selectedMode)?.title} 🎮
        </Button>
        <p className="text-center text-xs text-white/40">
          {LOCATIONS.length} luoghi reali • capitali, città, monumenti, natura e isole • globe NASA Blue Marble
        </p>
      </div>
    );
  }

  // ==========================================================
  // Schermata: partita in corso
  // ==========================================================
  const isFinite =
    game.config.mode === "challenge" ||
    game.config.mode === "sprint" ||
    game.config.mode === "precision" ||
    game.config.mode === "daily";
  const roundLabel = isFinite
    ? `Round ${Math.min(game.roundIndex + 1, game.config.totalRounds)} di ${game.config.totalRounds}`
    : `Round ${game.roundIndex + 1}`;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* HUD premium */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <span className="bg-white text-[#0a1433] rounded-full px-3.5 py-1.5 text-sm font-bold shadow-md">{roundLabel}</span>
          <span className="bg-white/10 backdrop-blur-md border border-white/15 rounded-full px-3.5 py-1.5 text-sm text-white flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {formatNumber(game.totalScore)} pt
          </span>
          {game.streak > 1 && (
            <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-[#1a1200] rounded-full px-3 py-1.5 text-sm font-black animate-[combo-burst_0.35s_ease-out]">
              🔥 Combo ×{game.streak} +{Math.round(((Math.min(1 + (game.streak - 1) * 0.05, 1.25) - 1) * 100))}%
            </span>
          )}
          {game.config.mode === "survival" && game.livesRemaining !== null && (
            <span className="bg-rose-500/15 border border-rose-500/20 rounded-full px-3 py-1.5 text-sm font-bold text-rose-300">
              {"❤️".repeat(game.livesRemaining)}
              {"🖤".repeat(3 - game.livesRemaining)} Vite
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {roundSecondsLeft != null && (
            <div className="flex items-center gap-2 bg-[#02061a]/60 backdrop-blur-md border border-white/10 rounded-full px-2 pr-3 py-1">
              <Timer seconds={roundSecondsLeft} total={game.config.secondsPerRound} />
              <span className="text-xs font-bold text-white/70">{roundSecondsLeft}s</span>
            </div>
          )}
          {gameSecondsLeft != null && (
            <span className={`rounded-full px-3 py-1.5 text-sm font-bold border ${gameSecondsLeft <= 10 ? "bg-rose-500 text-white border-rose-400 animate-pulse" : "bg-white/10 text-white border-white/15"}`}>
              ⏱️ {gameSecondsLeft}s totali
            </span>
          )}
          <label className="hidden sm:flex items-center gap-2 text-xs text-white/60 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 cursor-pointer">
            <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} className="accent-emerald-500" />
            Auto-avanza
          </label>
          <Button variant="ghost" size="sm" onClick={handleQuitToSummary}>
            Esci
          </Button>
        </div>
      </div>

      {totalProgress != null && (
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[#00d9a5] to-[#38bdf8] rounded-full transition-all duration-500" style={{ width: `${totalProgress}%` }} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1.4fr_0.9fr] gap-4 items-start">
        {/* Globe */}
        <div className="relative rounded-[1.5rem] overflow-hidden border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.4)] bg-[#02061a]">
          <GlobeContainer
            onPick={(coords) => {
              if (game.phase !== "playing") return;
              setPendingGuess(coords);
            }}
            guessCoords={pendingGuess}
            targetCoords={revealed && lastResult?.guess ? lastResult.location.coordinates : null}
            targetLabel={revealed ? lastResult?.location.name : undefined}
            selectable={game.phase === "playing"}
            autoRotate={false}
            height="560px"
            focusCoords={focusCoords}
          />
          {/* Overlay hint */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
            <div className="px-3 py-1.5 rounded-full bg-[#02061a]/80 backdrop-blur-md border border-white/15 text-xs font-semibold text-white/80">
              Trascina • zoom • tocca per puntare
            </div>
            {pendingGuess && (
              <div className="px-3 py-1.5 rounded-full bg-emerald-500 text-[#001a12] text-xs font-bold">
                📍 Puntina pronta — conferma a destra
              </div>
            )}
          </div>
        </div>

        {/* Pannello laterale */}
        <div className="space-y-4 sticky top-[76px]">
          {target && game.phase === "playing" && (
            <Card className="!p-5 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <Pill tone="success">{categoryLabel(target.category)}</Pill>
                  <Pill tone="info">{continentLabel(target.continent)}</Pill>
                  <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-white/10 border border-white/10 text-white/70">
                    Difficoltà {target.difficulty}/3
                  </span>
                </div>
                <h2 className="text-2xl font-black tracking-tight text-white mt-3">📍 Trova: {target.name}</h2>
                <p className="text-sm text-white/60">{target.country} • indizio 1 di {target.hints.length}</p>
              </div>

              <div className="space-y-2.5" aria-label="Indizi">
                {target.hints.slice(0, game.hintsShown).map((hint, i) => (
                  <div key={i} className="flex gap-3 rounded-2xl bg-white/[0.04] border border-white/10 px-3.5 py-3">
                    <span className="w-6 h-6 rounded-full bg-white text-[#0a1433] flex items-center justify-center text-xs font-black shrink-0">{i + 1}</span>
                    <p className="text-sm text-white/85 leading-relaxed">{hint}</p>
                  </div>
                ))}
                {game.hintsShown < target.hints.length && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setGame((g) => (g ? revealNextHint(g) : g));
                      setShowHintCost(true);
                      setTimeout(() => setShowHintCost(false), 2000);
                    }}
                    className="w-full"
                  >
                    💡 Mostra altro indizio
                    {game.config.mode !== "training" && (
                      <span className={`ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${showHintCost ? "bg-amber-400 text-[#1a1200] animate-pulse" : "bg-amber-500/15 text-amber-300 border border-amber-500/20"}`}>
                        {game.config.mode === "precision" ? "−25%" : "−10%"}
                      </span>
                    )}
                  </Button>
                )}
              </div>

              <div className="border-t border-white/10 pt-4 space-y-3">
                {pendingGuess ? (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 flex items-center gap-2">
                    <span className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">📍</span>
                    <div className="text-sm">
                      <div className="font-bold text-emerald-300">
                        {Math.abs(pendingGuess.lat).toFixed(2)}° {pendingGuess.lat >= 0 ? "N" : "S"}, {Math.abs(pendingGuess.lng).toFixed(2)}° {pendingGuess.lng >= 0 ? "E" : "O"}
                      </div>
                      <div className="text-xs text-white/50">Tocca altrove per aggiustare</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-white/60 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                    Ruota il globo e <strong className="text-white">tocca/clicca</strong> dove pensi si trovi <strong className="text-white">{target.name}</strong>.
                  </p>
                )}
                <Button size="lg" onClick={handleConfirm} disabled={!pendingGuess} className="w-full">
                  ✅ Conferma la risposta
                </Button>
                <ManualCoordinates
                  onPlace={(c) => {
                    setPendingGuess(c);
                    setFocusCoords(c);
                  }}
                />
              </div>
            </Card>
          )}

          {revealed && lastResult && (
            <Card className="!p-5 space-y-4 border-amber-500/20">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/20 text-xs font-bold text-amber-300">
                  ✨ Risultato del round
                </div>
                <h2 className="text-xl font-black text-white mt-3">
                  {lastResult.timedOut ? "⌛ Tempo scaduto!" : distanceVerdict(lastResult.distanceKm!)}
                </h2>
                <p className="text-sm text-white/70 mt-1">
                  <strong className="text-white">{lastResult.location.name}</strong>, {lastResult.location.country} — {continentLabel(lastResult.location.continent)}.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-gradient-to-br from-cyan-500/15 to-blue-500/10 border border-cyan-500/20 p-4 text-center">
                  <div className="text-xl font-black text-cyan-300">{lastResult.distanceKm != null ? formatDistance(lastResult.distanceKm) : "—"}</div>
                  <div className="text-[11px] font-bold tracking-widest uppercase text-white/50">Distanza</div>
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10 border border-emerald-500/20 p-4 text-center">
                  <div className="text-xl font-black text-emerald-300">+{formatNumber(lastResult.score)}</div>
                  <div className="text-[11px] font-bold tracking-widest uppercase text-white/50">
                    Punti {lastResult.bonusScore ? `+${lastResult.bonusScore} combo` : ""}
                  </div>
                </div>
              </div>

              {lastResult.streak != null && lastResult.streak > 1 && (
                <div className="rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-amber-500/20 px-3 py-2 text-center">
                  <span className="text-sm font-bold text-amber-300">🔥 Combo ×{lastResult.streak} — bonus +{lastResult.bonusScore} punti!</span>
                </div>
              )}

              {game.config.mode === "survival" && game.livesRemaining !== null && (
                <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 px-3 py-2 text-center text-sm font-bold text-rose-300">
                  Vite rimaste: {"❤️".repeat(game.livesRemaining)} {game.livesRemaining === 0 ? "— Partita finita!" : ""}
                </div>
              )}

              <Button size="lg" onClick={handleNext} className="w-full">
                {isFinite && game.results.length >= game.config.totalRounds
                  ? "🏁 Vedi il riepilogo finale"
                  : gameSecondsLeft != null && gameSecondsLeft <= 0
                    ? "🏁 Tempo scaduto — riepilogo"
                    : "➡️ Prossimo round"}
              </Button>
              <p className="text-xs text-center text-white/40">Spazio per confermare • N per prossimo • H per indizio</p>
            </Card>
          )}

          <Card className="!p-4">
            <p className="text-xs text-white/50 leading-relaxed">
              <strong className="text-white/80">Controlli:</strong> trascina per ruotare · rotellina/pizzico per zoom · tap per puntare. Tastiera: Tab sul globo, frecce per mirino, Invio per confermare, H per indizio, N per avanti.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function OptionRow({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (n: number) => void;
  render: (n: number) => string;
}) {
  return (
    <Card className="!p-4 flex items-center justify-between">
      <h3 className="text-sm font-bold text-white">{label}</h3>
      <div className="flex gap-2">
        {options.map((n) => (
          <Button
            key={n}
            variant={value === n ? "primary" : "secondary"}
            size="sm"
            onClick={() => onChange(n)}
            aria-pressed={value === n}
          >
            {render(n)}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function ManualCoordinates({ onPlace }: { onPlace: (coords: GeoCoordinates) => void }) {
  const [open, setOpen] = useState(false);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [err, setErr] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-white/50 underline underline-offset-4 hover:text-emerald-300"
      >
        ⌨️ Oppure inserisci lat/lng a mano
      </button>
    );
  }

  const place = () => {
    const coords = {
      lat: Number.parseFloat(lat.replace(",", ".")),
      lng: Number.parseFloat(lng.replace(",", ".")),
    };
    if (!isValidCoordinates(coords)) {
      setErr("Coordinate non valide: lat −90…90, lng −180…180.");
      return;
    }
    setErr("");
    onPlace(coords);
  };

  const inputCls =
    "w-full px-3 py-2.5 bg-[#02061a] border border-white/15 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00d9a5] focus:ring-2 focus:ring-[#00d9a5]/20";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-white/60">
          Latitudine
          <input className={inputCls} inputMode="decimal" placeholder="41,90" value={lat} onChange={(e) => setLat(e.target.value)} aria-label="Latitudine" />
        </label>
        <label className="text-xs font-semibold text-white/60">
          Longitudine
          <input className={inputCls} inputMode="decimal" placeholder="12,50" value={lng} onChange={(e) => setLng(e.target.value)} aria-label="Longitudine" />
        </label>
      </div>
      {err && (
        <p role="alert" className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
          {err}
        </p>
      )}
      <Button variant="secondary" size="sm" onClick={place} className="w-full">
        Posiziona la puntina qui
      </Button>
    </div>
  );
}
