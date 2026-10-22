"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Pill } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CardSkeleton, EmptyState, ErrorState } from "@/components/ui/StatusStates";
import { formatNumber } from "@/lib/utils";
import { getAvatar, levelTitle, modeLabel } from "@/lib/game/progression";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  addFriendByUsername,
  fetchFriends,
  fetchLeaderboard,
  fetchMyHistory,
  INITIAL_LEADERBOARD_ROWS,
  INITIAL_PLAYER_STATE,
  loadLocalPlayer,
  removeFriend,
  type FriendInfo,
  type HistoryEntry,
  type LeaderboardRow,
  type LocalPlayerState,
  type LeaderboardScope,
  type LeaderboardSource,
  type TimeRange,
} from "@/lib/services/player-store";

export default function LeaderboardPage() {
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [entries, setEntries] = useState<LeaderboardRow[]>(INITIAL_LEADERBOARD_ROWS);
  const [source, setSource] = useState<LeaderboardSource>("local");
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [friends, setFriends] = useState<FriendInfo[]>([]);
  const [friendInput, setFriendInput] = useState("");
  const [friendStatus, setFriendStatus] = useState("");
  const [friendError, setFriendError] = useState("");
  const [multiplayerHistory, setMultiplayerHistory] = useState<HistoryEntry[]>([]);
  const [me, setMe] = useState<LocalPlayerState>(INITIAL_PLAYER_STATE);

  const loadData = useCallback(async (range: TimeRange, currentScope: LeaderboardScope) => {
    setLoading(true);
    setMe(loadLocalPlayer());
    setLoadError("");
    try {
      const res = await fetchLeaderboard(range, currentScope);
      setEntries(res.entries);
      setSource(res.source);
      setNotice(res.notice);
    } catch {
      setLoadError("Impossibile caricare la classifica. Controlla la connessione e riprova.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(timeRange, scope);
  }, [timeRange, scope, loadData]);

  useEffect(() => {
    void (async () => {
      const [friendsRes, historyRes] = await Promise.all([fetchFriends(), fetchMyHistory(5, true)]);
      setFriends(friendsRes.friends);
      setMultiplayerHistory(historyRes.entries);
    })();
  }, []);

  const meInList = entries.some((e) => e.isCurrentPlayer);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const getRankStyle = (rank: number, isMe: boolean) => {
    if (isMe) return "bg-gradient-to-r from-emerald-500/15 to-teal-500/10 border-emerald-500/30 shadow-[0_8px_24px_rgba(0,217,165,0.15)]";
    if (rank === 1) return "bg-gradient-to-r from-amber-400/15 to-yellow-500/10 border-amber-400/30";
    if (rank === 2) return "bg-gradient-to-r from-slate-400/15 to-slate-500/10 border-white/15";
    if (rank === 3) return "bg-gradient-to-r from-orange-500/15 to-amber-600/10 border-orange-500/30";
    return "bg-white/[0.04] border-white/10";
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFriendStatus("");
    setFriendError("");
    const res = await addFriendByUsername(friendInput);
    if (!res.ok) {
      setFriendError(res.error ?? "Amico non aggiunto.");
      return;
    }
    setFriendInput("");
    setFriendStatus(
      res.alreadyFriends
        ? `${res.friend?.username ?? "Questo giocatore"} è già tra i tuoi amici.`
        : `${res.friend?.username ?? "Giocatore"} aggiunto ai tuoi amici.`
    );
    const friendsRes = await fetchFriends();
    setFriends(friendsRes.friends);
    void loadData(timeRange, scope);
  };

  const handleRemoveFriend = async (friend: FriendInfo) => {
    const res = await removeFriend(friend.userId);
    if (!res.ok) {
      setFriendError(res.error ?? "Rimozione non riuscita.");
      return;
    }
    setFriends((prev) => prev.filter((f) => f.userId !== friend.userId));
    setFriendStatus(`${friend.username} rimosso dai tuoi amici.`);
    void loadData(timeRange, scope);
  };

  const sourceLabel =
    source === "cloud"
      ? "☁️ Cloud verificato"
      : source === "local"
        ? "💾 Solo i tuoi dati locali"
        : "⏸️ Non disponibile";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#16244d]/80 to-[#0f1a33]/90 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-400/10 via-transparent to-emerald-400/10 pointer-events-none" />
        <div className="relative p-6 md:p-8 text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-[#0a1433] text-xs font-black tracking-widest">
            🏆 CLASSIFICHE PREMIUM
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white">I migliori esploratori</h1>
          <p className="text-white/60">Scala la vetta con abilità pura — nessun bot, nessun punteggio inventato.</p>
          <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
            <span className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-white/80 backdrop-blur-sm">
              <span className={`w-2 h-2 rounded-full ${source === "cloud" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              {sourceLabel}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void loadData(timeRange, scope)} disabled={loading}>
              {loading ? "Aggiornamento…" : "🔄 Aggiorna"}
            </Button>
          </div>
          <p className="text-xs text-white/40 max-w-xl mx-auto leading-relaxed">
            A pari punti la posizione è condivisa; a parità ordina chi ha giocato meno. I nuovi giocatori compaiono dopo la prima partita.
          </p>
        </div>
      </div>

      <div className="flex justify-center gap-2 flex-wrap p-1 rounded-2xl bg-white/[0.04] border border-white/10 w-fit mx-auto">
        <button
          onClick={() => setScope("global")}
          aria-pressed={scope === "global"}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${scope === "global" ? "bg-white text-[#0a1433] shadow-md" : "text-white/60 hover:text-white hover:bg-white/10"}`}
        >
          🌍 Globale
        </button>
        <button
          onClick={() => setScope("friends")}
          aria-pressed={scope === "friends"}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${scope === "friends" ? "bg-white text-[#0a1433] shadow-md" : "text-white/60 hover:text-white hover:bg-white/10"}`}
        >
          👥 Amici
        </button>
      </div>

      <div className="flex justify-center gap-2 flex-wrap">
        {[
          { id: "week", label: "Settimana" },
          { id: "month", label: "Mese" },
          { id: "all", label: "Sempre" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTimeRange(t.id as TimeRange)}
            aria-pressed={timeRange === t.id}
            className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${timeRange === t.id ? "bg-white text-[#0a1433] border-white" : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {scope === "friends" && (
        <Card className="space-y-4">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-sm">👥</span>
            I tuoi amici
          </h2>
          {!isSupabaseConfigured ? (
            <p role="status" className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
              Gli amici richiedono il cloud, ma Supabase non è configurato su questo sito: nessun elenco finto viene mostrato.
            </p>
          ) : (
            <>
              <form onSubmit={(e) => void handleAddFriend(e)} className="flex flex-col sm:flex-row gap-3">
                <input
                  id="friend-username"
                  type="text"
                  value={friendInput}
                  onChange={(e) => setFriendInput(e.target.value)}
                  placeholder="Nickname esatto dell'amico"
                  maxLength={20}
                  className="flex-1 px-4 py-3 bg-[#02061a] border border-white/15 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-[#00d9a5] focus:ring-2 focus:ring-[#00d9a5]/20"
                />
                <Button type="submit" variant="secondary">
                  Aggiungi
                </Button>
              </form>
              {friendStatus && <p role="status" className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2">{friendStatus}</p>}
              {friendError && <p role="alert" className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2">{friendError}</p>}
              {friends.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {friends.map((friend) => (
                    <li
                      key={friend.userId}
                      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 pl-3 pr-1.5 py-1.5 text-sm text-white backdrop-blur-sm"
                    >
                      <span>{getAvatar(friend.avatarId).emoji}</span>
                      {friend.username}
                      <button
                        type="button"
                        onClick={() => void handleRemoveFriend(friend)}
                        aria-label={`Rimuovi ${friend.username} dagli amici`}
                        className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/15 transition-colors"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      )}

      {loading && entries.length === 0 ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : loadError ? (
        <Card>
          <ErrorState message={loadError} onRetry={() => void loadData(timeRange, scope)} />
        </Card>
      ) : source === "unavailable" ? (
        <Card>
          <EmptyState
            title="Classifica amici non disponibile"
            message={notice ?? "Questa classifica richiede un account cloud."}
            action={
              <Link href="/auth">
                <Button size="sm">Accedi o crea account</Button>
              </Link>
            }
          />
        </Card>
      ) : entries.length === 0 ? (
        <Card>
          <EmptyState
            title="Nessuna partita registrata"
            message={
              source === "local"
                ? "Sul dispositivo non risultano partite in questo intervallo. La classifica locale non contiene giocatori inventati: gioca una partita per inaugurarla."
                : "Nessuna partita registrata in questo intervallo temporale."
            }
            action={
              <Link href="/play">
                <Button size="sm">Gioca per inaugurare il podio</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {entries.length >= 3 && (
            <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto">
              {[entries[1], entries[0], entries[2]].map((entry, i) => (
                <Card
                  key={entry.playerId}
                  className={`text-center !p-4 ${getRankStyle(entry.rank, entry.isCurrentPlayer)} ${i === 1 ? "sm:-mt-3 sm:scale-105" : "sm:mt-2"}`}
                >
                  <div className="text-3xl mb-1">{getRankBadge(entry.rank)}</div>
                  <p className="text-2xl">{getAvatar(entry.avatarId).emoji}</p>
                  <p className="text-sm font-black text-white truncate mt-1">{entry.username}</p>
                  <p className="text-xs text-white/60">{formatNumber(entry.totalScore)} pt</p>
                  <Pill tone={i === 1 ? "warning" : "neutral"} size="sm">
                    #{entry.rank}
                  </Pill>
                </Card>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {entries.map((entry) => (
              <Card key={entry.playerId} className={`!p-4 !rounded-2xl ${getRankStyle(entry.rank, entry.isCurrentPlayer)}`}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center font-black text-white shrink-0">
                    {getRankBadge(entry.rank)}
                  </div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/10 to-transparent border border-white/10 flex items-center justify-center text-xl shrink-0">
                    {getAvatar(entry.avatarId).emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-white truncate">{entry.username}</p>
                      {entry.isCurrentPlayer && <span className="text-[10px] font-black px-2 py-1 rounded-full bg-emerald-500 text-white">TU</span>}
                    </div>
                    <p className="text-xs text-white/50">
                      Livello {entry.level} • {levelTitle(entry.level)} • {entry.gamesPlayed} partite
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-black text-white">{formatNumber(entry.totalScore)}</p>
                    <p className="text-[11px] font-bold tracking-widest uppercase text-white/40">punti</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {!meInList && me.gamesPlayed > 0 && (
            <Card className="!p-4 border-dashed border-white/20 bg-white/5">
              <p className="text-sm text-white/70">
                <strong className="text-white">Tu:</strong> {formatNumber(me.totalScore)} punti in {me.gamesPlayed} partite su questo dispositivo.
                {source === "cloud" && !me.authUserId ? " Accedi per pubblicare il tuo punteggio." : " Non sei ancora tra le posizioni mostrate."}
              </p>
            </Card>
          )}
        </>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-black tracking-widest uppercase text-white/60">Ultime multiplayer</h2>
        {multiplayerHistory.length === 0 ? (
          <p className="text-sm text-white/50">
            Nessun risultato multiplayer registrato. Le partite online con account cloud compaiono qui e nello storico del{" "}
            <Link href="/profile" className="text-emerald-300 underline underline-offset-2 font-semibold">
              profilo
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {multiplayerHistory.map((entry, index) => (
              <li
                key={`${entry.endedAt}-${index}`}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
              >
                <span className="font-bold text-white">{modeLabel(entry.mode)}</span>
                {entry.won && <span className="px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/20 text-amber-300 text-xs font-bold">🏆 Vittoria</span>}
                <span className="text-white/80 font-semibold">{formatNumber(entry.score)} pt</span>
                <span className="text-white/50">{entry.correct}/{entry.rounds} corrette</span>
                <span className="text-white/30 ml-auto text-xs">{new Date(entry.endedAt).toLocaleDateString("it-IT")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
