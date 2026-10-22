"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  active?: boolean;
  onClick?: () => void;
  variant?: "default" | "glass" | "elevated";
}

export function Card({
  children,
  className = "",
  hover = false,
  active = false,
  onClick,
  variant = "default",
}: CardProps) {
  const base =
    variant === "glass"
      ? "glass rounded-[1.5rem] p-6"
      : variant === "elevated"
        ? "bg-gradient-to-b from-[#16244d]/90 to-[#111e3a]/95 border border-white/10 rounded-[1.5rem] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        : "bg-gradient-to-b from-[#111e3a]/80 to-[#0f1a33]/90 border border-white/10 rounded-[1.5rem] p-6 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)]";

  const interactive = hover || onClick || active;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`
        ${base}
        ${interactive ? "cursor-pointer transition-all duration-300" : ""}
        ${hover ? "hover:border-[#00d9a5]/20 hover:shadow-[0_16px_40px_rgba(0,0,0,0.4),0_0_24px_rgba(0,217,165,0.08)] hover:-translate-y-0.5 hover:bg-gradient-to-b hover:from-[#1a2a55]/90 hover:to-[#111e3a]/95" : ""}
        ${active ? "border-[#00d9a5]/30 bg-gradient-to-b from-[rgba(0,217,165,0.08)] to-[#111e3a]/90 shadow-[0_16px_40px_rgba(0,0,0,0.4),0_0_24px_rgba(0,217,165,0.12)]" : ""}
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d9a5] focus-visible:ring-offset-2 focus-visible:ring-offset-[#02061a]
        ${className}
      `}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function CardHeader({ title, description, icon, action }: CardHeaderProps) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {icon && (
        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-[#00d9a5]/15 to-[#0ea5e9]/15 border border-white/10 rounded-xl flex items-center justify-center text-[#00d9a5] backdrop-blur-sm">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-[17px] font-bold text-white leading-tight">{title}</h3>
        {description && (
          <p className="text-[13px] text-slate-400 mt-1 leading-snug">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  size = "sm",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "info" | "accent";
  size?: "sm" | "md";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/8 text-slate-300 border-white/10",
    success: "bg-emerald-500/12 text-emerald-300 border-emerald-500/20",
    warning: "bg-amber-500/12 text-amber-300 border-amber-500/20",
    info: "bg-sky-500/12 text-sky-300 border-sky-500/20",
    accent: "bg-violet-500/12 text-violet-300 border-violet-500/20",
  };
  const sizes: Record<string, string> = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium backdrop-blur-sm ${tones[tone]} ${sizes[size]}`}
    >
      {children}
    </span>
  );
}

export function StatBadge({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: string;
  tone?: "neutral" | "success" | "warning" | "info";
}) {
  const toneMap: Record<string, string> = {
    neutral: "from-slate-800/60 to-slate-900/60 border-white/10",
    success: "from-emerald-500/10 to-teal-500/10 border-emerald-500/20",
    warning: "from-amber-500/10 to-orange-500/10 border-amber-500/20",
    info: "from-sky-500/10 to-blue-500/10 border-sky-500/20",
  };
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br px-4 py-3 backdrop-blur-sm ${toneMap[tone]}`}
    >
      <div className="text-[11px] font-semibold tracking-widest uppercase text-slate-400">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        {icon && <span className="text-lg">{icon}</span>}
        <span className="text-[15px] font-bold text-white">{value}</span>
      </div>
    </div>
  );
}
