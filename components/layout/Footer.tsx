import React from "react";

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#02061a]/60 backdrop-blur-xl mt-auto">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#00d9a5] to-[#0ea5e9] flex items-center justify-center text-sm">
              🌍
            </div>
            <span className="text-sm font-semibold text-white">MondoGioco</span>
            <span className="text-sm text-white/40 hidden sm:inline">
              — Impara la geografia divertendoti
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/40">
            <span>© 2026 MondoGioco</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>Fatto con ❤️ in Italia</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
