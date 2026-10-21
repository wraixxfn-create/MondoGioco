"use client";
"use no memo";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Timer } from "@/components/ui/Timer";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { LoadingSpinner } from "@/components/ui/StatusStates";
import { generateQuiz } from "@/lib/utils/quiz-generator";
import { calculatePoints, haversineDistance, continentLabel, formatNumber } from "@/lib/utils";
import type { QuizQuestion, QuizType, Difficulty, PlayerAnswer } from "@/types";
import dynamic from "next/dynamic";

const GlobeContainer = dynamic(
  () => import("@/components/globe/Globe").then((mod) => mod.GlobeContainer),
  { ssr: false }
);

// ============================================================
// Schermata di selezione
// ============================================================

interface GameConfig {
  quizType: QuizType;
  difficulty: Difficulty;
  questionCount: number;
}

const QUIZ_TYPES: { value: QuizType; label: string; icon: string; description: string }[] = [
  { value: "capital", label: "Capitali", icon: "🏛️", description: "Indovina la capitale del paese" },
  { value: "flag", label: "Bandiere", icon: "🏳️", description: "Riconosci la bandiera del paese" },
  { value: "location", label: "Posizione", icon: "📍", description: "Indica dove si trova il paese sul globo" },
  { value: "continent", label: "Continenti", icon: "🗺️", description: "Indovina il continente del paese" },
  { value: "population", label: "Popolazione", icon: "👥", description: "Quale paese ha più abitanti?" },
];

const DIFFICULTIES: { value: Difficulty; label: string; color: string }[] = [
  { value: "easy", label: "Facile", color: "emerald" },
  { value: "medium", label: "Medio", color: "amber" },
  { value: "hard", label: "Difficile", color: "red" },
];

