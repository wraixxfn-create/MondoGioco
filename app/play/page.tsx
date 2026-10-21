"use client";
"use no memo";

import React, { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Card } from "@/components/ui/Card";
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
import Link from "next/link";
import type { GeoCoordinates, GeoGameMode } from "@/types";

const GlobeContainer = dynamic(
  () => import("@/components/globe/Globe").then((mod) => mod.GlobeContainer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[320px] flex items-center justify-center bg-slate-900/40 rounded-2xl border border-slate-800">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-3">
            <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
            <span className="absolute inset-0 flex items-center justify-center text-2xl">🌍</span>
          </div>
          <p className="text-slate-400 text-sm">Caricamento del globo…</p>
        </div>
      </div>
    ),
  }
);

// ============================================================
// Pagina Gioca — Gioco geografico sul globo 3D
// ============================================================
//
// Flusso di un round:
//  1. viene mostrato l'obiettivo (nome + indizio);
//  2. il giocatore ruota/zomma il globo e posiziona una puntina
//     (click, tap, tastiera o coordinate manuali);
//  3. conferma la risposta → reveal: destinazione, arco, distanza
//     (Haversine) e punti (5000·e^(−d/2000), vedi lib/game/geo.ts);
//  4. allo scadere del timer vale la puntina già posizionata,
//     altrimenti il round vale 0 punti.

type Screen = "menu" | "game" | "summary" | "error";

