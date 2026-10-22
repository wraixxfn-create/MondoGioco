"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  AUTH_NOT_CONFIGURED_MESSAGE,
  INITIAL_PLAYER_STATE,
  loadLocalPlayer,
  requestPasswordReset,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  syncAuthSession,
  type LocalPlayerState,
} from "@/lib/services/player-store";

type AuthTab = "login" | "signup" | "forgot";

const inputClass =
  "w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500";

export default function AuthPage() {
  const [profile, setProfile] = useState<LocalPlayerState>(INITIAL_PLAYER_STATE);
  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const local = loadLocalPlayer();
    setProfile(local);
    setUsername(local.username);
    void syncAuthSession().then((synced) => {
      setProfile(synced);
      if (!synced.email) setUsername(synced.username);
    });
  }, []);

  const isAuthenticated = Boolean(profile.authUserId && profile.email);

  const switchTab = (next: AuthTab) => {
    setTab(next);
    setStatusMessage("");
    setErrorMessage("");
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");

    const res =
      tab === "signup"
        ? await signUpWithEmail(email, password, username)
        : await signInWithEmail(email, password);

    setBusy(false);
    if (!res.ok) {
      setErrorMessage(res.error ?? "Autenticazione non riuscita.");
      return;
    }
    setPassword("");
    if (res.needsEmailConfirmation) {
      setStatusMessage(
        "Account creato: controlla la tua email e apri il link di conferma, poi torna qui per accedere. Nel frattempo puoi giocare in locale."
      );
      return;
    }
    setProfile(res.player);
    setStatusMessage(
      tab === "signup"
        ? "Account creato e collegato! Progressi, obiettivi e classifiche ora si sincronizzano nel cloud."
        : "Accesso riuscito! I tuoi progressi cloud sono stati caricati."
    );
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    const res = await requestPasswordReset(email);
    setBusy(false);
    if (!res.ok) {
      setErrorMessage(res.error ?? "Invio non riuscito.");
      return;
    }
    // Messaggio unico, indipendente dall'esistenza dell'account (privacy).
    setStatusMessage(
      "Se esiste un account con questa email, riceverai a breve un link per reimpostare la password. Controlla anche la cartella spam."
    );
  };

  const handleLogout = async () => {
    const updated = await signOutAccount();
    setProfile(updated);
    setStatusMessage(
      "Sessione disconnessa. Continui a giocare con il profilo locale di questo dispositivo."
    );
  };

  if (isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <Card className="space-y-4 text-center">
          <div className="text-5xl" aria-hidden="true">
            ☁️
          </div>
          <h1 className="text-2xl font-bold text-white">Sei connesso come {profile.username}</h1>
          <p className="text-sm text-slate-300">
            Account: {profile.email}. Statistiche, XP, obiettivi e impostazioni si sincronizzano con
            Supabase a ogni partita.
          </p>
          {statusMessage && (
            <p role="status" className="text-sm text-emerald-300">
              {statusMessage}
            </p>
          )}
          <div className="flex flex-wrap gap-3 justify-center pt-2">
            <Link href="/profile">
              <Button size="sm">Vai al profilo</Button>
            </Link>
            <Link href="/play">
              <Button size="sm" variant="secondary">
                Gioca ora
              </Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={() => void handleLogout()}>
              Esci
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-white">Il tuo account</h1>
        <p className="text-slate-300">
          Con un account cloud ritrovi livello, statistiche, obiettivi e impostazioni su ogni
          dispositivo. Senza account giochi subito, con i progressi salvati solo qui.
        </p>
      </div>

      {!isSupabaseConfigured && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <p role="status" className="text-sm text-amber-200">
            ⚠️ {AUTH_NOT_CONFIGURED_MESSAGE} I moduli qui sotto sono disabilitati: nessuna finta
            registrazione viene salvata come account.
          </p>
          <div className="pt-3">
            <Link href="/play">
              <Button size="sm">Gioca in locale</Button>
            </Link>
          </div>
        </Card>
      )}

      <Card className="space-y-5">
        <CardHeader
          title={
            tab === "forgot" ? "Recupera password" : tab === "signup" ? "Crea account" : "Accedi"
          }
          description={
            tab === "forgot"
              ? "Ti inviamo un link sicuro per scegliere una nuova password"
              : "Autenticazione gestita da Supabase Auth"
          }
          icon={<span className="text-2xl">🔐</span>}
        />

        <div className="flex flex-wrap gap-2" role="group" aria-label="Scegli operazione">
          <Button
            size="sm"
            variant={tab === "login" ? "primary" : "secondary"}
            onClick={() => switchTab("login")}
            aria-pressed={tab === "login"}
          >
            Accedi
          </Button>
          <Button
            size="sm"
            variant={tab === "signup" ? "primary" : "secondary"}
            onClick={() => switchTab("signup")}
            aria-pressed={tab === "signup"}
          >
            Crea account
          </Button>
          <Button
            size="sm"
            variant={tab === "forgot" ? "primary" : "secondary"}
            onClick={() => switchTab("forgot")}
            aria-pressed={tab === "forgot"}
          >
            Password dimenticata
          </Button>
        </div>

        {tab === "forgot" ? (
          <form onSubmit={(e) => void handleForgotSubmit(e)} className="space-y-4">
            <div>
              <label
                htmlFor="forgot-email"
                className="block text-sm font-medium text-slate-200 mb-2"
              >
                Email dell&apos;account
              </label>
              <input
                id="forgot-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@esempio.it"
                className={inputClass}
                disabled={!isSupabaseConfigured}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              isLoading={busy}
              disabled={!isSupabaseConfigured}
            >
              Invia link di recupero
            </Button>
          </form>
        ) : (
          <form onSubmit={(e) => void handleAuthSubmit(e)} className="space-y-4">
            {tab === "signup" && (
              <div>
                <label
                  htmlFor="auth-username"
                  className="block text-sm font-medium text-slate-200 mb-2"
                >
                  Nickname pubblico
                </label>
                <input
                  id="auth-username"
                  type="text"
                  required
                  maxLength={20}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Es. CapitanoNemo"
                  className={inputClass}
                  disabled={!isSupabaseConfigured}
                />
                <p className="text-xs text-slate-400 mt-1">
                  È il nome visibile in classifiche e multiplayer. La tua email non viene mai
                  mostrata.
                </p>
              </div>
            )}
            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-200 mb-2">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@esempio.it"
                className={inputClass}
                disabled={!isSupabaseConfigured}
              />
            </div>
            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-slate-200 mb-2"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={tab === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Almeno 6 caratteri"
                className={inputClass}
                disabled={!isSupabaseConfigured}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              isLoading={busy}
              disabled={!isSupabaseConfigured}
            >
              {tab === "signup" ? "Crea account e sincronizza" : "Accedi"}
            </Button>
            {tab === "login" && (
              <button
                type="button"
                onClick={() => switchTab("forgot")}
                className="text-sm text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
              >
                Password dimenticata?
              </button>
            )}
          </form>
        )}

        {statusMessage && (
          <p role="status" className="text-sm text-emerald-300">
            {statusMessage}
          </p>
        )}
        {errorMessage && (
          <p role="alert" className="text-sm text-red-300">
            {errorMessage}
          </p>
        )}

        <p className="text-xs text-slate-400 leading-relaxed">
          Puoi sempre giocare senza account: in quel caso statistiche e progressi restano solo su
          questo dispositivo e la classifica amici non è disponibile.
        </p>
      </Card>
    </div>
  );
}
