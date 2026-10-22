"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
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
    if (isMe) return "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-emerald-500/60";
    if (rank === 1)
      return "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/50";
    if (rank === 2) return "bg-gradient-to-r from-slate-400/20 to-slate-500/20 border-slate-400/50";
    if (rank === 3)
      return "bg-gradient-to-r from-amber-700/20 to-orange-700/20 border-amber-700/50";
    return "bg-slate-900/60 border-slate-800";
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
      ? "☁️ Dati cloud verificati dal server"
      : source === "local"
        ? "💾 Solo i tuoi dati su questo dispositivo (nessun altro giocatore inventato)"
        : "⏸️ Classifica non disponibile in questo stato";

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-white">Classifica</h1>
        <p className="text-slate-300">I migliori esploratori di MondoGioco</p>
        <div className="flex items-center justify-center gap-3 pt-1 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-slate-200">
            <span
              className={`w-2 h-2 rounded-full ${source === "cloud" ? "bg-emerald-400" : "bg-amber-400"}`}
            />
            {sourceLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadData(timeRange, scope)}
            disabled={loading}
          >
            {loading ? "Aggiornamento…" : "🔄 Aggiorna"}
          </Button>
        </div>
        <p className="text-xs text-slate-400 max-w-xl mx-auto">
          A pari punti la posizione è condivisa; a parità ordina chi ha giocato meno partite. I
          nuovi giocatori compaiono dopo la prima partita registrata. Non vengono mai mostrati email
          o dati privati.
        </p>
      </div>

      {/* Ambito */}
      <div
        className="flex justify-center gap-3 flex-wrap"
        role="group"
        aria-label="Ambito classifica"
      >
        <Button
          variant={scope === "global" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setScope("global")}
          aria-pressed={scope === "global"}
        >
          🌍 Globale
        </Button>
        <Button
          variant={scope === "friends" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setScope("friends")}
          aria-pressed={scope === "friends"}
        >
          👥 Amici
        </Button>
      </div>

      {/* Filtri temporali */}
      <div
        className="flex justify-center gap-3 flex-wrap"
        role="group"
        aria-label="Intervallo temporale"
      >
        <Button
          variant={timeRange === "week" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setTimeRange("week")}
          aria-pressed={timeRange === "week"}
        >
          Questa Settimana
        </Button>
        <Button
          variant={timeRange === "month" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setTimeRange("month")}
          aria-pressed={timeRange === "month"}
        >
          Questo Mese
        </Button>
        <Button
          variant={timeRange === "all" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setTimeRange("all")}
          aria-pressed={timeRange === "all"}
        >
          Tutti i Tempi
        </Button>
      </div>

      {/* Gestione amici (solo ambito amici) */}
      {scope === "friends" && (
        <Card className="space-y-4">
          <h2 className="text-lg font-bold text-white">I tuoi amici</h2>
          {!isSupabaseConfigured ? (
            <p role="status" className="text-sm text-amber-200">
              Gli amici richiedono il cloud, ma Supabase non è configurato su questo sito: nessun
              elenco finto viene mostrato.
            </p>
          ) : (
            <>
              <form
                onSubmit={(e) => void handleAddFriend(e)}
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="flex-1">
                  <label htmlFor="friend-username" className="sr-only">
                    Nickname dell&apos;amico
                  </label>
                  <input
                    id="friend-username"
                    type="text"
                    value={friendInput}
                    onChange={(e) => setFriendInput(e.target.value)}
                    placeholder="Nickname esatto dell'amico"
                    maxLength={20}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <Button type="submit" variant="secondary">
                  Aggiungi amico
                </Button>
              </form>
              {friendStatus && (
                <p role="status" className="text-sm text-emerald-300">
                  {friendStatus}
                </p>
              )}
              {friendError && (
                <p role="alert" className="text-sm text-red-300">
                  {friendError}
                </p>
              )}
              {friends.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {friends.map((friend) => (
                    <li
                      key={friend.userId}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 pl-3 pr-1.5 py-1.5 text-sm text-slate-100"
                    >
                      <span aria-hidden="true">{getAvatar(friend.avatarId).emoji}</span>
                      {friend.username}
                      <button
                        type="button"
                        onClick={() => void handleRemoveFriend(friend)}
                        aria-label={`Rimuovi ${friend.username} dagli amici`}
                        className="rounded-full px-2 py-1 text-slate-300 hover:bg-slate-700 hover:text-white"
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

      {/* Contenuto classifica */}
      {loading && entries.length === 0 ? (
        <div className="space-y-3" aria-label="Caricamento classifica">
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
                <Button size="sm">Gioca una partita per inaugurare il podio</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <>
          {/* Podio */}
          {entries.length >= 3 && (
            <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto">
              {[entries[1], entries[0], entries[2]].map((entry, i) => (
                <Card
                  key={entry.playerId}
                  className={`text-center ${getRankStyle(entry.rank, entry.isCurrentPlayer)} ${i === 1 ? "sm:-mt-4" : ""}`}
                >
                  <div className="text-3xl sm:text-4xl mb-2" aria-hidden="true">
                    {getRankBadge(entry.rank)}
                  </div>
                  <p className="text-2xl" aria-hidden="true">
                    {getAvatar(entry.avatarId).emoji}
                  </p>
                  <p className="text-base sm:text-lg font-bold text-white truncate">
                    {entry.username}
                  </p>
                  <p className="text-sm text-slate-300">{formatNumber(entry.totalScore)} pts</p>
                </Card>
              ))}
            </div>
          )}

          {/* Elenco completo */}
          <div className="space-y-3" aria-live="polite">
            {entries.map((entry) => (
              <Card
                key={entry.playerId}
                className={`!p-4 ${getRankStyle(entry.rank, entry.isCurrentPlayer)}`}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="text-2xl w-12 text-center font-bold text-slate-200 shrink-0">
                    <span aria-hidden="true">{getRankBadge(entry.rank)}</span>
                    <span className="sr-only">Posizione {entry.rank}</span>
                  </div>
                  <div className="text-3xl shrink-0" aria-hidden="true">
                    {getAvatar(entry.avatarId).emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-white truncate">{entry.username}</p>
                      {entry.isCurrentPlayer && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">
                          Tu
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300">
                      Livello {entry.level} ({levelTitle(entry.level)}) • {entry.gamesPlayed}{" "}
                      {entry.gamesPlayed === 1 ? "partita" : "partite"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold gradient-text">
                      {formatNumber(entry.totalScore)}
                    </p>
                    <p className="text-xs text-slate-400">punti</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {!meInList && me.gamesPlayed > 0 && (
            <Card className="!p-4 border-dashed">
              <p className="text-sm text-slate-200">
                <strong className="text-white">Tu:</strong> {formatNumber(me.totalScore)} punti in{" "}
                {me.gamesPlayed} {me.gamesPlayed === 1 ? "partita" : "partite"} su questo
                dispositivo.
                {source === "cloud" && !me.authUserId
                  ? " Accedi con un account per pubblicare il tuo punteggio nella classifica cloud."
                  : " Non sei ancora tra le posizioni mostrate in questo intervallo."}
              </p>
            </Card>
          )}
        </>
      )}

      {/* Ultimi risultati multiplayer del giocatore */}
      <Card className="space-y-3">
        <h2 className="text-lg font-bold text-white">Le tue ultime partite multiplayer</h2>
        {multiplayerHistory.length === 0 ? (
          <p className="text-sm text-slate-300">
            Nessun risultato multiplayer registrato per il tuo profilo. Le partite online terminate
            con un account/sessione cloud compaiono qui e nel{" "}
            <Link href="/profile" className="text-emerald-300 underline underline-offset-2">
              tuo storico completo
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {multiplayerHistory.map((entry, index) => (
              <li
                key={`${entry.endedAt}-${index}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-white">{modeLabel(entry.mode)}</span>
                {entry.won && <span className="text-amber-300 font-semibold">🏆 Vittoria</span>}
                <span className="text-slate-200">{formatNumber(entry.score)} punti</span>
                <span className="text-slate-400">
                  {entry.correct}/{entry.rounds} corrette
                </span>
                <span className="text-slate-400 ml-auto">
                  {new Date(entry.endedAt).toLocaleDateString("it-IT")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