const MODE_CARDS: {
  mode: GeoGameMode;
  icon: string;
  title: string;
  description: string;
  rules: string;
}[] = [
  {
    mode: "training",
    icon: "🧭",
    title: "Allenamento libero",
    description: "Esplora e impara senza pressione.",
    rules: "Nessun timer · round illimitati · indizi gratuiti",
  },
  {
    mode: "challenge",
    icon: "🏆",
    title: "Sfida a round",
    description: "La partita classica: precisione sotto pressione.",
    rules: "5 o 10 round · 60 secondi a round · punteggio cumulativo",
  },
  {
    mode: "timed",
    icon: "⏱️",
    title: "Contro il tempo",
    description: "Quanti luoghi riesci a trovare prima che scada il tempo?",
    rules: "Un unico timer totale · round illimitati finché c'è tempo",
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
  const [now, setNow] = useState(0); // impostato in startGame (Date.now vietato in prerender)
  const [errorMsg, setErrorMsg] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [xpEarned, setXpEarned] = useState<number | null>(null);
  const savedGameRef = useRef<GeoGameState | null>(null);

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
    }
  }, [selectedMode, challengeRounds, timedSeconds]);

  const startGame = useCallback(() => {
    try {
      const g = createGame(LOCATIONS, buildConfig(), Math.random, Date.now());
      setGame(g);
      setNow(Date.now());
      setPendingGuess(null);
      setFocusCoords(null);
      setAnnouncement("");
      setXpEarned(null);
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

  // ---- Invio risposta (conferma o scadenza) ----
  const doSubmit = useCallback((guess: GeoCoordinates | null, at: number) => {
    setGame((prev) => {
      if (!prev || prev.phase !== "playing") return prev;
      const next = submitGuess(prev, guess, at);
      const result = next.results[next.results.length - 1];
      if (result) {
        setAnnouncement(
          result.timedOut
            ? `Tempo scaduto. La destinazione era ${result.location.name}, ${result.location.country}. Zero punti.`
            : `${distanceVerdict(result.distanceKm!)} Distanza ${formatDistance(result.distanceKm!)}. Hai guadagnato ${result.score} punti.`
        );
        // La camera inquadra a metà strada tra risposta e destinazione
        setFocusCoords(
          result.guess
            ? greatCircleMidpoint(result.guess, result.location.coordinates)
            : result.location.coordinates
        );
      }
      return next;
    });
  }, []);

  // ---- Orologio di gioco: aggiorna i timer e gestisce le scadenze ----
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
        // Allo scadere vale la puntina posizionata: la registriamo
        // un istante prima della scadenza (l'engine rifiuta le
        // risposte tardive, così la regola resta onesta e verificabile).
        const deadline = gameOut ? g.gameExpiresAt! : g.roundExpiresAt!;
        doSubmit(pendingRef.current, Math.min(t, deadline - 1));
      }
    }, 200);
    return () => clearInterval(id);
  }, [screen, doSubmit]);

  // Salva automaticamente punteggio, XP e classifica a fine partita
  useEffect(() => {
    if (screen !== "summary" || !game || savedGameRef.current === game) return;
    savedGameRef.current = game;
    const summary = summarize(game);
    if (summary.roundsPlayed === 0) return;

    let streak = 0;
    let bestStreak = 0;
    let goodRounds = 0;
    for (const r of summary.results) {
      if (!r.timedOut && r.distanceKm != null && r.distanceKm <= 1500) {
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
      bestStreak,
      bullseyes: summary.bullseyes,
      won: summary.averageScore >= 2500,
    }).then((res) => {
      setXpEarned(res.xpEarned);
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

  // Timer residui per l'HUD
  const roundSecondsLeft =
    game?.roundExpiresAt != null
      ? Math.max(0, Math.ceil((game.roundExpiresAt - now) / 1000))
      : null;
  const gameSecondsLeft =
    game?.gameExpiresAt != null ? Math.max(0, Math.ceil((game.gameExpiresAt - now) / 1000)) : null;

  // ==========================================================
  // Schermata: errore
  // ==========================================================
  if (screen === "error") {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-6">
        <div className="text-6xl">🧭</div>
        <h1 className="text-3xl font-bold text-white">Impossibile avviare la partita</h1>
        <p className="text-slate-400">{errorMsg}</p>
        <Button size="lg" onClick={() => setScreen("menu")}>
          Torna al menu
        </Button>
      </div>
    );
  }

  // ==========================================================
  // Schermata: riepilogo finale
  // ==========================================================
  if (screen === "summary" && game) {
    const s = summarize(game);
    const grade =
      s.roundsPlayed === 0
        ? "Nessun round giocato"
        : s.averageScore >= 4000
          ? "🌟 Cartografo leggendario!"
          : s.averageScore >= 3000
            ? "🧭 Esploratore esperto!"
            : s.averageScore >= 2000
              ? "🗺️ Buon viaggiatore!"
              : s.averageScore >= 1000
                ? "🎒 Apprendista globetrotter"
                : "🌱 Continua a esplorare!";
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Partita terminata</h1>
          <p className="text-slate-400">{grade}</p>
        </div>

        <Card className="text-center space-y-6">
          <div>
            <div className="text-6xl font-bold gradient-text">{formatNumber(s.totalScore)}</div>
            <p className="text-slate-400 mt-1">
              punti su {formatNumber(s.maxPossibleScore)} possibili
            </p>
            {xpEarned != null && xpEarned > 0 && (
              <p className="text-sm text-emerald-400 font-medium mt-2">
                +{formatNumber(xpEarned)} XP guadagnati · Punteggio salvato in classifica
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Round giocati" value={String(s.roundsPlayed)} color="text-cyan-400" />
            <Stat
              label="Distanza migliore"
              value={s.bestDistanceKm != null ? formatDistance(s.bestDistanceKm) : "—"}
              color="text-emerald-400"
            />
            <Stat
              label="Distanza media"
              value={s.averageDistanceKm != null ? formatDistance(s.averageDistanceKm) : "—"}
              color="text-amber-400"
            />
            <Stat label="Colpi entro 100 km" value={String(s.bullseyes)} color="text-violet-400" />
          </div>
        </Card>

        {s.results.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Dettaglio dei round</h2>
            {s.results.map((r, i) => (
              <Card key={`${r.location.id}-${i}`} className="!p-4">
                <div className="flex items-center gap-3">
                  <span className="text-xl" aria-hidden>
                    {r.timedOut
                      ? "⌛"
                      : r.distanceKm! <= 100
                        ? "🎯"
                        : r.distanceKm! <= 1500
                          ? "👍"
                          : "🌍"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">
                      {r.location.name} · {r.location.country}
                    </p>
                    <p className="text-xs text-slate-400">
                      {r.timedOut
                        ? "Nessuna risposta in tempo"
                        : `A ${formatDistance(r.distanceKm!)} dalla destinazione`}
                      {r.hintsUsed > 1 ? ` · ${r.hintsUsed} indizi usati` : ""}
                    </p>
                  </div>
                  <div
                    className={`text-base font-bold ${r.score > 0 ? "text-emerald-400" : "text-slate-500"}`}
                  >
                    +{formatNumber(r.score)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pb-8">
          <Button size="lg" onClick={startGame} className="flex-1">
            🔄 Gioca ancora
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => setScreen("menu")}
            className="flex-1"
          >
            Cambia modalità
          </Button>
          <Link href="/leaderboard" className="flex-1">
            <Button size="lg" variant="secondary" className="w-full">
              🏆 Vedi Classifica
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // ==========================================================
  // Schermata: menu / scelta modalità
  // ==========================================================
  if (screen === "menu" || !game) {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Trova il luogo sul globo 🌍</h1>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Ti diamo un obiettivo e degli indizi: ruota la Terra, zooma e posiziona la puntina il
            più vicino possibile alla destinazione. Più sei preciso, più punti fai.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4" role="radiogroup" aria-label="Modalità di gioco">
          {MODE_CARDS.map((card) => (
            <Card
              key={card.mode}
              hover
              onClick={() => setSelectedMode(card.mode)}
              className={selectedMode === card.mode ? "border-emerald-500 bg-emerald-500/5" : ""}
            >
              <div className="space-y-2">
                <div className="text-3xl">{card.icon}</div>
                <h2 className="text-lg font-semibold text-white">{card.title}</h2>
                <p className="text-sm text-slate-400">{card.description}</p>
                <p className="text-xs text-emerald-300/90">{card.rules}</p>
              </div>
            </Card>
          ))}
        </div>

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

        <Card className="!p-5">
          <h2 className="text-base font-semibold text-white mb-2">📐 Come si calcolano i punti</h2>
          <ul className="text-sm text-slate-400 space-y-1.5 list-disc pl-5">
            <li>
              Distanza calcolata con la{" "}
              <strong className="text-slate-200">formula di Haversine</strong> (arco di cerchio
              massimo, raggio terrestre 6.371 km).
            </li>
            <li>
              Punti ={" "}
              <strong className="text-slate-200">
                5.000 · e<sup>−distanza/2.000</sup>
              </strong>
              : entro 25 km fai il massimo (5.000), a ~1.386 km dimezzi, agli antipodi vai a ~0.
            </li>
            <li>
              Il primo indizio è gratuito; ogni indizio extra costa il{" "}
              <strong className="text-slate-200">10%</strong> dei punti del round (gratis in
              allenamento).
            </li>
            <li>Allo scadere del timer vale la puntina già posizionata; senza puntina, 0 punti.</li>
          </ul>
        </Card>

        <Button size="lg" onClick={startGame} className="w-full">
          Inizia la partita 🎮
        </Button>
        <p className="text-center text-xs text-slate-500 pb-4">
          {LOCATIONS.length} luoghi reali · capitali, città, monumenti, natura e isole da tutti i
          continenti
        </p>
      </div>
    );
  }

  // ==========================================================
  // Schermata: partita in corso
  // ==========================================================
  const isChallenge = game.config.mode === "challenge";
  const roundLabel = isChallenge
    ? `Round ${Math.min(game.roundIndex + 1, game.config.totalRounds)} di ${game.config.totalRounds}`
    : `Round ${game.roundIndex + 1}`;

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Annunci per screen reader */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* HUD */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <span className="bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1.5 text-sm font-semibold text-white">
            {roundLabel}
          </span>
          <span className="bg-slate-800/80 border border-slate-700 rounded-full px-3 py-1.5 text-sm text-slate-300">
            Punteggio: <strong className="text-emerald-400">{formatNumber(game.totalScore)}</strong>
          </span>
          {isChallenge && (
            <div className="hidden sm:flex items-center gap-1.5" aria-label="Round completati">
              {Array.from({ length: game.config.totalRounds }).map((_, i) => {
                const r = game.results[i];
                const cls =
                  i === game.roundIndex && game.phase === "playing"
                    ? "bg-white animate-pulse"
                    : !r
                      ? "bg-slate-700"
                      : r.score >= 4000
                        ? "bg-emerald-400"
                        : r.score >= 1500
                          ? "bg-amber-400"
                          : r.score > 0
                            ? "bg-orange-500"
                            : "bg-red-500";
                return <span key={i} className={`w-2.5 h-2.5 rounded-full ${cls}`} />;
              })}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {roundSecondsLeft != null && game.phase === "playing" && (
            <Timer seconds={roundSecondsLeft} total={game.config.secondsPerRound} />
          )}
          {gameSecondsLeft != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 hidden sm:inline">Tempo totale</span>
              <Timer seconds={gameSecondsLeft} total={game.config.totalSeconds} />
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={handleQuitToSummary}>
            Termina
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-4 items-start">
        {/* Globo */}
        <div className="h-[52vh] min-h-[320px] lg:h-[calc(100vh-260px)] lg:min-h-[480px]">
          <GlobeContainer
            height="100%"
            selectable={game.phase === "playing"}
            autoRotate={false}
            onPick={setPendingGuess}
            guessCoords={revealed && lastResult ? lastResult.guess : pendingGuess}
            targetCoords={revealed && lastResult ? lastResult.location.coordinates : null}
            targetLabel={revealed && lastResult ? lastResult.location.name : undefined}
            focusCoords={focusCoords}
          />
        </div>

        {/* Pannello laterale */}
        <div className="space-y-4">
          {target && game.phase === "playing" && (
            <Card className="!p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold">
                  Obiettivo · {categoryLabel(target.category)} · {continentLabel(target.continent)}
                </p>
                <h2 className="text-2xl font-bold text-white mt-1">📍 Trova: {target.name}</h2>
              </div>

              <div className="space-y-2" aria-label="Indizi">
                {target.hints.slice(0, game.hintsShown).map((hint, i) => (
                  <p
                    key={i}
                    className="text-sm text-slate-300 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2"
                  >
                    <span className="text-slate-500 font-semibold mr-1.5">{i + 1}.</span>
                    {hint}
                  </p>
                ))}
                {game.hintsShown < target.hints.length && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setGame((g) => (g ? revealNextHint(g) : g))}
                    className="w-full"
                  >
                    💡 Altro indizio
                    {game.config.mode !== "training" && (
                      <span className="text-amber-400 ml-1.5">(−10% punti)</span>
                    )}
                  </Button>
                )}
              </div>

              <div className="border-t border-slate-700/60 pt-4 space-y-3">
                {pendingGuess ? (
                  <p className="text-sm text-cyan-200 tabular-nums">
                    Puntina: {Math.abs(pendingGuess.lat).toFixed(2)}°{" "}
                    {pendingGuess.lat >= 0 ? "N" : "S"}, {Math.abs(pendingGuess.lng).toFixed(2)}°{" "}
                    {pendingGuess.lng >= 0 ? "E" : "O"}
                    <span className="text-slate-400"> — clicca altrove per spostarla</span>
                  </p>
                ) : (
                  <p className="text-sm text-slate-400">
                    Ruota il globo e <strong className="text-slate-200">tocca/clicca</strong> il
                    punto in cui pensi si trovi {target.name}.
                  </p>
                )}
                <Button
                  size="lg"
                  onClick={handleConfirm}
                  disabled={!pendingGuess}
                  className="w-full"
                >
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
            <Card className="!p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-amber-400 font-semibold">
                  Risultato del round
                </p>
                <h2 className="text-xl font-bold text-white mt-1">
                  {lastResult.timedOut
                    ? "⌛ Tempo scaduto!"
                    : distanceVerdict(lastResult.distanceKm!)}
                </h2>
                <p className="text-sm text-slate-300 mt-1">
                  La destinazione era{" "}
                  <strong className="text-white">{lastResult.location.name}</strong>,{" "}
                  {lastResult.location.country} ({continentLabel(lastResult.location.continent)}).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl py-3">
                  <div className="text-lg font-bold text-cyan-300">
                    {lastResult.distanceKm != null ? formatDistance(lastResult.distanceKm) : "—"}
                  </div>
                  <div className="text-[11px] text-slate-400">Distanza</div>
                </div>
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl py-3">
                  <div className="text-lg font-bold text-emerald-400">
                    +{formatNumber(lastResult.score)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Punti
                    {lastResult.baseScore !== lastResult.score &&
                      ` (da ${formatNumber(lastResult.baseScore)}, indizi extra)`}
                  </div>
                </div>
              </div>

              <Button size="lg" onClick={handleNext} className="w-full" autoFocus>
                {isChallenge && game.results.length >= game.config.totalRounds
                  ? "🏁 Vedi il riepilogo finale"
                  : gameSecondsLeft != null && gameSecondsLeft <= 0
                    ? "🏁 Tempo totale scaduto — riepilogo"
                    : "➡️ Prossimo round"}
              </Button>
            </Card>
          )}

          <Card className="!p-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              <strong className="text-slate-200">Controlli:</strong> trascina per ruotare ·
              rotellina o pizzica per zoomare · tocca per posizionare la puntina. Da tastiera: Tab
              sul globo, frecce per il mirino, Invio per puntare, +/− per lo zoom (Maiusc+frecce =
              movimenti fini).
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Componenti di supporto
// ============================================================

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className={`text-xl sm:text-2xl font-bold ${color}`}>{value}</div>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
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
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-white">{label}</h3>
      <div className="flex gap-2">
        {options.map((n) => (
          <Button
            key={n}
            variant={value === n ? "primary" : "secondary"}
            size="sm"
            onClick={() => onChange(n)}
            className="flex-1"
            aria-pressed={value === n}
          >
            {render(n)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * Inserimento manuale delle coordinate: alternativa accessibile al
 * puntamento sul globo (tastiera, screen reader, WebGL assente).
 */
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
        className="text-xs text-slate-400 underline underline-offset-2 hover:text-emerald-300"
      >
        ⌨️ Oppure inserisci latitudine e longitudine a mano
      </button>
    );
  }

  const place = () => {
    const coords = {
      lat: Number.parseFloat(lat.replace(",", ".")),
      lng: Number.parseFloat(lng.replace(",", ".")),
    };
    if (!isValidCoordinates(coords)) {
      setErr("Coordinate non valide: latitudine tra −90 e 90, longitudine tra −180 e 180.");
      return;
    }
    setErr("");
    onPlace(coords);
  };

  const inputCls =
    "w-full px-3 py-2 bg-slate-900/70 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-slate-400">
          Latitudine (−90…90)
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="es. 41,90"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            aria-label="Latitudine"
          />
        </label>
        <label className="text-xs text-slate-400">
          Longitudine (−180…180)
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="es. 12,50"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            aria-label="Longitudine"
          />
        </label>
      </div>
      {err && (
        <p role="alert" className="text-xs text-red-400">
          {err}
        </p>
      )}
      <Button variant="secondary" size="sm" onClick={place} className="w-full">
        Posiziona la puntina qui
      </Button>
    </div>
  );
}
