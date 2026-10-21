"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { calculateLevel, formatNumber } from "@/lib/utils";
import {
  INITIAL_PLAYER_STATE,
  loadLocalPlayer,
  renamePlayer,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  syncAuthSession,
  type LocalPlayerState,
} from "@/lib/services/player-store";

export default function ProfilePage() {
  const [profile, setProfile] = useState<LocalPlayerState>(INITIAL_PLAYER_STATE);
  const [usernameInput, setUsernameInput] = useState("");
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const local = loadLocalPlayer();
    setProfile(local);
    setUsernameInput(local.username);
    void syncAuthSession().then((synced) => {
      setProfile(synced);
      setUsernameInput(synced.username);
    });
  }, []);

  const levelInfo = calculateLevel(profile.xp);
  const isAuthenticated = Boolean(profile.authUserId || profile.email);

  const achievements = [
    {
      title: "Prima Partita",
      description: "Completa la tua prima partita",
      completed: profile.gamesPlayed >= 1,
      xp: 100,
    },
    {
      title: "Occhio di Falco",
      description: "Centra almeno un obiettivo entro 100 km",
      completed: profile.bullseyes >= 1,
      xp: 250,
    },
    {
      title: "Esploratore",
      description: "Gioca almeno 10 partite",
      completed: profile.gamesPlayed >= 10,
      xp: 500,
    },
    {
      title: "Cartografo",
      description: "Supera 25.000 punti complessivi",
      completed: profile.totalScore >= 25000,
      xp: 1000,
    },
  ];

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    const res = await renamePlayer(usernameInput);
    if (!res.ok) {
      setErrorMessage(res.error ?? "Nome non valido.");
      return;
    }
    setProfile(res.player);
    setStatusMessage("Nome giocatore aggiornato!");
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");

    const res =
      authTab === "signup"
        ? await signUpWithEmail(email, password, usernameInput)
        : await signInWithEmail(email, password);

    setBusy(false);
    if (!res.ok) {
      setErrorMessage(res.error ?? "Autenticazione non riuscita.");
      return;
    }
    setProfile(res.player);
    setUsernameInput(res.player.username);
    setPassword("");
    setStatusMessage(
      res.mode === "cloud"
        ? "Account collegato a Supabase! I tuoi progressi sono sincronizzati nel cloud."
        : "Profilo salvato sul dispositivo."
    );
  };

  const handleLogout = async () => {
    const updated = await signOutAccount();
    setProfile(updated);
    setStatusMessage("Sessione disconnessa. Continui a giocare con il profilo locale.");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header Profilo */}
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center text-5xl shrink-0">
          👤
        </div>
        <div className="text-center md:text-left flex-1 space-y-2">
          <h1 className="text-3xl font-bold text-white">{profile.username}</h1>
          <p className="text-sm text-slate-400">
            {isAuthenticated
              ? `☁️ Sincronizzato con Supabase (${profile.email})`
              : "Pronto per giocare subito · Salvataggio automatico attivo"}
          </p>
          <div className="flex items-center gap-4 justify-center md:justify-start">
            <span className="text-sm text-slate-400">
              Livello <span className="font-bold text-emerald-400">{levelInfo.level}</span>
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-sm text-slate-400">{formatNumber(profile.xp)} XP</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/play">
            <Button size="sm">Gioca ora</Button>
          </Link>
          {isAuthenticated && (
            <Button variant="secondary" size="sm" onClick={() => void handleLogout()}>
              Esci
            </Button>
          )}
        </div>
      </div>

      {/* Personalizza nickname */}
      <Card>
        <form
          onSubmit={(e) => void handleRename(e)}
          className="flex flex-col sm:flex-row gap-3 sm:items-end"
        >
          <div className="flex-1">
            <label
              htmlFor="profile-username"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Nome in classifica e multiplayer
            </label>
            <input
              id="profile-username"
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              maxLength={24}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <Button type="submit" variant="secondary">
            Salva nome
          </Button>
        </form>
        {statusMessage && <p className="text-xs text-emerald-400 mt-3">{statusMessage}</p>}
        {errorMessage && (
          <p role="alert" className="text-xs text-red-400 mt-3">
            {errorMessage}
          </p>
        )}
      </Card>

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
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="text-center">
          <div className="text-3xl font-bold gradient-text mb-1">
            {formatNumber(profile.totalScore)}
          </div>
          <p className="text-sm text-slate-400">Punti Totali</p>
        </Card>

        <Card className="text-center">
          <div className="text-3xl font-bold text-blue-400 mb-1">{profile.gamesPlayed}</div>
          <p className="text-sm text-slate-400">Partite Giocate</p>
        </Card>

        <Card className="text-center">
          <div className="text-3xl font-bold text-amber-400 mb-1">{profile.gamesWon}</div>
          <p className="text-sm text-slate-400">Vittorie</p>
        </Card>

        <Card className="text-center">
          <div className="text-3xl font-bold text-purple-400 mb-1">{profile.bullseyes}</div>
          <p className="text-sm text-slate-400">Colpi entro 100 km</p>
        </Card>
      </div>

      {/* Obiettivi */}
      <Card>
        <CardHeader
          title="Obiettivi"
          description="Completa le sfide giocando sul globo o in multiplayer"
          icon={<span className="text-2xl">🏆</span>}
        />
        <div className="space-y-3">
          {achievements.map((achievement) => (
            <div
              key={achievement.title}
              className={`flex items-center gap-4 p-3 rounded-xl ${
                achievement.completed
                  ? "bg-emerald-500/10 border border-emerald-500/20"
                  : "bg-slate-800/50 border border-slate-700"
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  achievement.completed
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-slate-700 text-slate-500"
                }`}
              >
                {achievement.completed ? "✓" : "🔒"}
              </div>
              <div className="flex-1">
                <p
                  className={`font-semibold ${
                    achievement.completed ? "text-white" : "text-slate-400"
                  }`}
                >
                  {achievement.title}
                </p>
                <p className="text-xs text-slate-500">{achievement.description}</p>
              </div>
              <div className="text-right">
                <p
                  className={`text-sm font-bold ${
                    achievement.completed ? "text-emerald-400" : "text-slate-500"
                  }`}
                >
                  +{achievement.xp} XP
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Account Cloud opzionale con Supabase Auth */}
      {!isAuthenticated && (
        <Card className="space-y-5">
          <CardHeader
            title="Salva su Account Cloud (Opzionale)"
            description="Collega un'email con Supabase Auth per ritrovare livello e statistiche su ogni dispositivo"
            icon={<span className="text-2xl">☁️</span>}
          />

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={authTab === "login" ? "primary" : "secondary"}
              onClick={() => setAuthTab("login")}
            >
              Accedi
            </Button>
            <Button
              type="button"
              size="sm"
              variant={authTab === "signup" ? "primary" : "secondary"}
              onClick={() => setAuthTab("signup")}
            >
              Crea Account
            </Button>
          </div>

          <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-300 mb-2">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@esempio.it"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Almeno 6 caratteri"
                className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "Attendere…" : authTab === "signup" ? "Crea Account e Sincronizza" : "Accedi"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
