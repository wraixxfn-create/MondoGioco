"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { difficultyLabel, formatNumber, quizTypeLabel } from "@/lib/utils";
import {
  DEFAULT_GAME_SETTINGS,
  canStartGame,
  closedReasonLabel,
  closeMultiplayerRoom,
  connectionLabel,
  createMultiplayerRoom,
  describeMultiplayerError,
  ensureMultiplayerIdentity,
  fetchGameSettings,
  getRememberedRoom,
  forgetActiveRoom,
  isHostAway,
  isMultiplayerAvailable,
  joinMultiplayerRoom,
  kickRoomMember,
  leaveMultiplayerRoom,
  applyServerTimestamp,
  msRemaining,
  normalizeRoomCode,
  phaseLabel,
  reconnectToRoom,
  rememberActiveRoom,
  runRoomMaintenance,
  sendHeartbeat,
  setPlayerReady,
  startMultiplayerGame,
  serverNowMs,
  submitMultiplayerAnswer,
  subscribeToRoom,
  syncServerClock,
  syncRoom,
  type GameSettings,
  type MultiplayerIdentity,
  type RealtimeStatus,
  type RoomResult,
  type RoomSnapshot,
} from "@/lib/services/multiplayer";
import {
  INITIAL_PLAYER_STATE,
  loadLocalPlayer,
  type LocalPlayerState,
} from "@/lib/services/player-store";
import type { Difficulty, QuizType } from "@/types";

function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function connectionDot(connection: string): string {
  if (connection === "connected") return "bg-emerald-400";
  if (connection === "disconnected") return "bg-amber-400";
  return "bg-slate-500";
}

