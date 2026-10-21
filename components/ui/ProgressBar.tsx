"use client";

import React from "react";

interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  color?: "emerald" | "blue" | "amber" | "red";
  size?: "sm" | "md";
}

const colorStyles: Record<string, string> = {
  emerald: "from-emerald-500 to-teal-500",
  blue: "from-blue-500 to-cyan-500",
  amber: "from-amber-500 to-yellow-500",
  red: "from-red-500 to-rose-500",
};

export function ProgressBar({ value, label, color = "emerald", size = "md" }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const height = size === "sm" ? "h-2" : "h-3";

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-sm text-slate-400">{label}</span>
          <span className="text-sm font-semibold text-white">{Math.round(clampedValue)}%</span>
        </div>
      )}
      <div
        className={`w-full ${height} bg-slate-800 rounded-full overflow-hidden`}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`${height} bg-gradient-to-r ${colorStyles[color]} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
    </div>
  );
}
