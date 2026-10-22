"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { CardSkeleton, EmptyState } from "@/components/ui/StatusStates";
import { calculateLevel, formatNumber } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  ACHIEVEMENTS,
  AVATARS,
  achievementProgress,
  deriveStats,
  formatAccuracy,
  getAvatar,
  isAvatarUnlocked,
  levelTitle,
  modeLabel,
} from "@/lib/game/progression";
import { getDailyMissions, getWeeklyMissions, evaluateMissions } from "@/lib/game/missions";
import {
  fetchMyHistory,
  fetchMyProgression,
  INITIAL_PLAYER_STATE,
  loadLocalPlayer,
  loadLocalSessions,
  progressionStatsOf,
  renamePlayer,
  sessionToStatInput,
  setAvatar,
  signOutAccount,
  syncAuthSession,
  updatePassword,
  updateSettings,
  type CloudProgression,
  type HistoryEntry,
  type LocalPlayerState,
} from "@/lib/services/player-store";

const inputClass =
  "w-full px-4 py-3 bg-[#02061a] border border-white/15 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#00d9a5] focus:ring-2 focus:ring-[#00d9a5]/20";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<LocalPlayerState>(INITIAL_PLAYER_STATE);
  const [usernameInput, setUsernameInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState<CloudProgression | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historySource, setHistorySource] = useState<"cloud" | "local">("local");
  const [onlyMultiplayer, setOnlyMultiplayer] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    const local = loadLocalPlayer();
    setProfile(local);
    setUsernameInput(local.username);
    let cancelled = false;
    void (async () => {
      const synced = await syncAuthSession();
      if (cancelled) return;
      setProfile(synced);
      setUsernameInput(synced.username);
      const [progression, historyRes] = await Promise.all([
        fetchMyProgression(),
        fetchMyHistory(20),
      ]);
      if (cancelled) return;
      if (progression) {
        setCloud(progression);
        setProfile(progression.profile);
        setUsernameInput(progression.profile.username);
      }
      setHistory(historyRes.entries);
      setHistorySource(historyRes.source);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const levelInfo = calculateLevel(profile.xp);
  const avatar = getAvatar(profile.avatarId);
  const hasEmailAccount = Boolean(profile.authUserId && profile.email);
  const hasGuestSession = Boolean(profile.authUserId && !profile.email);

  const stats = useMemo(() => progressionStatsOf(profile), [profile]);
  // Lo storico vive fuori da React (localStorage): il contatore partite è
  // il segnale di invalidazione corretto per ricalcolare le derivate.
  const sessionsVersion = profile.gamesPlayed;
  const localDerived = useMemo(() => {
    void sessionsVersion;
    return deriveStats(loadLocalSessions().map(sessionToStatInput));
  }, [sessionsVersion]);

  const accuracy =
    profile.totalRounds > 0 ? profile.totalCorrect / profile.totalRounds : localDerived.accuracy;
  const averageScore =
    profile.gamesPlayed > 0 ? Math.round(profile.totalScore / profile.gamesPlayed) : null;

  const modeRows = useMemo(() => {
    if (cloud && cloud.modeStats.length > 0) {
      return cloud.modeStats.map((m) => ({
        mode: m.mode,
        games: m.games,
        wins: m.wins,
        accuracy: m.rounds > 0 ? m.correct / m.rounds : null,
        averageScore: m.games > 0 ? Math.round(m.totalScore / m.games) : null,
        bestScore: m.bestScore,
      }));
    }
    return localDerived.byMode.map((m) => ({
      mode: m.mode,
      games: m.games,
      wins: m.wins,
      accuracy: m.accuracy,
      averageScore: m.averageScore,
      bestScore: m.bestScore,
    }));
  }, [cloud, localDerived]);

  const unlockedAtById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of cloud?.achievements ?? []) map.set(a.id, a.unlockedAt);
    return map;
  }, [cloud]);

  const visibleHistory = onlyMultiplayer ? history.filter((h) => h.isMultiplayer) : history;

  const flash = (message: string, isError = false) => {
    setStatusMessage(isError ? "" : message);
    setErrorMessage(isError ? message : "");
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await renamePlayer(usernameInput);
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? "Nome non valido.", true);
      return;
    }
    setProfile(res.player);
    flash("Nome giocatore aggiornato!");
  };

  const handleAvatar = async (avatarId: string) => {
    setBusy(true);
    const res = await setAvatar(avatarId);
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? "Avatar non disponibile.", true);
      return;
    }
    setProfile(res.player);
    flash(
      res.error ??
        (res.synced
          ? "Avatar aggiornato e sincronizzato nel cloud."
          : "Avatar aggiornato su questo dispositivo.")
    );
  };

  const handleSettings = async (patch: Partial<LocalPlayerState["settings"]>) => {
    const res = await updateSettings(patch);
    setProfile(res.player);
    flash(
      res.synced
        ? "Impostazioni salvate e sincronizzate nel cloud."
        : "Impostazioni salvate su questo dispositivo."
    );
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await updatePassword(newPassword);
    setBusy(false);
    if (!res.ok) {
      flash(res.error ?? "Cambio password non riuscito.", true);
      return;
    }
    setNewPassword("");
    flash("Password aggiornata correttamente.");
  };

  const handleLogout = async () => {
    const updated = await signOutAccount();
    setProfile(updated);
    setCloud(null);
    flash("Sessione disconnessa. Continui a giocare con il profilo locale di questo dispositivo.");
  };

  const statCards = [
    { label: "Punti Totali", value: formatNumber(profile.totalScore), color: "gradient-text" },
    { label: "Partite Giocate", value: formatNumber(profile.gamesPlayed), color: "text-blue-400" },
    { label: "Vittorie", value: formatNumber(profile.gamesWon), color: "text-amber-400" },
    {
      label: "Colpi entro 100 km",
      value: formatNumber(profile.bullseyes),
      color: "text-purple-400",
    },
    { label: "Accuratezza", value: formatAccuracy(accuracy), color: "text-cyan-300" },
    {
      label: "Punteggio medio",
      value: averageScore !== null ? formatNumber(averageScore) : "—",
      color: "text-emerald-400",
    },
    {
      label: "Record in una partita",
      value: profile.bestScore > 0 ? formatNumber(profile.bestScore) : "—",
      color: "text-rose-400",
    },
    {
      label: "Serie giornaliera",
      value: profile.dailyStreak > 0 ? `🔥 ${profile.dailyStreak}` : "—",
      color: "text-orange-400",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header profilo premium */}
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#16244d]/90 to-[#0f1a33]/95 backdrop-blur-xl p-6 md:p-8">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-emerald-400/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-400/10 rounded-full blur-3xl" />
        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <div
            className="w-24 h-24 rounded-[1.5rem] bg-gradient-to-br from-[#00d9a5] to-[#0ea5e9] flex items-center justify-center text-5xl shrink-0 shadow-[0_12px_32px_rgba(0,217,165,0.25)] border-2 border-white/20"
            role="img"
            aria-label={`Avatar: ${avatar.label}`}
          >
            {avatar.emoji}
          </div>
          <div className="text-center md:text-left flex-1 space-y-2">
            <h1 className="text-3xl font-black tracking-tighter text-white">{profile.username}</h1>
            <p className="text-sm text-white/60">
              {hasEmailAccount
                ? `☁️ Account cloud collegato (${profile.email})`
                : hasGuestSession
                  ? "👾 Sessione ospite online: collega un'email per ritrovare i progressi"
                  : "💾 Profilo locale: i progressi sono salvati solo su questo dispositivo"}
            </p>
            <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start">
              <span className="px-3 py-1 rounded-full bg-white text-[#0a1433] text-xs font-black">
                Lv {levelInfo.level} • {levelTitle(levelInfo.level)}
              </span>
              <span className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/80">
                {formatNumber(profile.xp)} XP
              </span>
              {profile.longestDailyStreak > 0 && (
                <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/20 text-xs font-semibold text-amber-300">
                  🔥 Miglior streak {profile.longestDailyStreak} giorni
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/play">
              <Button size="sm">Gioca ora</Button>
            </Link>
            {(hasEmailAccount || hasGuestSession) && (
              <Button variant="secondary" size="sm" onClick={() => void handleLogout()}>
                Esci
              </Button>
            )}
          </div>
        </div>
      </div>

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

      {loading && (
        <div className="grid sm:grid-cols-2 gap-4" aria-label="Caricamento dati del profilo">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {/* Nickname */}
      <Card>
        <form
          onSubmit={(e) => void handleRename(e)}
          className="flex flex-col sm:flex-row gap-3 sm:items-end"
        >
          <div className="flex-1">
            <label
              htmlFor="profile-username"
              className="block text-sm font-medium text-slate-200 mb-2"
            >
              Nome in classifica e multiplayer
            </label>
            <input
              id="profile-username"
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              maxLength={20}
              className={inputClass}
            />
            <p className="text-xs text-slate-400 mt-1">
              Pubblico e univoco per gli account cloud. La tua email non è mai visibile agli altri.
            </p>
          </div>
          <Button type="submit" variant="secondary" isLoading={busy}>
            Salva nome
          </Button>
        </form>
      </Card>

      {/* Avatar cosmetici */}
      <Card className="space-y-4">
        <CardHeader
          title="Avatar"
          description="Ricompense puramente cosmetiche: alcuni avatar si sbloccano salendo di livello"
          icon={<span className="text-2xl">🎨</span>}
        />
        <div
          className="grid grid-cols-4 sm:grid-cols-8 gap-2"
          role="group"
          aria-label="Scegli avatar"
        >
          {AVATARS.map((item) => {
            const unlocked = isAvatarUnlocked(item.id, levelInfo.level);
            const selected = profile.avatarId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!unlocked || busy}
                aria-pressed={selected}
                aria-label={
                  unlocked
                    ? `Avatar ${item.label}${selected ? " (selezionato)" : ""}`
                    : `Avatar ${item.label}, bloccato fino al livello ${item.unlockLevel}`
                }
                title={unlocked ? item.label : `${item.label} · livello ${item.unlockLevel}`}
                onClick={() => void handleAvatar(item.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-3xl transition-colors ${
                  selected
                    ? "border-emerald-400 bg-emerald-500/15"
                    : unlocked
                      ? "border-slate-700 bg-slate-800/60 hover:border-emerald-500/60"
                      : "border-slate-800 bg-slate-900/60 opacity-50 cursor-not-allowed"
                }`}
              >
                <span aria-hidden="true">{item.emoji}</span>
                <span className="text-[10px] text-slate-300">
                  {unlocked ? item.label : `🔒 Lv ${item.unlockLevel}`}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Progresso livello */}
      <Card>
        <ProgressBar
          value={levelInfo.progress}
          label={`Progresso verso il livello ${levelInfo.level + 1}`}
          color="emerald"
        />
        <p className="text-xs text-slate-400 mt-2">
          {formatNumber(levelInfo.currentXp)} / {formatNumber(levelInfo.xpForNextLevel)} XP · Gli XP
          arrivano da partite e obiettivi secondo regole fisse (vedi «Obiettivi» qui sotto).
        </p>
      </Card>

      {/* Missioni giornaliere e settimanali */}
      <MissionsSection />

      {/* Statistiche personali e record */}
      <section aria-label="Statistiche personali" className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="text-center !p-4 bg-white/[0.04] border-white/10">
            <div className={`text-2xl sm:text-3xl font-black mb-1 ${stat.color}`}>{stat.value}</div>
            <p className="text-sm text-white/60">{stat.label}</p>
          </Card>
        ))}
      </section>
      <p className="-mt-4 text-xs text-slate-400">
        Accuratezza = round buoni ÷ round giocati. «—» significa che il dato non esiste ancora
        (nessuna partita), non uno zero inventato.
      </p>

      {/* Statistiche per modalità */}
      <Card className="space-y-4">
        <CardHeader
          title="Statistiche per modalità"
          description={
            cloud
              ? "Aggregate dal server sul tuo account"
              : "Calcolate dallo storico su questo dispositivo"
          }
          icon={<span className="text-2xl">📊</span>}
        />
        {modeRows.length === 0 ? (
          <EmptyState
            title="Nessuna partita registrata"
            message="Completa una partita per vedere qui le statistiche per modalità."
            action={
              <Link href="/play">
                <Button size="sm">Gioca la prima partita</Button>
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-slate-300 border-b border-slate-700">
                  <th scope="col" className="py-2 pr-3">
                    Modalità
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Partite
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Vittorie
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Accuratezza
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    Media punti
                  </th>
                  <th scope="col" className="py-2">
                    Record
                  </th>
                </tr>
              </thead>
              <tbody>
                {modeRows.map((row) => (
                  <tr key={row.mode} className="border-b border-slate-800 text-slate-200">
                    <th scope="row" className="py-2 pr-3 font-semibold text-white text-left">
                      {modeLabel(row.mode)}
                    </th>
                    <td className="py-2 pr-3">{row.games}</td>
                    <td className="py-2 pr-3">{row.wins}</td>
                    <td className="py-2 pr-3">{formatAccuracy(row.accuracy)}</td>
                    <td className="py-2 pr-3">
                      {row.averageScore !== null ? formatNumber(row.averageScore) : "—"}
                    </td>
                    <td className="py-2">
                      {row.bestScore > 0 ? formatNumber(row.bestScore) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Obiettivi */}
      <Card className="space-y-4">
        <CardHeader
          title="Obiettivi"
          description="Gli XP obiettivo sono accreditati una sola volta: sul cloud li assegna il server, verificando le tue statistiche"
          icon={<span className="text-2xl">🏆</span>}
        />
        <div className="space-y-3">
          {ACHIEVEMENTS.map((achievement) => {
            const completed = profile.unlockedAchievements.includes(achievement.id);
            const progress = achievementProgress(achievement, stats);
            const unlockedAt = unlockedAtById.get(achievement.id);
            return (
              <div
                key={achievement.id}
                className={`flex items-center gap-4 p-3 rounded-xl ${
                  completed
                    ? "bg-emerald-500/10 border border-emerald-500/20"
                    : "bg-slate-800/50 border border-slate-700"
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center text-xl shrink-0 ${
                    completed ? "bg-emerald-500/20" : "bg-slate-700"
                  }`}
                  aria-hidden="true"
                >
                  {completed ? achievement.icon : "🔒"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold ${completed ? "text-white" : "text-slate-200"}`}>
                    {achievement.title}
                  </p>
                  <p className="text-xs text-slate-400">{achievement.description}</p>
                  {!completed && (
                    <div className="mt-2 max-w-xs">
                      <ProgressBar value={progress * 100} size="sm" color="blue" />
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 mt-1">
                    {completed
                      ? `Sbloccato${unlockedAt ? ` il ${formatDate(unlockedAt)}` : ""} · +${achievement.xp} XP già accreditati`
                      : `${formatNumber(Math.min(stats[achievement.metric], achievement.threshold))} / ${formatNumber(achievement.threshold)}`}
                  </p>
                </div>
                <p
                  className={`text-sm font-bold shrink-0 ${completed ? "text-emerald-300" : "text-slate-400"}`}
                >
                  +{achievement.xp} XP
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Storico partite */}
      <Card className="space-y-4">
        <CardHeader
          title="Storico partite"
          description={
            historySource === "cloud"
              ? "Ultime partite registrate sul tuo account (includono il multiplayer)"
              : "Ultime partite salvate su questo dispositivo"
          }
          icon={<span className="text-2xl">🕘</span>}
        />
        <div className="flex gap-2" role="group" aria-label="Filtro storico">
          <Button
            size="sm"
            variant={!onlyMultiplayer ? "primary" : "secondary"}
            onClick={() => setOnlyMultiplayer(false)}
            aria-pressed={!onlyMultiplayer}
          >
            Tutte
          </Button>
          <Button
            size="sm"
            variant={onlyMultiplayer ? "primary" : "secondary"}
            onClick={() => setOnlyMultiplayer(true)}
            aria-pressed={onlyMultiplayer}
          >
            Solo multiplayer
          </Button>
        </div>
        {visibleHistory.length === 0 ? (
          <EmptyState
            title={
              onlyMultiplayer ? "Nessuna partita multiplayer" : "Nessuna partita nello storico"
            }
            message={
              onlyMultiplayer
                ? "Le partite online terminate compaiono qui automaticamente (richiede account/sessione cloud)."
                : "Completa una partita per vederla comparire qui."
            }
            action={
              <Link href={onlyMultiplayer ? "/multiplayer" : "/play"}>
                <Button size="sm">{onlyMultiplayer ? "Vai al multiplayer" : "Gioca ora"}</Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {visibleHistory.map((entry, index) => (
              <li
                key={`${entry.endedAt}-${index}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-white">{modeLabel(entry.mode)}</span>
                {entry.isMultiplayer && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    Online
                  </span>
                )}
                {entry.won && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Vittoria
                  </span>
                )}
                <span className="text-slate-300">{formatNumber(entry.score)} punti</span>
                <span className="text-slate-400">
                  {entry.correct}/{entry.rounds} round buoni
                </span>
                {entry.xpEarned !== null && (
                  <span className="text-emerald-300">+{formatNumber(entry.xpEarned)} XP</span>
                )}
                <span className="text-slate-400 ml-auto">{formatDate(entry.endedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Impostazioni utente */}
      <Card className="space-y-4">
        <CardHeader
          title="Impostazioni"
          description="Salvate sul dispositivo e, con account cloud, sincronizzate tra dispositivi"
          icon={<span className="text-2xl">⚙️</span>}
        />
        <div className="space-y-3">
          <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.settings.reduceMotion}
              onChange={(e) => void handleSettings({ reduceMotion: e.target.checked })}
              className="mt-1 h-5 w-5 accent-emerald-500"
            />
            <span>
              <span className="block font-semibold text-white">Riduci animazioni</span>
              <span className="block text-sm text-slate-300">
                Disattiva animazioni decorative e rotazione automatica del globo (si somma alla
                preferenza di sistema <em>prefers-reduced-motion</em>).
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={profile.settings.globeAutoRotate}
              onChange={(e) => void handleSettings({ globeAutoRotate: e.target.checked })}
              className="mt-1 h-5 w-5 accent-emerald-500"
            />
            <span>
              <span className="block font-semibold text-white">Rotazione automatica del globo</span>
              <span className="block text-sm text-slate-300">
                Ruota lentamente il globo nella home. Disattivarla riduce anche il carico sulla GPU
                e sulla batteria.
              </span>
            </span>
          </label>
        </div>
      </Card>

      {/* Account cloud */}
      {hasEmailAccount ? (
        <Card className="space-y-4">
          <CardHeader
            title="Account e sicurezza"
            description={`Connesso come ${profile.email}`}
            icon={<span className="text-2xl">🛡️</span>}
          />
          <form
            onSubmit={(e) => void handleChangePassword(e)}
            className="flex flex-col sm:flex-row gap-3 sm:items-end"
          >
            <div className="flex-1">
              <label
                htmlFor="profile-new-password"
                className="block text-sm font-medium text-slate-200 mb-2"
              >
                Nuova password
              </label>
              <input
                id="profile-new-password"
                type="password"
                minLength={6}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Almeno 6 caratteri"
                className={inputClass}
              />
            </div>
            <Button type="submit" variant="secondary" isLoading={busy}>
              Cambia password
            </Button>
          </form>
          <p className="text-xs text-slate-400">
            Password dimenticata? Esci e usa «Password dimenticata» nella pagina di accesso per
            ricevere il link di recupero via email.
          </p>
        </Card>
      ) : (
        <Card className="space-y-4 !bg-gradient-to-br !from-white/[0.04] !to-transparent">
          <CardHeader
            title="Non hai ancora un account cloud"
            description={
              isSupabaseConfigured
                ? "Stai giocando come ospite: progressi solo su questo dispositivo"
                : "Su questo sito Supabase non è configurato: gioco e progressi restano locali"
            }
            icon={<span className="text-2xl">☁️</span>}
          />
          <p className="text-sm text-slate-300 leading-relaxed">
            Con un account gratuito ritrovi livello, XP, obiettivi, streak e impostazioni su ogni
            dispositivo, entri nella classifica globale verificata dal server e puoi creare la tua
            classifica amici.
          </p>
          {isSupabaseConfigured ? (
            <div className="flex flex-wrap gap-3">
              <Link href="/auth">
                <Button size="sm">Accedi o crea account</Button>
              </Link>
              <Link href="/play">
                <Button size="sm" variant="secondary">
                  Continua come ospite
                </Button>
              </Link>
            </div>
          ) : (
            <p role="status" className="text-sm text-amber-200">
              Registrazione non disponibile in questa installazione: nessuna azione finta viene
              proposta. Puoi giocare subito in locale.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function MissionsSection() {
  const [missions, setMissions] = useState<{
    daily: ReturnType<typeof getDailyMissions>;
    weekly: ReturnType<typeof getWeeklyMissions>;
  }>({
    daily: [],
    weekly: [],
  });
  const [progress, setProgress] = useState<ReturnType<typeof evaluateMissions>>([]);
  const [weeklyProgress, setWeeklyProgress] = useState<ReturnType<typeof evaluateMissions>>([]);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    const daily = getDailyMissions();
    const weekly = getWeeklyMissions();
    setMissions({ daily, weekly });
    try {
      const sessions = loadLocalSessions().map(sessionToStatInput);
      const todayStr = new Date().toISOString().slice(0, 10);
      const todaySessions = sessions.filter((s) => s.endedAt.slice(0, 10) === todayStr);
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      const weekStr = weekStart.toISOString().slice(0, 10);
      const weekSessions = sessions.filter((s) => s.endedAt.slice(0, 10) >= weekStr);
      setProgress(evaluateMissions(daily, todaySessions));
      setWeeklyProgress(evaluateMissions(weekly, weekSessions));
      setLoadError(false);
    } catch {
      // Storage non leggibile/corrotto: dichiararlo invece di mostrare
      // missioni a zero come se fossero dati reali.
      setLoadError(true);
    }
  }, []);
  if (missions.daily.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-white/40 px-1">
        Obiettivi di pratica calcolati sullo storico di questo dispositivo. Non assegnano XP: le
        ricompense ufficiali sono gli obiettivi di progressione, accreditati dal server.
      </p>
      {loadError && (
        <p role="alert" className="text-xs text-amber-300 px-1">
          Impossibile leggere lo storico locale: i progressi delle missioni potrebbero non essere
          aggiornati.
        </p>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
              📅
            </span>
            <h3 className="font-black text-white">Missioni giornaliere</h3>
            <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full bg-amber-500 text-[#1a1200]">
              OGGI
            </span>
          </div>
          <div className="space-y-2">
            {progress.map((m) => (
              <div key={m.def.id} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{m.def.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">{m.def.title}</div>
                    <div className="text-xs text-white/50">{m.def.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black text-white">
                      {m.current}/{m.def.target}
                    </div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all"
                    style={{ width: `${m.progress * 100}%` }}
                  />
                </div>
                {m.completed && (
                  <div className="mt-1 text-xs font-bold text-emerald-300">✅ Completata!</div>
                )}
              </div>
            ))}
          </div>
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
              🗓️
            </span>
            <h3 className="font-black text-white">Missioni settimanali</h3>
            <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full bg-violet-500 text-white">
              SETTIMANA
            </span>
          </div>
          <div className="space-y-2">
            {weeklyProgress.map((m) => (
              <div key={m.def.id} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{m.def.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white">{m.def.title}</div>
                    <div className="text-xs text-white/50">{m.def.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black text-white">
                      {m.current}/{m.def.target}
                    </div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-violet-400 to-purple-500 transition-all"
                    style={{ width: `${m.progress * 100}%` }}
                  />
                </div>
                {m.completed && (
                  <div className="mt-1 text-xs font-bold text-emerald-300">✅ Completata!</div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
