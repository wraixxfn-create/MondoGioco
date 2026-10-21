"use client";

import React, { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatNumber } from "@/lib/utils";

interface LeaderboardEntry {
  rank: number;
  username: string;
  totalScore: number;
  gamesPlayed: number;
  level: number;
}

// Dati demo (in produzione verrebbero da Supabase)
const DEMO_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, username: "GeoMaster", totalScore: 125400, gamesPlayed: 89, level: 42 },
  { rank: 2, username: "WorldExplorer", totalScore: 98750, gamesPlayed: 67, level: 35 },
  { rank: 3, username: "MapWizard", totalScore: 87320, gamesPlayed: 54, level: 31 },
  { rank: 4, username: "CapitalKing", totalScore: 76890, gamesPlayed: 48, level: 28 },
  { rank: 5, username: "GlobeRunner", totalScore: 65430, gamesPlayed: 42, level: 25 },
];

export default function LeaderboardPage() {
  const [timeRange, setTimeRange] = useState<"all" | "week" | "month">("all");

  const getRankBadge = (rank: number) => {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return `#${rank}`;
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return "bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border-yellow-500/50";
    if (rank === 2) return "bg-gradient-to-r from-slate-400/20 to-slate-500/20 border-slate-400/50";
    if (rank === 3) return "bg-gradient-to-r from-amber-700/20 to-orange-700/20 border-amber-700/50";
    return "bg-slate-900/60 border-slate-800";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">Classifica</h1>
        <p className="text-slate-400">
          I migliori giocatori di MondoGioco
        </p>
      </div>

      {/* Filtri temporali */}
      <div className="flex justify-center gap-3">
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
      {DEMO_LEADERBOARD.length >= 3 && (
        <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
          {/* Secondo posto */}
          <Card className={`text-center ${getRankStyle(2)}`}>
            <div className="text-4xl mb-2">🥈</div>
            <p className="text-lg font-bold text-white truncate">
              {DEMO_LEADERBOARD[1].username}
            </p>
            <p className="text-sm text-slate-400">
              {formatNumber(DEMO_LEADERBOARD[1].totalScore)} pts
            </p>
          </Card>

          {/* Primo posto */}
          <Card className={`text-center ${getRankStyle(1)} -mt-4`}>
            <div className="text-5xl mb-2">🥇</div>
            <p className="text-xl font-bold text-white truncate">
              {DEMO_LEADERBOARD[0].username}
            </p>
            <p className="text-sm text-slate-400">
              {formatNumber(DEMO_LEADERBOARD[0].totalScore)} pts
            </p>
          </Card>

          {/* Terzo posto */}
          <Card className={`text-center ${getRankStyle(3)}`}>
            <div className="text-4xl mb-2">🥉</div>
            <p className="text-lg font-bold text-white truncate">
              {DEMO_LEADERBOARD[2].username}
            </p>
            <p className="text-sm text-slate-400">
              {formatNumber(DEMO_LEADERBOARD[2].totalScore)} pts
            </p>
          </Card>
        </div>
      )}

      {/* Classifica completa */}
      <div className="space-y-3">
        {DEMO_LEADERBOARD.map((entry) => (
          <Card key={entry.rank} className={`!p-4 ${getRankStyle(entry.rank)}`}>
            <div className="flex items-center gap-4">
              <div className="text-2xl w-12 text-center">
                {getRankBadge(entry.rank)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white truncate">
                  {entry.username}
                </p>
                <p className="text-xs text-slate-400">
                  Livello {entry.level} • {entry.gamesPlayed} partite
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

      {/* Nota informativa */}
      <Card className="!p-4 bg-blue-500/5 border-blue-500/20">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-sm text-slate-300">
              <strong className="text-white">Nota:</strong> Questa è una classifica demo. 
              Configura Supabase per vedere la classifica reale con i giocatori registrati.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
