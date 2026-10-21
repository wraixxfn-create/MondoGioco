import React from "react";

export function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-900/50 mt-auto">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌍</span>
            <span className="text-sm text-slate-400">
              MondoGioco — Impara la geografia divertendoti
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-500">
            <span>© 2026 MondoGioco</span>
            <span>•</span>
            <span>Fatto con ❤️ in Italia</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
