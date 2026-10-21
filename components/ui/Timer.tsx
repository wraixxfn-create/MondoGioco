"use client";

import React from "react";

interface TimerProps {
  seconds: number;
  total: number;
}

export function Timer({ seconds, total }: TimerProps) {
  const percentage = Math.max(0, (seconds / total) * 100);
  const isLow = seconds <= 5;
  const isCritical = seconds <= 3;

  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-2">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-slate-800"
          />
          <circle
            cx="20"
            cy="20"
            r="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`transition-all duration-1000 ease-linear ${
              isCritical ? "text-red-500" : isLow ? "text-amber-500" : "text-emerald-500"
            }`}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${
            isCritical ? "text-red-400 animate-pulse" : isLow ? "text-amber-400" : "text-white"
          }`}
        >
          {seconds}
        </span>
      </div>
    </div>
  );
}