export default function MultiplayerPage() {
  const [identity, setIdentity] = useState<MultiplayerIdentity | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [localPlayer, setLocalPlayer] = useState<LocalPlayerState>(INITIAL_PLAYER_STATE);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_GAME_SETTINGS);

  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [clockReady, setClockReady] = useState(false);
  // Inizializzato a 0 e aggiornato solo lato client: evita Date.now() in prerender.
  const [now, setNow] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [quizType, setQuizType] = useState<QuizType>("capital");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [rounds, setRounds] = useState(DEFAULT_GAME_SETTINGS.default_rounds);
  const [maxPlayers, setMaxPlayers] = useState(DEFAULT_GAME_SETTINGS.default_max_players);
  const [roundSeconds, setRoundSeconds] = useState(DEFAULT_GAME_SETTINGS.default_round_seconds);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<{ round: number; answer: string } | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  const applyingRef = useRef(0);
  const lastSyncRef = useRef(0);
  const initialisedRef = useRef(false);

  const online = isMultiplayerAvailable();
  const pollMs = Math.max(1500, snapshot?.settings.client_poll_ms ?? settings.client_poll_ms);

  // ============================================================
  // Applicazione degli snapshot del server
  // ============================================================
  const applySnapshot = useCallback((next: RoomSnapshot) => {
    applyingRef.current = Date.now();
    setSnapshot(next);
    setActiveRoomId(next.room.id);
    rememberActiveRoom(next.room.id, next.room.code);
    setError("");
    // Correzione leggera continua dell'orologio (la stima fine è in
    // syncServerClock, che misura il round-trip).
    applyServerTimestamp(next.server_time);
    setNow(Date.now());
  }, []);

  const clearRoom = useCallback((message?: string) => {
    setSnapshot(null);
    setActiveRoomId(null);
    setSelectedAnswer(null);
    forgetActiveRoom();
    if (message) setError(message);
  }, []);

  const handleRoomFailure = useCallback(
    (code: string) => {
      setError(describeMultiplayerError(code));
      if (
        code === "MG403:not_a_member" ||
        code === "MG403:not_allowed" ||
        code === "MG404:room_not_found" ||
        code === "MG401:authentication_required"
      ) {
        clearRoom(describeMultiplayerError(code));
      }
    },
    [clearRoom]
  );

  const applyResult = useCallback(
    (result: RoomResult): boolean => {
      if (result.ok) {
        applySnapshot(result.snapshot);
        return true;
      }
      handleRoomFailure(result.error);
      return false;
    },
    [applySnapshot, handleRoomFailure]
  );

  // ============================================================
  // Bootstrap: impostazioni, sessione, clock, stanza precedente
  // ============================================================
  useEffect(() => {
    if (initialisedRef.current) return;
    initialisedRef.current = true;

    setLocalPlayer(loadLocalPlayer());

    if (!online) {
      setIdentityError("NOT_CONFIGURED");
      return;
    }

    void (async () => {
      const serverSettings = await fetchGameSettings();
      if (serverSettings) {
        setSettings(serverSettings);
        setRounds(serverSettings.default_rounds);
        setMaxPlayers(serverSettings.default_max_players);
        setRoundSeconds(serverSettings.default_round_seconds);
      }

      const offset = await syncServerClock();
      setClockReady(offset !== null);
      setNow(serverNowMs());

      const identityResult = await ensureMultiplayerIdentity();
      if (!identityResult.ok) {
        setIdentityError(identityResult.error);
        return;
      }
      setIdentity(identityResult.identity);

      const urlCode = normalizeRoomCode(
        new URLSearchParams(window.location.search).get("room") ?? ""
      );
      if (urlCode) {
        const joined = await joinMultiplayerRoom(urlCode);
        if (applyResult(joined)) return;
      }

      const remembered = getRememberedRoom();
      if (remembered) {
        const restored = await reconnectToRoom(remembered.roomId);
        if (applyResult(restored)) {
          setNotice("Sei rientrato nella stanza a cui partecipavi.");
          return;
        }
        forgetActiveRoom();
      }

      void runRoomMaintenance();
    })();
  }, [applyResult, online]);

  // ============================================================
  // Timer locale (basato sui timestamp del server)
  // ============================================================
  useEffect(() => {
    setNow(serverNowMs());
    const interval = setInterval(() => setNow(serverNowMs()), 250);
    return () => clearInterval(interval);
  }, []);

  // Risincronizza l'orologio ogni minuto mentre si gioca
  useEffect(() => {
    if (!activeRoomId || !online) return;
    const interval = setInterval(() => {
      void syncServerClock().then((offset) => {
        if (offset !== null) {
          setClockReady(true);
          setNow(Date.now() + offset);
        }
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [activeRoomId, online]);

  // ============================================================
  // Realtime: solo trigger, lo stato arriva sempre dal server
  // ============================================================
  useEffect(() => {
    if (!activeRoomId || !online) return;
    const unsubscribe = subscribeToRoom(activeRoomId, {
      onChange: () => {
        const since = Date.now() - lastSyncRef.current;
        const delay = since > 400 ? 0 : 400 - since;
        window.setTimeout(() => {
          lastSyncRef.current = Date.now();
          void syncRoom(activeRoomId).then((result) => {
            if (result.ok) applySnapshot(result.snapshot);
            else if (result.error !== "NETWORK") handleRoomFailure(result.error);
          });
        }, delay);
      },
      onStatus: setRealtimeStatus,
    });
    return unsubscribe;
  }, [activeRoomId, online, applySnapshot, handleRoomFailure]);

  // ============================================================
  // Heartbeat + polling di sicurezza (funziona anche senza Realtime)
  // ============================================================
  useEffect(() => {
    if (!activeRoomId || !online) return;
    // Una stanza chiusa è definitiva: non serve più fare polling.
    if (snapshot?.room.phase === "closed") return;

    let cancelled = false;

    const tick = async () => {
      const result = await sendHeartbeat(activeRoomId);
      if (cancelled) return;
      if (result.ok) {
        applySnapshot(result.snapshot);
      } else if (result.error !== "NETWORK") {
        handleRoomFailure(result.error);
      } else {
        setRealtimeStatus("error");
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void tick();
    };

    void tick();
    const interval = setInterval(tick, pollMs);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeRoomId, pollMs, online, applySnapshot, handleRoomFailure, snapshot?.room.phase]);

  // Manutenzione periodica delle stanze abbandonate (le altre)
  useEffect(() => {
    if (!online) return;
    const interval = setInterval(() => void runRoomMaintenance(), 120_000);
    return () => clearInterval(interval);
  }, [online]);

  // Reset della risposta selezionata al cambio round
  const currentRoundIndex = snapshot?.round?.index ?? null;
  useEffect(() => {
    setSelectedAnswer(null);
  }, [currentRoundIndex, snapshot?.room.phase]);

  // ============================================================
  // Azioni
  // ============================================================
  const handleCreateRoom = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await createMultiplayerRoom({
      name: roomName.trim(),
      quizType,
      difficulty,
      totalRounds: rounds,
      maxPlayers,
      roundSeconds,
    });
    setBusy(false);
    if (!result.ok) {
      handleRoomFailure(result.error);
      return;
    }
    applySnapshot(result.snapshot);
    setShowCreate(false);
    setRoomName("");
    setNotice("Stanza creata: condividi il codice con i tuoi amici.");
  };

  const handleJoin = async (rawCode?: string) => {
    if (busy) return;
    const code = normalizeRoomCode(rawCode ?? joinCode);
    if (code.length !== 6) {
      setError("Il codice stanza deve avere 6 caratteri.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await joinMultiplayerRoom(code);
    setBusy(false);
    if (!result.ok) {
      handleRoomFailure(result.error);
      return;
    }
    applySnapshot(result.snapshot);
    setShowJoin(false);
    setJoinCode("");
    setNotice("");
  };

  const handleReady = async (ready: boolean) => {
    if (!activeRoomId) return;
    setBusy(true);
    const result = await setPlayerReady(activeRoomId, ready);
    setBusy(false);
    if (!result.ok) handleRoomFailure(result.error);
    else applySnapshot(result.snapshot);
  };

  const handleStart = async () => {
    if (!activeRoomId) return;
    setBusy(true);
    setError("");
    const result = await startMultiplayerGame(activeRoomId);
    setBusy(false);
    if (!result.ok) handleRoomFailure(result.error);
    else applySnapshot(result.snapshot);
  };

  const handleAnswer = async (option: string) => {
    if (!activeRoomId || !snapshot?.round || submitting) return;
    if (snapshot.room.phase !== "round_active") return;
    if (snapshot.me?.answered_current_round) return;

    setSubmitting(true);
    setSelectedAnswer({ round: snapshot.round.index, answer: option });
    const result = await submitMultiplayerAnswer(activeRoomId, snapshot.round.index, option);
    setSubmitting(false);
    if (!result.ok) {
      setSelectedAnswer(null);
      handleRoomFailure(result.error);
    } else {
      applySnapshot(result.snapshot);
    }
  };

  const handleLeave = async () => {
    const roomId = activeRoomId;
    clearRoom();
    setNotice("Hai lasciato la stanza.");
    if (roomId) await leaveMultiplayerRoom(roomId);
  };

  const handleCloseRoom = async () => {
    if (!activeRoomId) return;
    setBusy(true);
    const result = await closeMultiplayerRoom(activeRoomId);
    setBusy(false);
    if (!result.ok) handleRoomFailure(result.error);
    else applySnapshot(result.snapshot);
  };

  const handleKick = async (userId: string) => {
    if (!activeRoomId) return;
    setBusy(true);
    const result = await kickRoomMember(activeRoomId, userId);
    setBusy(false);
    if (!result.ok) handleRoomFailure(result.error);
    else applySnapshot(result.snapshot);
  };

  const handleCopyInvite = async () => {
    if (!snapshot) return;
    const url = `${window.location.origin}/multiplayer?room=${snapshot.room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copia non disponibile: condividi il codice manualmente.");
    }
  };

  const handleCopyCode = async () => {
    if (!snapshot) return;
    try {
      await navigator.clipboard.writeText(snapshot.room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copia non disponibile: seleziona il codice manualmente.");
    }
  };

  // ============================================================
  // Derivati
  // ============================================================
  const isHost = Boolean(snapshot?.me?.is_host);
  const startConditions = useMemo(
    () => (snapshot ? canStartGame(snapshot) : { allowed: false, reason: null }),
    [snapshot]
  );
  const hostAway = snapshot ? isHostAway(snapshot) : false;
  const serverNow = now;
  const phase = snapshot?.room.phase;
  const remainingMs =
    phase === "round_active" && snapshot?.round
      ? msRemaining(snapshot.round.ends_at, serverNow)
      : phase === "round_reveal"
        ? msRemaining(snapshot?.room.reveal_ends_at, serverNow)
        : 0;

  const quizTypes: { value: QuizType; label: string }[] = [
    { value: "capital", label: "Capitali" },
    { value: "flag", label: "Bandiere" },
    { value: "continent", label: "Continenti" },
    { value: "population", label: "Popolazione" },
  ];
  const difficulties: { value: Difficulty; label: string }[] = [
    { value: "easy", label: "Facile" },
    { value: "medium", label: "Medio" },
    { value: "hard", label: "Difficile" },
  ];
  const roundOptions = useMemo(() => {
    const max = Math.min(settings.max_rounds, 15);
    const values = [3, 5, 8, 10, 12, 15].filter(
      (value) => value >= settings.min_rounds && value <= max
    );
    return values.length ? values : [settings.min_rounds];
  }, [settings.max_rounds, settings.min_rounds]);

  // ============================================================
  // Vista: stanza attiva
  // ============================================================
  if (snapshot) {
    const room = snapshot.room;
    const me = snapshot.me;
    const players = snapshot.players;
    const connected = players.filter((player) => player.connection === "connected");
    const round = snapshot.round;
    const reveal = snapshot.reveal;
    const hasAnswered = Boolean(me?.answered_current_round);
    const mySelected =
      selectedAnswer && selectedAnswer.round === round?.index ? selectedAnswer.answer : null;
    const isLobby = room.phase === "lobby";
    const isClosed = room.phase === "closed";

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Intestazione stanza */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">{room.name}</h1>
            <p className="text-slate-400 text-sm">
              {quizTypeLabel(room.quiz_type)} · {difficultyLabel(room.difficulty)} ·{" "}
              {room.total_rounds} round · {room.round_seconds}s per round
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300">
                <span
                  className={`w-2 h-2 rounded-full ${connectionDot(me?.connection ?? "connected")}`}
                />
                {me ? connectionLabel(me.connection) : "Connessione…"} · {phaseLabel(room.phase)}
              </span>
              <span
                className="inline-flex items-center gap-2 text-xs px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300"
                title="Gli aggiornamenti arrivano dal database tramite Realtime; il polling è un fallback."
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    realtimeStatus === "subscribed" ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {realtimeStatus === "subscribed"
                  ? "Realtime connesso"
                  : "Sincronizzazione periodica"}
                {clockReady ? " · orologio sincronizzato" : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-slate-500">Codice invito</p>
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="font-mono text-2xl tracking-[0.25em] text-emerald-400 hover:text-emerald-300"
                aria-label="Copia codice stanza"
              >
                {room.code}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"
          >
            {notice}
          </p>
        )}
        {hostAway && !isClosed && (
          <p
            role="status"
            className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3"
          >
            L&apos;host è offline. Se non rientra, l&apos;host verrà trasferito automaticamente a un
            altro giocatore connesso.
          </p>
        )}
        {isClosed && (
          <p
            role="status"
            className="text-sm text-slate-300 bg-slate-800/70 border border-slate-700 rounded-xl px-4 py-3"
          >
            Stanza chiusa ({closedReasonLabel(room.closed_reason)}). I risultati restano visibili
            per un periodo limitato, poi vengono archiviati.
          </p>
        )}

        {isLobby && (
          <Card className="space-y-4 border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-teal-500/5">
            <CardHeader
              title="Lobby — in attesa dei giocatori"
              description="Condividi codice o link. Quando tutti sono pronti, l'host avvia la sfida."
              icon={<span className="text-2xl">🚪</span>}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void handleCopyInvite()}>
                {copied ? "✅ Link copiato!" : "🔗 Copia link invito"}
              </Button>
              <Button
                variant={me?.is_ready ? "secondary" : "primary"}
                size="sm"
                onClick={() => void handleReady(!(me?.is_ready ?? false))}
                disabled={busy}
              >
                {me?.is_ready ? "✕ Non pronto" : "✓ Sono pronto — via!"}
              </Button>
              <Link
                href="/profile"
                className="inline-flex items-center text-xs text-white/60 underline hover:text-white px-2"
              >
                Cambia nickname
              </Link>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/60">
              💡 Tip: la lobby mostra in tempo reale chi è connesso e pronto — l’avvio è solo dell’host per tenere il ritmo serrato.
            </div>
          </Card>
        )}

        {/* Elenco giocatori - più coinvolgente */}
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-white text-[#0a1433] flex items-center justify-center text-sm font-black">{connected.length}</span>
              Giocatori in lobby
              <span className="text-white/40 font-semibold">— {connected.length}/{room.max_players} connessi</span>
            </h2>
            {me && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-white text-[#0a1433]">
                Tu: {me.username} · {formatNumber(me.score)} pt
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {players.map((player) => {
              const isMe = player.user_id === snapshot.me?.user_id;
              return (
              <li
                key={player.user_id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition-all ${isMe ? "bg-white text-[#0a1433] border-white shadow-md" : player.is_ready ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/5 border-white/10 hover:bg-white/8"}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full shrink-0 ${connectionDot(player.connection)} ${player.connection === "connected" ? "animate-pulse" : ""}`} />
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border ${isMe ? "bg-[#0a1433] text-white border-white/20" : "bg-white/10 border-white/10 text-white"}`}>
                    {player.username.slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <p className={`font-black ${isMe ? "text-[#0a1433]" : "text-white"}`}>
                      {player.username}
                      {isMe && <span className={`text-xs font-bold ml-2 px-2 py-0.5 rounded-full ${isMe ? "bg-emerald-500 text-white" : "bg-white/15 text-white"}`}>TU</span>}
                      {player.is_host && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold ${isMe ? "bg-amber-400 text-[#1a1200]" : "bg-amber-500/20 text-amber-300 border border-amber-500/20"}`}>HOST</span>}
                    </p>
                    <p className={`text-xs font-medium ${isMe ? "text-[#0a1433]/60" : "text-white/50"}`}>
                      {connectionLabel(player.connection)}
                      {player.is_ready ? " • Pronto ✅" : " • In attesa…"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-black px-3 py-1 rounded-full border ${isMe ? "bg-[#0a1433] text-white border-[#0a1433]" : "bg-white/10 text-white border-white/10"}`}>{formatNumber(player.score)} pt</span>
                  {isLobby && isHost && player.user_id !== snapshot.me?.user_id && (
                    <Button variant="ghost" size="sm" onClick={() => void handleKick(player.user_id)} disabled={busy}>
                      Espelli
                    </Button>
                  )}
                </div>
              </li>
            )})}
          </ul>

          {isLobby && (
            <div className="pt-2 border-t border-slate-700/60 space-y-3">
              {isHost && (
                <>
                  <Button
                    onClick={() => void handleStart()}
                    disabled={busy || !startConditions.allowed}
                    className="w-full"
                  >
                    {busy ? "Avvio…" : "Avvia Partita"}
                  </Button>
                  {!startConditions.allowed && startConditions.reason && (
                    <p className="text-xs text-slate-400 text-center">{startConditions.reason}</p>
                  )}
                </>
              )}
              {!isHost && (
                <p className="text-xs text-slate-400 text-center">
                  In attesa che l&apos;host avvii la partita…
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Round in corso */}
        {room.phase === "round_active" && round && (
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  Domanda {round.index} di {room.total_rounds}
                </p>
                <h2 className="text-xl font-semibold text-white">{round.prompt}</h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Tempo rimasto</p>
                <p className="text-2xl font-mono text-emerald-300">
                  {formatCountdown(remainingMs)}
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Risposte ricevute: {round.answered_count}/{Math.max(round.connected_count, 1)} · Le
              soluzioni e i punteggi del round compaiono solo alla chiusura.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {round.options.map((option) => {
                const chosen = mySelected === option;
                return (
                  <button
                    key={option}
                    type="button"
                    data-testid="mp-answer-option"
                    onClick={() => void handleAnswer(option)}
                    disabled={hasAnswered || submitting || remainingMs === 0}
                    className={`text-left px-4 py-3 rounded-xl border transition ${
                      chosen
                        ? "bg-emerald-500/20 border-emerald-400 text-emerald-100"
                        : "bg-slate-800/70 border-slate-700 text-slate-200 hover:border-emerald-500/70 hover:bg-slate-800"
                    } disabled:opacity-60 disabled:cursor-not-allowed`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            {hasAnswered && (
              <p role="status" className="text-sm text-emerald-300">
                Risposta registrata dal server. Attendi la chiusura del round per vedere
                l&apos;esito.
              </p>
            )}
            {submitting && <p className="text-xs text-slate-400">Invio in corso…</p>}
          </Card>
        )}

        {/* Soluzione del round */}
        {room.phase === "round_reveal" && round && reveal && (
          <Card className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  Soluzione · round {reveal.round_index} di {room.total_rounds}
                </p>
                <h2 className="text-xl font-semibold text-white">
                  {round.prompt} — <span className="text-emerald-400">{reveal.correct_answer}</span>
                </h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Prossimo round tra</p>
                <p className="text-2xl font-mono text-slate-200">{formatCountdown(remainingMs)}</p>
              </div>
            </div>
            <ul className="space-y-2">
              {reveal.results
                .slice()
                .sort((a, b) => b.points - a.points)
                .map((result) => (
                  <li
                    key={result.user_id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-slate-800/60 border border-slate-700/70 px-4 py-2"
                  >
                    <span className="text-slate-200">
                      {result.username}
                      {result.user_id === me?.user_id ? " (tu)" : ""}
                    </span>
                    <span className="text-xs text-slate-400">
                      {result.is_correct ? "✅" : "❌"} {result.answer} · +{result.points} pts ·{" "}
                      {(result.response_ms / 1000).toFixed(1)}s
                    </span>
                  </li>
                ))}
              {reveal.results.length === 0 && (
                <li className="text-sm text-slate-400">Nessuna risposta inviata in tempo.</li>
              )}
            </ul>
          </Card>
        )}

        {/* Classifica finale */}
        {(room.phase === "finished" || isClosed) && (
          <Card className="space-y-4">
            <CardHeader
              title={room.phase === "finished" ? "Classifica finale" : "Risultati"}
              description="Calcolata e salvata dal server. XP e statistiche sono già state registrate."
              icon={<span className="text-2xl">🏆</span>}
            />
            <ol className="space-y-2">
              {snapshot.standings.map((entry) => (
                <li
                  key={entry.user_id}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                    entry.user_id === me?.user_id
                      ? "bg-emerald-500/10 border-emerald-500/50"
                      : "bg-slate-800/60 border-slate-700/70"
                  }`}
                >
                  <span className="flex items-center gap-3 text-slate-100">
                    <span className="font-mono text-slate-400">#{entry.rank}</span>
                    {entry.username}
                    {entry.user_id === me?.user_id ? " (tu)" : ""}
                    {entry.is_host ? " · host" : ""}
                  </span>
                  <span className="text-sm text-slate-300">
                    {formatNumber(entry.score)} pts · {entry.correct_count} corrette
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}

        {/* Azioni di uscita */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" onClick={() => void handleLeave()} disabled={busy}>
            {isClosed || room.phase === "finished"
              ? "Torna alla home multiplayer"
              : "Lascia la stanza"}
          </Button>
          {isHost && !isClosed && (
            <Button variant="ghost" onClick={() => void handleCloseRoom()} disabled={busy}>
              Chiudi stanza
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ============================================================
  // Vista: nessuna stanza attiva
  // ============================================================
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-white">Multiplayer</h1>
        <p className="text-slate-400">
          Sfide online reali tra amici, con stato e punteggi gestiti dal server Supabase
        </p>
      </div>

      {!online && (
        <Card className="space-y-3 border-amber-500/40">
          <h2 className="text-lg font-semibold text-amber-200">Multiplayer non configurato</h2>
          <p className="text-sm text-slate-300">
            Il gioco in singolo funziona senza configurazione, ma per il multiplayer online serve un
            progetto Supabase. La modalità offline non simula avversari né eventi di rete.
          </p>
          <p className="text-sm text-slate-400">
            Imposta <code className="text-emerald-300">NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
            <code className="text-emerald-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in{" "}
            <code className="text-emerald-300">.env.local</code> e applica le migrazioni. Istruzioni
            passo passo in <code>docs/SUPABASE_SETUP.md</code>.
          </p>
        </Card>
      )}

      {online && (
        <Card className="!p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2 text-slate-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  identity ? "bg-emerald-400" : identityError ? "bg-red-400" : "bg-amber-400"
                }`}
              />
              {identity ? (
                <span>
                  Connesso come <strong className="text-white">{identity.username}</strong>
                  {identity.isAnonymous ? " (ospite)" : ""}
                </span>
              ) : identityError ? (
                <span className="text-red-300">{describeMultiplayerError(identityError)}</span>
              ) : (
                <span>Connessione alla sessione Supabase…</span>
              )}
            </div>
            <Link href="/profile" className="text-xs text-slate-400 underline hover:text-slate-200">
              Gestisci profilo e account
            </Link>
          </div>
          {identityError && identityError !== "NOT_CONFIGURED" && (
            <p className="text-xs text-slate-400 mt-2">
              Suggerimento: abilita l&apos;accesso anonimo in Supabase (Authentication → Providers →
              Anonymous) oppure accedi dal profilo.
            </p>
          )}
        </Card>
      )}

      {error && (
        <p
          role="alert"
          className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3"
        >
          {notice}
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">🎮</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Crea Stanza</h2>
          <p className="text-slate-400 text-sm">
            Scegli modalità e limiti, poi condividi codice o link con gli amici.
          </p>
          <Button
            onClick={() => {
              setError("");
              setShowCreate(true);
            }}
            disabled={!online || !identity}
            className="w-full"
          >
            Crea Nuova Stanza
          </Button>
          {!identity && online && !identityError && (
            <p className="text-xs text-slate-500">Preparazione della sessione…</p>
          )}
          {identityError && online && (
            <p className="text-xs text-slate-500">Sessione online non disponibile.</p>
          )}
        </Card>

        <Card className="text-center space-y-4">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">🚪</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Unisciti</h2>
          <p className="text-slate-400 text-sm">
            Inserisci il codice a 6 caratteri ricevuto dall&apos;host.
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              setShowJoin(true);
            }}
            disabled={!online || !identity}
            className="w-full"
          >
            Unisciti a Stanza
          </Button>
        </Card>
      </div>

      <Card className="space-y-3">
        <CardHeader
          title="Come funziona (davvero online)"
          description="Nessun bot e nessun aggiornamento locale travestito da evento di rete."
          icon={<span className="text-2xl">🛰️</span>}
        />
        <ul className="text-sm text-slate-300 space-y-2 list-disc list-inside">
          <li>La sessione è gestita da Supabase Auth (anche come ospite).</li>
          <li>La stanza vive nel database: fase, round, timer e punteggi arrivano dal server.</li>
          <li>
            Gli eventi Realtime notificano i cambiamenti; se il canale non è disponibile il client
            sincronizza comunque via RPC ogni {Math.round(pollMs / 1000)} secondi.
          </li>
          <li>
            Le risposte corrette non sono mai inviate prima della fine del round e il punteggio non
            può essere impostato dal client.
          </li>
          <li>
            Se perdi la connessione puoi rientrare con lo stesso account: punteggio e round restano
            quelli del server.
          </li>
          <li>Le stanze inattive vengono chiuse automaticamente dopo i tempi configurati.</li>
        </ul>
        <p className="text-xs text-slate-500">
          Dati pubblici: nickname e livello. Dati privati: email, punteggi totali e storico partite
          (visibili solo a te e, in forma aggregata, in classifica). Dettagli in{" "}
          <code>docs/SECURITY.md</code>.
        </p>
      </Card>

      {localPlayer.gamesPlayed === 0 && (
        <p className="text-center text-xs text-slate-500">
          Allena prima i tuoi riflessi geografici in{" "}
          <Link href="/play" className="text-emerald-400 underline">
            Gioca
          </Link>
          .
        </p>
      )}

      {/* Modal crea stanza */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Crea Nuova Stanza">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="create-room-name"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Nome Stanza
            </label>
            <input
              id="create-room-name"
              type="text"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              maxLength={40}
              placeholder={`Sfida di ${identity?.username ?? localPlayer.username}`}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label
              htmlFor="create-room-quiz"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Tipo di Quiz
            </label>
            <select
              id="create-room-quiz"
              value={quizType}
              onChange={(event) => setQuizType(event.target.value as QuizType)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
            >
              {quizTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="create-room-diff"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Difficoltà
              </label>
              <select
                id="create-room-diff"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {difficulties.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="create-room-count"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Round
              </label>
              <select
                id="create-room-count"
                value={rounds}
                onChange={(event) => setRounds(Number(event.target.value))}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {roundOptions.map((value) => (
                  <option key={value} value={value}>
                    {value} round
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="create-room-players"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Max giocatori
              </label>
              <select
                id="create-room-players"
                value={maxPlayers}
                onChange={(event) => setMaxPlayers(Number(event.target.value))}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {[2, 3, 4, 5, 6, 7, 8]
                  .filter(
                    (value) => value >= settings.min_players && value <= settings.max_players_limit
                  )
                  .map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="create-room-seconds"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Secondi per round
              </label>
              <input
                id="create-room-seconds"
                type="number"
                min={settings.min_round_seconds}
                max={settings.max_round_seconds}
                value={roundSeconds}
                onChange={(event) => setRoundSeconds(Number(event.target.value))}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Il server impone i limiti: {settings.min_players}-{settings.max_players_limit}{" "}
            giocatori, {settings.min_rounds}-{settings.max_rounds} round,{" "}
            {settings.min_round_seconds}-{settings.max_round_seconds}s per round.
          </p>

          <Button onClick={() => void handleCreateRoom()} disabled={busy} className="w-full">
            {busy ? "Creazione in corso…" : "Crea Stanza"}
          </Button>
        </div>
      </Modal>

      {/* Modal unisciti */}
      <Modal isOpen={showJoin} onClose={() => setShowJoin(false)} title="Unisciti a Stanza">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="join-room-code"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Codice Stanza
            </label>
            <input
              id="join-room-code"
              type="text"
              value={joinCode}
              onChange={(event) => setJoinCode(normalizeRoomCode(event.target.value))}
              placeholder="ABC234"
              maxLength={6}
              autoComplete="off"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-center text-2xl font-mono tracking-widest"
            />
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-400">
              {error}
            </p>
          )}
          <Button onClick={() => void handleJoin()} disabled={busy} className="w-full">
            {busy ? "Connessione…" : "Unisciti"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