export default function PlayPage() {
  const [phase, setPhase] = useState<"config" | "playing" | "results">("config");
  const [config, setConfig] = useState<GameConfig>({
    quizType: "capital",
    difficulty: "easy",
    questionCount: 10,
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<PlayerAnswer[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [clickedCoords, setClickedCoords] = useState<{ lat: number; lng: number } | null>(null);

  const currentQuestion = questions[currentQuestionIndex];
  const showResultRef = useRef(showResult);
  showResultRef.current = showResult;
  const currentQuestionRef = useRef(currentQuestion);
  currentQuestionRef.current = currentQuestion;
  const configRef = useRef(config);
  configRef.current = config;

  // Risposta al quiz
  const submitAnswer = useCallback(
    (answer: string, coords: { lat: number; lng: number } | null, timeSpent: number) => {
      const question = currentQuestionRef.current;
      if (!question || showResultRef.current) return;

      let isCorrect = false;

      if (question.type === "location" && coords) {
        const distance = haversineDistance(
          coords.lat,
          coords.lng,
          question.correctCoordinates!.lat,
          question.correctCoordinates!.lng
        );
        const thresholds: Record<Difficulty, number> = { easy: 800, medium: 500, hard: 200 };
        isCorrect = distance <= thresholds[configRef.current.difficulty];
      } else {
        isCorrect = answer === question.correctAnswer;
      }

      const points = calculatePoints(isCorrect, timeSpent, question.timeLimit);

      const playerAnswer: PlayerAnswer = {
        questionId: question.id,
        answer,
        coordinates: coords ?? undefined,
        timeSpent,
        isCorrect,
        points,
      };

      setAnswers((prev) => [...prev, playerAnswer]);
      setSelectedAnswer(answer);
      setShowResult(true);
      if (coords) setClickedCoords(coords);
    },
    []
  );

  // Timer
  useEffect(() => {
    if (phase !== "playing" || showResult || !currentQuestion) return;

    setTimeLeft(currentQuestion.timeLimit);
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Gestione timeout — rispondi con risposta vuota
          const question = currentQuestionRef.current;
          if (question && !showResultRef.current) {
            submitAnswer("", null, question.timeLimit);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionIndex, phase, showResult]);

  const startGame = useCallback(() => {
    const newQuestions = generateQuiz(
      config.quizType,
      config.difficulty,
      config.questionCount
    );
    setQuestions(newQuestions);
    setCurrentQuestionIndex(0);
    setAnswers([]);
    setSelectedAnswer(null);
    setShowResult(false);
    setClickedCoords(null);
    setPhase("playing");
  }, [config]);

  const handleNextQuestion = useCallback(() => {
    if (currentQuestionIndex + 1 >= questions.length) {
      setPhase("results");
    } else {
      setCurrentQuestionIndex((prev) => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setClickedCoords(null);
    }
  }, [currentQuestionIndex, questions.length]);

  // ============================================================
  // Fase: Configurazione
  // ============================================================
  if (phase === "config") {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Nuova Partita</h1>
          <p className="text-slate-400">Scegli il tipo di quiz e la difficoltà</p>
        </div>

        {/* Tipo di Quiz */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Tipo di Quiz</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {QUIZ_TYPES.map((type) => (
              <Card
                key={type.value}
                hover
                onClick={() => setConfig((c) => ({ ...c, quizType: type.value }))}
                className={
                  config.quizType === type.value
                    ? "border-emerald-500 bg-emerald-500/5"
                    : ""
                }
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{type.icon}</span>
                  <div>
                    <p className="font-semibold text-white">{type.label}</p>
                    <p className="text-xs text-slate-400">{type.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Difficoltà */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Difficoltà</h2>
          <div className="flex gap-3">
            {DIFFICULTIES.map((diff) => (
              <Button
                key={diff.value}
                variant={config.difficulty === diff.value ? "primary" : "secondary"}
                onClick={() => setConfig((c) => ({ ...c, difficulty: diff.value }))}
                className="flex-1"
              >
                {diff.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Numero di domande */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Numero di Domande</h2>
          <div className="flex gap-3">
            {[5, 10, 15, 20].map((count) => (
              <Button
                key={count}
                variant={config.questionCount === count ? "primary" : "secondary"}
                onClick={() => setConfig((c) => ({ ...c, questionCount: count }))}
                className="flex-1"
              >
                {count}
              </Button>
            ))}
          </div>
        </div>

        {/* Avvia */}
        <div className="pt-4">
          <Button size="lg" onClick={startGame} className="w-full">
            Inizia Partita 🎮
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Fase: Risultati
  // ============================================================
  if (phase === "results") {
    const totalScore = answers.reduce((sum, a) => sum + a.points, 0);
    const correctAnswers = answers.filter((a) => a.isCorrect).length;
    const accuracy = Math.round((correctAnswers / questions.length) * 100);

    return (
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Partita Terminata!</h1>
          <p className="text-slate-400">Ecco i tuoi risultati</p>
        </div>

        <Card className="text-center space-y-6">
          <div className="text-6xl font-bold gradient-text">
            {formatNumber(totalScore)}
          </div>
          <p className="text-slate-400">Punti Totali</p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-emerald-400">
                {correctAnswers}/{questions.length}
              </div>
              <p className="text-xs text-slate-400">Corrette</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400">{accuracy}%</div>
              <p className="text-xs text-slate-400">Precisione</p>
            </div>
            <div>
              <div className="text-2xl font-bold text-cyan-400">
                {Math.round(
                  answers.reduce((sum, a) => sum + a.timeSpent, 0) / answers.length
                )}s
              </div>
              <p className="text-xs text-slate-400">Tempo Medio</p>
            </div>
          </div>
        </Card>

        {/* Dettaglio risposte */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Dettaglio Risposte</h2>
          {answers.map((answer, index) => (
            <Card key={answer.questionId} className="!p-4">
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {answer.isCorrect ? "✅" : "❌"}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-white">
                    {questions[index]?.prompt}
                  </p>
                  <p className="text-xs text-slate-400">
                    Risposta corretta: {questions[index]?.correctAnswer}
                  </p>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold ${answer.isCorrect ? "text-emerald-400" : "text-red-400"}`}>
                    +{answer.points}
                  </div>
                  <p className="text-xs text-slate-500">
                    {answer.timeSpent.toFixed(1)}s
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="flex gap-4">
          <Button onClick={startGame} className="flex-1">
            Gioca Ancora
          </Button>
          <Button variant="secondary" onClick={() => setPhase("config")} className="flex-1">
            Cambia Impostazioni
          </Button>
        </div>
      </div>
    );
  }

  // ============================================================
  // Fase: Gioco
  // ============================================================
  if (!currentQuestion) {
    return <LoadingSpinner text="Preparazione domande..." />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header con progresso e timer */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <ProgressBar
            value={((currentQuestionIndex + 1) / questions.length) * 100}
            label={`Domanda ${currentQuestionIndex + 1} di ${questions.length}`}
          />
        </div>
        <Timer seconds={timeLeft} total={currentQuestion.timeLimit} />
      </div>

      {/* Punteggio corrente */}
      <div className="text-center">
        <span className="text-sm text-slate-400">Punteggio: </span>
        <span className="text-lg font-bold gradient-text">
          {formatNumber(answers.reduce((sum, a) => sum + a.points, 0))}
        </span>
      </div>

      {/* Quiz con Globo (per tipo location) */}
      {currentQuestion.type === "location" ? (
        <LocationQuiz
          question={currentQuestion}
          showResult={showResult}
          clickedCoords={clickedCoords}
          onGlobeClick={(lat, lng) => {
            if (showResult) return;
            const timeSpent = currentQuestion.timeLimit - timeLeft;
            submitAnswer(currentQuestion.country.name, { lat, lng }, timeSpent);
          }}
        />
      ) : (
        <MultipleChoiceQuiz
          question={currentQuestion}
          selectedAnswer={selectedAnswer}
          showResult={showResult}
          onAnswer={(answer) => {
            if (showResult) return;
            const timeSpent = currentQuestion.timeLimit - timeLeft;
            submitAnswer(answer, null, timeSpent);
          }}
        />
      )}

      {/* Pulsante prossimo */}
      {showResult && (
        <div className="text-center pt-4">
          <Button size="lg" onClick={handleNextQuestion}>
            {currentQuestionIndex + 1 >= questions.length
              ? "Vedi Risultati"
              : "Prossima Domanda →"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Componente Quiz a scelta multipla
// ============================================================

function MultipleChoiceQuiz({
  question,
  selectedAnswer,
  showResult,
  onAnswer,
}: {
  question: QuizQuestion;
  selectedAnswer: string | null;
  showResult: boolean;
  onAnswer: (answer: string) => void;
}) {
  return (
    <Card className="space-y-6">
      <h2 className="text-xl md:text-2xl font-bold text-white text-center">
        {question.prompt}
      </h2>

      {/* Bandiera grande per quiz di tipo flag */}
      {question.type === "flag" && (
        <div className="text-center text-7xl animate-float">
          {question.country.flag}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {question.options.map((option) => {
          const isCorrect = option === question.correctAnswer;
          const isSelected = option === selectedAnswer;

          let optionStyle =
            "border-slate-700 hover:border-emerald-500/50 hover:bg-emerald-500/5";

          if (showResult) {
            if (isCorrect) {
              optionStyle = "border-emerald-500 bg-emerald-500/10";
            } else if (isSelected && !isCorrect) {
              optionStyle = "border-red-500 bg-red-500/10";
            } else {
              optionStyle = "border-slate-800 opacity-50";
            }
          }

          return (
            <button
              key={option}
              onClick={() => onAnswer(option)}
              disabled={showResult}
              className={`
                p-4 rounded-xl border-2 text-left transition-all duration-200
                ${optionStyle}
                ${showResult ? "cursor-default" : "cursor-pointer"}
              `}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">
                  {question.type === "continent" ? continentLabel(option) : option}
                </span>
                {showResult && isCorrect && (
                  <span className="ml-auto text-emerald-400">✓</span>
                )}
                {showResult && isSelected && !isCorrect && (
                  <span className="ml-auto text-red-400">✗</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ============================================================
// Componente Quiz con Globo (location)
// ============================================================

function LocationQuiz({
  question,
  showResult,
  clickedCoords,
  onGlobeClick,
}: {
  question: QuizQuestion;
  showResult: boolean;
  clickedCoords: { lat: number; lng: number } | null;
  onGlobeClick: (lat: number, lng: number) => void;
}) {
  const markers = [];

  if (clickedCoords) {
    markers.push({
      id: "clicked",
      lat: clickedCoords.lat,
      lng: clickedCoords.lng,
      color: "#ef4444",
      label: "La tua scelta",
      size: 0.03,
    });
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-xl md:text-2xl font-bold text-white text-center">
        {question.prompt}
      </h2>
      <p className="text-center text-slate-400 text-sm">
        {showResult
          ? "La posizione corretta è evidenziata in giallo"
          : "Clicca sul globo per indicare la posizione"}
      </p>

      <GlobeContainer
        selectable={!showResult}
        autoRotate={false}
        height="400px"
        onGlobeClick={onGlobeClick}
        markers={markers}
        highlightCoords={showResult ? question.correctCoordinates ?? null : null}
      />

      {showResult && clickedCoords && question.correctCoordinates && (
        <div className="text-center">
          <p className="text-sm text-slate-400">
            Distanza:{" "}
            <span className="font-bold text-white">
              {formatNumber(
                Math.round(
                  haversineDistance(
                    clickedCoords.lat,
                    clickedCoords.lng,
                    question.correctCoordinates.lat,
                    question.correctCoordinates.lng
                  )
                )
              )}{" "}
              km
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}
