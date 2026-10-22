"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadLocalPlayer, PLAYER_CHANGED_EVENT } from "@/lib/services/player-store";
import { calculateLevel } from "@/lib/utils";
import { getAvatar } from "@/lib/game/progression";

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [progress, setProgress] = useState(0);
  const [avatarEmoji, setAvatarEmoji] = useState("🌍");
  const [hasAccount, setHasAccount] = useState(false);

  useEffect(() => {
    try {
      const { settings } = loadLocalPlayer();
      document.documentElement.dataset.reduceMotion = settings.reduceMotion ? "true" : "false";
    } catch {}
    const refresh = () => {
      try {
        const p = loadLocalPlayer();
        const li = calculateLevel(p.xp);
        setXp(p.xp);
        setLevel(li.level);
        setProgress(li.progress);
        setAvatarEmoji(getAvatar(p.avatarId).emoji);
        setHasAccount(Boolean(p.authUserId));
      } catch {
        // localStorage non disponibile (Safari privato): si resta ai default.
      }
    };
    refresh();
    // Aggiornamento event-driven: niente polling ogni 2 secondi su ogni
    // pagina. "storage" copre le altre schede, l'evento custom questa.
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(PLAYER_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(PLAYER_CHANGED_EVENT, refresh);
    };
  }, [pathname]);

  const navItems = [
    { href: "/", label: "Home", icon: "⌂" },
    { href: "/play", label: "Gioca", icon: "◉" },
    { href: "/training", label: "Allenamento", icon: "✦" },
    { href: "/multiplayer", label: "Multiplayer", icon: "⬡" },
    { href: "/leaderboard", label: "Classifiche", icon: "♛" },
    { href: "/profile", label: "Profilo", icon: "◐" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#02061a]/70 border-b border-white/10">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-[64px] gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00d9a5] to-[#0ea5e9] flex items-center justify-center text-[20px] shadow-[0_6px_20px_rgba(0,217,165,0.3)] group-hover:scale-105 transition-transform">
              🌍
            </div>
            <div className="hidden sm:block leading-none">
              <div className="text-[18px] font-bold tracking-tight text-white">MondoGioco</div>
              <div className="text-[11px] font-medium tracking-widest uppercase text-white/60">
                Esplora • Gioca • Vinci
              </div>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav
            className="hidden lg:flex items-center gap-1 p-1 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md"
            aria-label="Navigazione principale"
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-all flex items-center gap-1.5 ${
                  isActive(item.href)
                    ? "bg-white text-[#0a1433] shadow-md"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <span className="opacity-60 text-xs">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right cluster */}
          <div className="flex items-center gap-2">
            {/* Level pill - desktop */}
            <div className="hidden md:flex items-center gap-3 pl-2 pr-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-sm">
                {avatarEmoji}
              </div>
              <div className="leading-none">
                <div className="text-xs font-bold text-white">Lv {level}</div>
                <div className="text-[11px] text-white/60">{xp.toLocaleString("it-IT")} XP</div>
              </div>
              <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden hidden xl:block">
                <div
                  className="h-full bg-gradient-to-r from-[#00d9a5] to-[#0ea5e9] rounded-full transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <Link
              href={hasAccount ? "/profile" : "/auth"}
              className="hidden md:inline-flex items-center justify-center px-4 py-2 rounded-full bg-white text-[#0a1433] text-sm font-bold hover:bg-white/90 transition-colors"
            >
              {hasAccount ? "Profilo" : "Accedi"}
            </Link>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden w-10 h-10 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/15 transition-colors"
              aria-label={mobileMenuOpen ? "Chiudi menu" : "Apri menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="menu-mobile"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav
            id="menu-mobile"
            className="lg:hidden py-4 border-t border-white/10 animate-[slide-in_0.25s_ease-out]"
            aria-label="Navigazione principale mobile"
          >
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors flex items-center gap-3 ${
                    isActive(item.href)
                      ? "bg-white text-[#0a1433]"
                      : "text-white/80 hover:bg-white/10 hover:text-white bg-white/[0.04] border border-white/10"
                  }`}
                >
                  <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-sm">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
              <div className="pt-3 flex gap-3">
                <Link
                  href={hasAccount ? "/profile" : "/auth"}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1"
                >
                  <span className="flex items-center justify-center w-full px-4 py-3 rounded-xl bg-white text-[#0a1433] font-bold">
                    {hasAccount ? "Il mio profilo" : "Accedi — crea account"}
                  </span>
                </Link>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10 mt-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00d9a5] to-[#0ea5e9] flex items-center justify-center">
                  {avatarEmoji}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">Livello {level}</div>
                  <div className="text-xs text-white/60">
                    {xp.toLocaleString("it-IT")} XP • {Math.round(progress)}% al prossimo
                  </div>
                </div>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
