"use client";

import React from "react";

interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  color?: "emerald" | "blue" | "amber" | "red" | "violet";
  size?: "sm" | "md";
}

const colorStyles: Record<string, string> = {
  emerald: "from-[#00d9a5] to-[#0ea5e9]",
  blue: "from-blue-500 to-cyan-500",
  amber: "from-amber-500 to-orange-500",
  red: "from-rose-500 to-pink-500",
  violet: "from-violet-500 to-purple-500",
};

export function ProgressBar({ value, label, color = "emerald", size = "md" }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const height = size === "sm" ? "h-2" : "h-2.5";

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-sm font-medium text-white/60">{label}</span>
          <span className="text-sm font-black text-white">{Math.round(clampedValue)}%</span>
        </div>
      )}
      <div
        className={`w-full ${height} bg-white/10 rounded-full overflow-hidden backdrop-blur-sm`}
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
