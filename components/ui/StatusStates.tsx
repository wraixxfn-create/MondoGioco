"use client";

import React from "react";

/**
 * Spinner di caricamento globale.
 */
export function LoadingSpinner({ text = "Caricamento..." }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-slate-700" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 animate-spin" />
      </div>
      <p className="text-slate-400 text-sm animate-pulse">{text}</p>
    </div>
  );
}

/**
 * Skeleton loader per card.
 */
export function CardSkeleton() {
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 animate-pulse">
      <div className="h-6 bg-slate-800 rounded w-3/4 mb-3" />
      <div className="h-4 bg-slate-800 rounded w-1/2 mb-2" />
      <div className="h-4 bg-slate-800 rounded w-2/3" />
    </div>
  );
}

/**
 * Stato di errore generico.
 */
export function ErrorState({
  title = "Qualcosa è andato storto",
  message = "Si è verificato un errore imprevisto. Riprova più tardi.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
        <svg
          className="w-8 h-8 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
        <p className="text-slate-400 text-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors text-sm"
        >
          Riprova
        </button>
      )}
    </div>
  );
}

/**
 * Stato vuoto (nessun dato).
 */
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center">
        <svg
          className="w-8 h-8 text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>
      <div>
        <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
        <p className="text-slate-400 text-sm">{message}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
