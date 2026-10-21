"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/StatusStates";
import { Timer } from "@/components/ui/Timer";
import {
  calculatePoints,
  continentLabel,
  difficultyLabel,
  formatNumber,
  quizTypeLabel,
} from "@/lib/utils";
import {
  advanceMultiplayerQuestion,
  createMultiplayerRoom,
  joinMultiplayerRoom,
  leaveMultiplayerRoom,
  listPublicRooms,
  refreshRoomSnapshot,
  startMultiplayerMatch,
  submitMultiplayerPoints,
  subscribeToRoomState,
  togglePlayerReady,
  type MultiplayerParticipant,
  type MultiplayerRoomInfo,
  type PublicRoomSummary,
} from "@/lib/services/multiplayer";
import {
  INITIAL_PLAYER_STATE,
  loadLocalPlayer,
  recordGameResult,
  renamePlayer,
  type LocalPlayerState,
} from "@/lib/services/player-store";
import type { Difficulty, QuizType } from "@/types";

export default function MultiplayerPage() {
  const [me, setMe] = useState<LocalPlayerState>(INITIAL_PLAYER_STATE);
  const [nicknameInput, setNicknameInput] = useState("");
  const [publicRooms, setPublicRooms] = useState<PublicRoomSummary[]>([]);
  const [source, setSource] = useState<"cloud" | "local">("cloud");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [selectedQuizType, setSelectedQuizType] = useState<QuizType>("capital");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("easy");
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [feedbackError, setFeedbackError] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [busy, setBusy] = useState(false);

  // Stato stanza attiva
  const [activeRoom, setActiveRoom] = useState<MultiplayerRoomInfo | null>(null);
  const [players, setPlayers] = useState<MultiplayerParticipant[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answeredQuestionIdx, setAnsweredQuestionIdx] = useState<number>(-1);
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState<number>(30);
  const [localCorrectCount, setLocalCorrectCount] = useState<number>(0);
  const [xpAwarded, setXpAwarded] = useState<number | null>(null);

  const loadLobby = useCallback(async () => {
    const player = loadLocalPlayer();
    setMe(player);
    setNicknameInput(player.username);
    const res = await listPublicRooms();
    setPublicRooms(res.rooms);
    setSource(res.source);
  }, []);

  useEffect(() => {
    void loadLobby();
  }, [loadLobby]);

  const activeRoomId = activeRoom?.id ?? null;
  const activeRoomStatus = activeRoom?.status ?? null;
  const activeQuestionIndex = activeRoom?.currentQuestion ?? 0;

  // Sincronizzazione Realtime della stanza attiva
  useEffect(() => {
    if (!activeRoomId) return;
    const sync = async () => {
      const snap = await refreshRoomSnapshot(activeRoomId);
      if (snap) {
        setActiveRoom(snap.room);
        setPlayers(snap.players);
      }
    };
    const unsubscribe = subscribeToRoomState(activeRoomId, () => {
      void sync();
    });
    return unsubscribe;
  }, [activeRoomId]);

  const currentQuestion =
    activeRoom && activeRoom.status === "playing"
      ? (activeRoom.questions[activeRoom.currentQuestion] ?? null)
      : null;
  const currentTimeLimit = currentQuestion?.timeLimit ?? 30;

  // Reset stato domanda ad ogni cambio indice
  useEffect(() => {
    if (!activeRoomId || activeRoomStatus !== "playing") return;
    const now = Date.now();
    setSelectedAnswer(null);
    setAnsweredQuestionIdx(-1);
    setQuestionStartedAt(now);
    setSecondsLeft(currentTimeLimit);
  }, [activeRoomId, activeRoomStatus, activeQuestionIndex, currentTimeLimit]);

  // Countdown per la domanda corrente
  useEffect(() => {
    if (activeRoomStatus !== "playing") return;
    if (answeredQuestionIdx === activeQuestionIndex) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - questionStartedAt) / 1000);
      const rem = Math.max(0, currentTimeLimit - elapsed);
      setSecondsLeft(rem);
      if (rem <= 0) {
        setAnsweredQuestionIdx(activeQuestionIndex);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [
    activeRoomStatus,
    activeQuestionIndex,
    currentTimeLimit,
    answeredQuestionIdx,
    questionStartedAt,
  ]);

  const finishRecordedRef = useRef<string | null>(null);

  // Salvataggio XP e punteggio a fine partita multiplayer
  useEffect(() => {
    if (!activeRoom || activeRoom.status !== "finished") return;
    if (finishRecordedRef.current === activeRoom.id) return;
    finishRecordedRef.current = activeRoom.id;

    const sorted = [...players].sort((a, b) => b.score - a.score);
    const mine = sorted.find((p) => p.userId === me.playerId);
    const myScore = mine?.score ?? 0;
    const won = sorted[0]?.userId === me.playerId && myScore > 0;
    void recordGameResult({
      mode: `multiplayer_${activeRoom.quizType}`,
      difficulty: activeRoom.difficulty,
      score: myScore,
      roundsPlayed: activeRoom.totalQuestions,
      goodRounds: localCorrectCount,
      bestStreak: localCorrectCount,
      won,
    }).then((res) => {
      setXpAwarded(res.xpEarned);
      setMe(res.player);
    });
  }, [activeRoom, players, me.playerId, localCorrectCount]);

  const handleSaveNickname = async () => {
    const res = await renamePlayer(nicknameInput);
    if (!res.ok) {
      setFeedbackError(res.error ?? "Nome non valido.");
      return;
    }
    setFeedbackError("");
    setMe(res.player);
  };

  const handleCreateRoom = async () => {
    setBusy(true);
    setFeedbackError("");
    const created = await createMultiplayerRoom({
      name: roomName,
      quizType: selectedQuizType,
      difficulty: selectedDifficulty,
      totalQuestions,
      isPublic: isPublicRoom,
    });
    setActiveRoom(created.room);
    setPlayers(created.players);
    setSource(created.source);
    setLocalCorrectCount(0);
    setXpAwarded(null);
    setShowCreateModal(false);
    setRoomName("");
    setBusy(false);
  };

  const handleJoinByCode = async (targetCode?: string) => {
    const code = (targetCode ?? roomCode).trim().toUpperCase();
    if (code.length !== 6) {
      setFeedbackError("Il codice stanza deve avere 6 caratteri.");
      return;
    }
    setBusy(true);
    setFeedbackError("");
    const joined = await joinMultiplayerRoom(code);
    setBusy(false);
    if (!joined.ok || !joined.room || !joined.players) {
      setFeedbackError(joined.error ?? "Impossibile unirsi alla stanza.");
      return;
    }
    setActiveRoom(joined.room);
    setPlayers(joined.players);
    setSource(joined.source);
    setLocalCorrectCount(0);
    setXpAwarded(null);
    setShowJoinModal(false);
    setRoomCode("");
  };

  const handleCopyCode = async () => {
    if (!activeRoom) return;
    try {
      await navigator.clipboard.writeText(activeRoom.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignorato se clipboard non supportata.
    }
  };

  const myParticipant = players.find((p) => p.userId === me.playerId);
  const isHost = activeRoom ? activeRoom.hostId === me.playerId : false;

  const handleAnswerOption = useCallback(
    async (option: string) => {
      if (!activeRoom || !currentQuestion) return;
      if (answeredQuestionIdx === activeRoom.currentQuestion) return;

      const spent = Math.max(0.2, currentQuestion.timeLimit - secondsLeft);
      const correct = option === currentQuestion.correctAnswer;
      const pts = calculatePoints(correct, spent, currentQuestion.timeLimit);
      const updatedScore = (myParticipant?.score ?? 0) + pts;
      const updatedCount = activeRoom.currentQuestion + 1;

      setSelectedAnswer(option);
      setAnsweredQuestionIdx(activeRoom.currentQuestion);
      if (correct) setLocalCorrectCount((c) => c + 1);

      setPlayers((prev) =>
        prev.map((p) =>
          p.userId === me.playerId ? { ...p, score: updatedScore, answeredCount: updatedCount } : p
        )
      );
      await submitMultiplayerPoints(activeRoom.id, updatedScore, updatedCount);
    },
    [
      activeRoom,
      currentQuestion,
      answeredQuestionIdx,
      secondsLeft,
      myParticipant?.score,
      me.playerId,
    ]
  );

  const handleLeaveRoom = async () => {
    if (activeRoom) {
      await leaveMultiplayerRoom(activeRoom.id);
    }
    setActiveRoom(null);
    setPlayers([]);
    setXpAwarded(null);
    void loadLobby();
  };

  const formatOptionLabel = (option: string, type: QuizType) => {
    if (type === "continent") return continentLabel(option);
    return option;
  };

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

  // ============================================================
  // Vista 1: Stanza attiva (Lobby d'attesa / Partita / Podio)
  // ============================================================
  if (activeRoom) {
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const hasAnswered = answeredQuestionIdx === activeRoom.currentQuestion;

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-white">{activeRoom.name}</h1>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                {activeRoom.code}
              </span>
            </div>
            <p className="text-sm text-slate-400 mt-1">
              Quiz {quizTypeLabel(activeRoom.quizType)} · Difficoltà{" "}
              {difficultyLabel(activeRoom.difficulty)} · {activeRoom.totalQuestions} domande
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void handleLeaveRoom()}>
            Esci dalla stanza
          </Button>
        </div>

        {/* Stato: IN ATTESA */}
        {activeRoom.status === "waiting" && (
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-6">
            <Card className="space-y-5">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">
                  Codice invito stanza
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <div className="text-3xl font-mono font-bold tracking-widest text-emerald-400 bg-slate-900/80 border border-slate-700 rounded-xl px-5 py-3">
                    {activeRoom.code}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => void handleCopyCode()}>
                    {copiedCode ? "✓ Copiato!" : "📋 Copia codice"}
                  </Button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Condividi il codice con i tuoi amici per giocare insieme in tempo reale, oppure
                  avvia subito la sfida.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-800">
                {!isHost && (
                  <Button
                    variant={myParticipant?.isReady ? "secondary" : "primary"}
                    onClick={() => void togglePlayerReady(activeRoom.id, !myParticipant?.isReady)}
                    className="flex-1"
                  >
                    {myParticipant?.isReady ? "✓ Sei pronto" : "Segna Pronto"}
                  </Button>
                )}
                {isHost && (
                  <Button
                    size="lg"
                    onClick={async () => {
                      await startMultiplayerMatch(activeRoom.id);
                      const snap = await refreshRoomSnapshot(activeRoom.id);
                      if (snap) {
                        setActiveRoom(snap.room);
                        setPlayers(snap.players);
                      }
                    }}
                    className="flex-1"
                  >
                    🚀 Avvia Partita
                  </Button>
                )}
              </div>
            </Card>

            <Card className="space-y-4">
              <h2 className="text-lg font-semibold text-white">
                Giocatori nella stanza ({players.length}/{activeRoom.maxPlayers})
              </h2>
              <div className="space-y-2">
                {sortedPlayers.map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60"
                  >
                    <div className="flex items-center gap-2">
                      <span>{p.isHost ? "👑" : "🧭"}</span>
                      <span className="font-medium text-white">{p.username}</span>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        p.isReady
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-700 text-slate-400"
                      }`}
                    >
                      {p.isReady ? "Pronto" : "In attesa"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Stato: PARTITA IN CORSO */}
        {activeRoom.status === "playing" && currentQuestion && (
          <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 items-start">
            <Card className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-emerald-400">
                  Domanda {activeRoom.currentQuestion + 1} di {activeRoom.totalQuestions}
                </span>
                <Timer seconds={secondsLeft} total={currentQuestion.timeLimit} />
              </div>

              <h2 className="text-2xl font-bold text-white">{currentQuestion.prompt}</h2>

              <div className="grid sm:grid-cols-2 gap-3">
                {currentQuestion.options.map((opt) => {
                  const isCorrect = opt === currentQuestion.correctAnswer;
                  const isChosen = opt === selectedAnswer;
                  let btnCls =
                    "bg-slate-800/80 border-slate-700 text-white hover:border-emerald-500";
                  if (hasAnswered) {
                    if (isCorrect) {
                      btnCls = "bg-emerald-500/20 border-emerald-500 text-emerald-200";
                    } else if (isChosen) {
                      btnCls = "bg-red-500/20 border-red-500 text-red-200";
                    } else {
                      btnCls = "bg-slate-900/50 border-slate-800 text-slate-500";
                    }
                  }
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={hasAnswered}
                      onClick={() => void handleAnswerOption(opt)}
                      className={`p-4 rounded-xl border text-left font-medium transition-all ${btnCls}`}
                    >
                      {formatOptionLabel(opt, activeRoom.quizType)}
                    </button>
                  );
                })}
              </div>

              {hasAnswered && (
                <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-800">
                  <p className="text-sm text-slate-300">
                    {selectedAnswer === currentQuestion.correctAnswer ? (
                      <span className="text-emerald-400 font-semibold">✓ Risposta esatta!</span>
                    ) : (
                      <span>
                        Risposta corretta:{" "}
                        <strong className="text-white">
                          {formatOptionLabel(currentQuestion.correctAnswer, activeRoom.quizType)}
                        </strong>
                      </span>
                    )}
                  </p>
                  {isHost ? (
                    <Button
                      size="sm"
                      onClick={async () => {
                        const nextIdx = activeRoom.currentQuestion + 1;
                        await advanceMultiplayerQuestion(
                          activeRoom.id,
                          nextIdx,
                          activeRoom.totalQuestions
                        );
                        const snap = await refreshRoomSnapshot(activeRoom.id);
                        if (snap) {
                          setActiveRoom(snap.room);
                          setPlayers(snap.players);
                        }
                      }}
                    >
                      {activeRoom.currentQuestion + 1 >= activeRoom.totalQuestions
                        ? "🏁 Termina e vedi classifica"
                        : "➡️ Prossima domanda"}
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">
                      In attesa dell&apos;host per la prossima domanda…
                    </span>
                  )}
                </div>
              )}
            </Card>

            <Card className="space-y-4">
              <h3 className="text-base font-semibold text-white">Classifica in tempo reale</h3>
              <div className="space-y-2">
                {sortedPlayers.map((p, idx) => (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-bold text-slate-400 w-6">#{idx + 1}</span>
                      <span className="text-sm font-medium text-white truncate">{p.username}</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">
                      {formatNumber(p.score)} pts
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* Stato: PARTITA TERMINATA */}
        {activeRoom.status === "finished" && (
          <Card className="text-center space-y-6 py-8">
            <div className="text-5xl">🏆</div>
            <div>
              <h2 className="text-3xl font-bold text-white">Sfida completata!</h2>
              {xpAwarded !== null && xpAwarded > 0 && (
                <p className="text-sm text-emerald-400 mt-1">
                  +{xpAwarded} XP guadagnati e salvati in classifica
                </p>
              )}
            </div>
            <div className="max-w-md mx-auto space-y-2 text-left">
              {sortedPlayers.map((p, idx) => (
                <div
                  key={p.userId}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-800/70 border border-slate-700"
                >
                  <span className="font-semibold text-white">
                    {idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : `#${idx + 1} `}
                    {p.username}
                  </span>
                  <span className="font-bold text-emerald-400">{formatNumber(p.score)} pts</span>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-3">
              <Button onClick={() => void handleLeaveRoom()}>Torna alla lobby Multiplayer</Button>
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ============================================================
  // Vista 2: Lobby principale Multiplayer
  // ============================================================
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-white">Multiplayer</h1>
        <p className="text-slate-400">
          Sfida i tuoi amici in tempo reale su Supabase Realtime o unisciti a una stanza aperta
        </p>
        <div className="pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                source === "cloud" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {source === "cloud" ? "Supabase Realtime connesso" : "Modalità stanza locale"}
          </span>
        </div>
      </div>

      {/* Nickname rapido */}
      <Card className="!p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <label
              htmlFor="mp-nickname"
              className="block text-xs uppercase tracking-wider text-slate-400 mb-1"
            >
              Il tuo nome in partita
            </label>
            <input
              id="mp-nickname"
              type="text"
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              maxLength={24}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          {nicknameInput.trim() !== me.username && (
            <Button size="sm" onClick={() => void handleSaveNickname()}>
              Salva nome
            </Button>
          )}
        </div>
        {feedbackError && (
          <p role="alert" className="text-xs text-red-400 mt-2">
            {feedbackError}
          </p>
        )}
      </Card>

      {/* Azioni principali */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">🎮</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Crea Stanza</h2>
          <p className="text-slate-400 text-sm">
            Crea una stanza pubblica o privata e condividi il codice a 6 caratteri
          </p>
          <Button onClick={() => setShowCreateModal(true)} className="w-full">
            Crea Nuova Stanza
          </Button>
        </Card>

        <Card className="text-center space-y-4">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">🚪</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Unisciti</h2>
          <p className="text-slate-400 text-sm">
            Inserisci il codice stanza per entrare subito nella partita
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setFeedbackError("");
              setShowJoinModal(true);
            }}
            className="w-full"
          >
            Unisciti a Stanza
          </Button>
        </Card>
      </div>

      {/* Stanze pubbliche attive */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <CardHeader
            title="Stanze Pubbliche Aperte"
            description="Entra con un clic in una sfida in attesa"
            icon={<span className="text-2xl">🌐</span>}
          />
          <Button variant="ghost" size="sm" onClick={() => void loadLobby()}>
            🔄 Aggiorna
          </Button>
        </div>

        {publicRooms.length === 0 ? (
          <EmptyState
            title="Nessuna Stanza Pubblica"
            message="Non ci sono stanze in attesa in questo momento. Creane una tu!"
          />
        ) : (
          <div className="space-y-3">
            {publicRooms.map(({ room, playerCount }) => (
              <div
                key={room.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-800/60 border border-slate-700/70"
              >
                <div>
                  <p className="font-semibold text-white">{room.name}</p>
                  <p className="text-xs text-slate-400">
                    {quizTypeLabel(room.quizType)} · {difficultyLabel(room.difficulty)} ·{" "}
                    {playerCount}/{room.maxPlayers} giocatori · Codice{" "}
                    <span className="font-mono text-emerald-400">{room.code}</span>
                  </p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => void handleJoinByCode(room.code)}>
                  Entra
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal Crea Stanza */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crea Nuova Stanza"
      >
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
              onChange={(e) => setRoomName(e.target.value)}
              placeholder={`Sfida di ${me.username}`}
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
              value={selectedQuizType}
              onChange={(e) => setSelectedQuizType(e.target.value as QuizType)}
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
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value as Difficulty)}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {difficulties.map((diff) => (
                  <option key={diff.value} value={diff.value}>
                    {diff.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="create-room-count"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Domande
              </label>
              <select
                id="create-room-count"
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(Number(e.target.value))}
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {[5, 8, 10, 15].map((n) => (
                  <option key={n} value={n}>
                    {n} domande
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublicRoom}
              onChange={(e) => setIsPublicRoom(e.target.checked)}
              className="rounded accent-emerald-500"
            />
            Mostra nella lista delle stanze pubbliche
          </label>

          <Button onClick={() => void handleCreateRoom()} disabled={busy} className="w-full">
            {busy ? "Creazione in corso…" : "Crea Stanza"}
          </Button>
        </div>
      </Modal>

      {/* Modal Unisciti */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        title="Unisciti a Stanza"
      >
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
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-center text-2xl font-mono tracking-widest"
            />
          </div>

          {feedbackError && (
            <p role="alert" className="text-xs text-red-400">
              {feedbackError}
            </p>
          )}

          <Button onClick={() => void handleJoinByCode()} disabled={busy} className="w-full">
            {busy ? "Connessione…" : "Unisciti"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
