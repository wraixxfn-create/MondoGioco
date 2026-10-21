"use client";

import React, { useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { calculateLevel, formatNumber } from "@/lib/utils";

export default function ProfilePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Dati demo (in produzione verrebbero da Supabase)
  const demoProfile = {
    username: "Giocatore",
    email: "giocatore@example.com",
    totalScore: 15420,
    gamesPlayed: 23,
    gamesWon: 8,
    bestStreak: 12,
    xp: 2450,
  };

  const levelInfo = calculateLevel(demoProfile.xp);

  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Profilo</h1>
          <p className="text-slate-400">
            Accedi per salvare i tuoi progressi e competere con altri giocatori
          </p>
        </div>

        <Card className="text-center space-y-6">
          <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto">
            <span className="text-4xl">👤</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                placeholder="la-tua-email@esempio.com"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <Button onClick={() => setIsLoggedIn(true)} className="w-full">
            Accedi
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-900/60 text-slate-500">oppure</span>
            </div>
          </div>

          <Button variant="secondary" className="w-full">
            Crea Nuovo Account
          </Button>

          <p className="text-xs text-slate-500">
            Nota: l&apos;autenticazione richiede la configurazione di Supabase.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header Profilo */}
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-5xl">
          👤
        </div>
        <div className="text-center md:text-left flex-1">
          <h1 className="text-3xl font-bold text-white mb-1">
            {demoProfile.username}
          </h1>
          <p className="text-slate-400">{demoProfile.email}</p>
          <div className="flex items-center gap-4 mt-2 justify-center md:justify-start">
            <span className="text-sm text-slate-400">
              Livello <span className="font-bold text-emerald-400">{levelInfo.level}</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-sm text-slate-400">
              {formatNumber(demoProfile.xp)} XP
            </span>
          </div>
        </div>
        <Button variant="secondary" onClick={() => setIsLoggedIn(false)}>
          Esci
        </Button>
      </div>

      {/* Barra Progresso Livello */}
      <Card>
        <ProgressBar
          value={levelInfo.progress}
          label={`Progresso verso il livello ${levelInfo.level + 1}`}
          color="emerald"
        />
        <p className="text-xs text-slate-500 mt-2">
          {formatNumber(levelInfo.currentXp)} / {formatNumber(levelInfo.xpForNextLevel)} XP
        </p>
      </Card>

      {/* Statistiche */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-bold gradient-text mb-1">
            {formatNumber(demoProfile.totalScore)}
          </div>
          <p className="text-sm text-slate-400">Punti Totali</p>
        </Card>

        <Card className="text-center">
          <div className="text-3xl font-bold text-blue-400 mb-1">
            {demoProfile.gamesPlayed}
          </div>
          <p className="text-sm text-slate-400">Partite Giocate</p>
        </Card>

        <Card className="text-center">
          <div className="text-3xl font-bold text-amber-400 mb-1">
            {demoProfile.gamesWon}
          </div>
          <p className="text-sm text-slate-400">Partite Vinte</p>
        </Card>

        <Card className="text-center">
          <div className="text-3xl font-bold text-purple-400 mb-1">
            {demoProfile.bestStreak}
          </div>
          <p className="text-sm text-slate-400">Serie Migliore</p>
        </Card>
      </div>

      {/* Obiettivi */}
      <Card>
        <CardHeader
          title="Obiettivi"
          description="Completa le sfide per guadagnare XP extra"
          icon={<span className="text-2xl">🏆</span>}
        />
        <div className="space-y-4">
          {[
            { title: "Prima Partita", description: "Completa la tua prima partita", completed: true, xp: 100 },
            { title: "Esploratore", description: "Gioca 10 partite", completed: true, xp: 250 },
            { title: "Perfezionista", description: "Ottieni 100% di precisione in una partita", completed: false, xp: 500 },
            { title: "Maratoneta", description: "Gioca 50 partite", completed: false, xp: 1000 },
          ].map((achievement, index) => (
            <div
              key={index}
              className={`flex items-center gap-4 p-3 rounded-xl ${
                achievement.completed
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : "bg-slate-800/50 border border-slate-700"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  achievement.completed ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-500"
                }`}
              >
                {achievement.completed ? "✓" : "🔒"}
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${achievement.completed ? "text-white" : "text-slate-400"}`}>
                  {achievement.title}
                </p>
                <p className="text-xs text-slate-500">{achievement.description}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${achievement.completed ? "text-emerald-400" : "text-slate-500"}`}>
                  +{achievement.xp} XP
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Nota informativa */}
      <Card className="!p-4 bg-blue-500/5 border-blue-500/20">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-sm text-slate-300">
              <strong className="text-white">Nota:</strong> Questo è un profilo demo. 
              Configura Supabase Auth per abilitare la registrazione e il login reali.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
