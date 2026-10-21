"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = "", hover = false, onClick }: CardProps) {
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
        bg-slate-900/60 backdrop-blur-sm border border-slate-800
        rounded-2xl p-6
        ${hover ? "hover:border-emerald-500/50 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 cursor-pointer" : ""}
        ${onClick ? "cursor-pointer" : ""}
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
}

export function CardHeader({ title, description, icon }: CardHeaderProps) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {icon && (
        <div className="flex-shrink-0 w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
          {icon}
        </div>
      )}
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {description && <p className="text-sm text-slate-400 mt-0.5">{description}</p>}
      </div>
    </div>
  );
}
