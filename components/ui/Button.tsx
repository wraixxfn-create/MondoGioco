"use client";

import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "accent";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  primary:
    "bg-gradient-to-r from-[#00d9a5] to-[#0ea5e9] hover:from-[#00e6b0] hover:to-[#38bdf8] text-[#001a12] shadow-[0_8px_24px_rgba(0,217,165,0.25)] hover:shadow-[0_12px_32px_rgba(0,217,165,0.35)] hover:-translate-y-0.5 active:translate-y-0",
  secondary:
    "bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)] text-white border border-white/10 hover:border-white/15 backdrop-blur-md",
  ghost: "bg-transparent hover:bg-white/5 text-slate-300 hover:text-white border border-transparent",
  danger:
    "bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-lg shadow-rose-500/20",
  accent:
    "bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-[#1a1200] shadow-[0_8px_24px_rgba(245,158,11,0.25)]",
};

const sizeStyles: Record<string, string> = {
  sm: "px-3.5 py-2 text-sm rounded-xl gap-1.5",
  md: "px-5 py-2.5 text-[15px] rounded-xl gap-2",
  lg: "px-7 py-3.5 text-[16px] rounded-2xl gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`
        relative inline-flex items-center justify-center font-semibold
        transition-all duration-200 ease-out
        focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00d9a5]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#02061a]
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin h-4 w-4 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
