"use client";

import React, { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/StatusStates";
import { generateRoomCode } from "@/lib/utils";
import type { QuizType, Difficulty } from "@/types";

export default function MultiplayerPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [roomName, setRoomName] = useState("");
  const [selectedQuizType, setSelectedQuizType] = useState<QuizType>("capital");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("easy");

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    alert(`Stanza creata! Codice: ${code}\n\n(Nota: la funzionalità multiplayer richiede la configurazione di Supabase Realtime)`);
    setShowCreateModal(false);
    setRoomName("");
  };

  const handleJoinRoom = () => {
    if (roomCode.length !== 6) {
      alert("Il codice stanza deve avere 6 caratteri");
      return;
    }
    alert(`Connessione alla stanza ${roomCode.toUpperCase()}...\n\n(Nota: la funzionalità multiplayer richiede la configurazione di Supabase Realtime)`);
    setShowJoinModal(false);
    setRoomCode("");
  };

  const quizTypes: { value: QuizType; label: string }[] = [
    { value: "capital", label: "Capitali" },
    { value: "flag", label: "Bandiere" },
    { value: "location", label: "Posizione" },
    { value: "continent", label: "Continenti" },
    { value: "population", label: "Popolazione" },
  ];

  const difficulties: { value: Difficulty; label: string }[] = [
    { value: "easy", label: "Facile" },
    { value: "medium", label: "Medio" },
    { value: "hard", label: "Difficile" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Multiplayer</h1>
        <p className="text-slate-400">
          Sfida i tuoi amici in tempo reale o unisciti a partite pubbliche
        </p>
      </div>

      {/* Azioni principali */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
            <span className="text-3xl">🎮</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Crea Stanza</h2>
          <p className="text-slate-400 text-sm">
            Crea una stanza privata e invita i tuoi amici con un codice
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
            Inserisci il codice stanza per unirti a una partita esistente
          </p>
          <Button variant="secondary" onClick={() => setShowJoinModal(true)} className="w-full">
            Unisciti a Stanza
          </Button>
        </Card>
      </div>

      {/* Come funziona */}
      <Card>
        <CardHeader
          title="Come Funziona"
          description="Regole del multiplayer"
          icon={<span className="text-2xl">ℹ️</span>}
        />
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center text-xs font-bold text-emerald-400">
                1
              </span>
              <p className="font-semibold text-white">Crea o Unisciti</p>
            </div>
            <p className="text-slate-400 pl-8">
              Crea una stanza e condividi il codice, oppure inserisci un codice per unirti
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center text-xs font-bold text-emerald-400">
                2
              </span>
              <p className="font-semibold text-white">Gioca</p>
            </div>
            <p className="text-slate-400 pl-8">
              Rispondi alle domande più velocemente degli altri giocatori
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center text-xs font-bold text-emerald-400">
                3
              </span>
              <p className="font-semibold text-white">Vinci</p>
            </div>
            <p className="text-slate-400 pl-8">
              Chi totalizza più punti alla fine della partita vince
            </p>
          </div>
        </div>
      </Card>

      {/* Stato vuoto per stanze pubbliche */}
      <Card>
        <EmptyState
          title="Nessuna Stanza Pubblica"
          message="Al momento non ci sono stanze pubbliche disponibili. Creane una tu!"
        />
      </Card>

      {/* Modal Crea Stanza */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crea Nuova Stanza"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Nome Stanza
            </label>
            <input
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="La mia stanza"
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Tipo di Quiz
            </label>
            <select
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

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Difficoltà
            </label>
            <select
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

          <Button onClick={handleCreateRoom} className="w-full">
            Crea Stanza
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
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Codice Stanza
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-center text-2xl font-mono tracking-widest"
            />
          </div>

          <Button onClick={handleJoinRoom} className="w-full">
            Unisciti
          </Button>
        </div>
      </Modal>
    </div>
  );
}
