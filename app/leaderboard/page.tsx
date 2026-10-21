"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/utils";
import {
  fetchLeaderboard,
  INITIAL_LEADERBOARD_ROWS,
  type LeaderboardRow,
  type TimeRange,
} from "@/lib/services/player-store";

export default function LeaderboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [entries, setEntries] = useState<LeaderboardRow[]>(INITIAL_LEADERBOARD_ROWS);
  const [source, setSource] = useState<"cloud" | "local">("cloud");
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async (range: TimeRange) => {
    setLoading(true);
    const res = await fetchLeaderboard(range);
    setEntries(res.entries);
    setSource(res.source);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData(timeRange);
  }, [timeRange, loadData]);

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const getRankStyle = (rank: number, isMe: boolean) => {
    if (isMe) {
      return "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-emerald-500/60";
    }
    if (rank === 1)
      return "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/50";
    if (rank === 2) return "bg-gradient-to-r from-slate-400/20 to-slate-500/20 border-slate-400/50";
    if (rank === 3)
      return "bg-gradient-to-r from-amber-700/20 to-orange-700/20 border-amber-700/50";
    return "bg-slate-900/60 border-slate-800";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold text-white">Classifica</h1>
        <p className="text-slate-400">I migliori esploratori di MondoGioco</p>
        <div className="flex items-center justify-center gap-3 pt-1">
          <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                source === "cloud" ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            {source === "cloud" ? "Supabase Live attivo" : "Classifica locale attiva"}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadData(timeRange)}
            disabled={loading}
          >
            {loading ? "Aggiornamento…" : "🔄 Aggiorna"}
          </Button>
        </div>
      </div>

      {/* Filtri temporali */}
      <div className="flex justify-center gap-3 flex-wrap">
        <Button
          variant={timeRange === "week" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setTimeRange("week")}
        >
          Questa Settimana
        </Button>
        <Button
          variant={timeRange === "month" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setTimeRange("month")}
        >
          Questo Mese
        </Button>
        <Button
          variant={timeRange === "all" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setTimeRange("all")}
        >
          Tutti i Tempi
        </Button>
      </div>

      {/* Podio */}
      {entries.length >= 3 && (
        <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
          <Card className={`text-center ${getRankStyle(2, entries[1].isCurrentPlayer)}`}>
            <div className="text-4xl mb-2">🥈</div>
            <p className="text-lg font-bold text-white truncate">{entries[1].username}</p>
            <p className="text-sm text-slate-400">{formatNumber(entries[1].totalScore)} pts</p>
          </Card>

          <Card className={`text-center ${getRankStyle(1, entries[0].isCurrentPlayer)} -mt-4`}>
            <div className="text-5xl mb-2">🥇</div>
            <p className="text-xl font-bold text-white truncate">{entries[0].username}</p>
            <p className="text-sm text-slate-400">{formatNumber(entries[0].totalScore)} pts</p>
          </Card>

          <Card className={`text-center ${getRankStyle(3, entries[2].isCurrentPlayer)}`}>
            <div className="text-4xl mb-2">🥉</div>
            <p className="text-lg font-bold text-white truncate">{entries[2].username}</p>
            <p className="text-sm text-slate-400">{formatNumber(entries[2].totalScore)} pts</p>
          </Card>
        </div>
      )}

      {/* Classifica completa */}
      {entries.length === 0 ? (
        <Card className="text-center py-8 space-y-4">
          <p className="text-slate-300">
            Nessuna partita registrata in questo intervallo temporale.
          </p>
          <Link href="/play">
            <Button size="sm">Gioca una partita per inaugurare il podio</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card
              key={entry.playerId}
              className={`!p-4 ${getRankStyle(entry.rank, entry.isCurrentPlayer)}`}
            >
              <div className="flex items-center gap-4">
                <div className="text-2xl w-12 text-center font-bold text-slate-300">
                  {getRankBadge(entry.rank)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white truncate">{entry.username}</p>
                    {entry.isCurrentPlayer && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        Tu
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Livello {entry.level} • {entry.gamesPlayed}{" "}
                    {entry.gamesPlayed === 1 ? "partita" : "partite"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold gradient-text">
                    {formatNumber(entry.totalScore)}
                  </p>
                  <p className="text-xs text-slate-500">punti</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
