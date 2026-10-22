"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { loadLocalPlayer } from "@/lib/services/player-store";

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Applica subito la preferenza "Riduci animazioni" salvata nel profilo,
  // così vale su tutte le pagine (oltre a prefers-reduced-motion di sistema).
  useEffect(() => {
    try {
      const { settings } = loadLocalPlayer();
      document.documentElement.dataset.reduceMotion = settings.reduceMotion ? "true" : "false";
    } catch {
      // Storage non disponibile: resta la preferenza di sistema.
    }
  }, [pathname]);

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/play", label: "Gioca" },
    { href: "/training", label: "Allenamento" },
    { href: "/multiplayer", label: "Multiplayer" },
    { href: "/leaderboard", label: "Classifiche" },
    { href: "/profile", label: "Profilo" },
    { href: "/auth", label: "Accedi" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 glass border-b border-slate-800">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              🌍
            </div>
            <span className="text-xl font-bold gradient-text hidden sm:block">MondoGioco</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navigazione principale">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "text-slate-200 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-3 rounded-lg hover:bg-slate-800 text-slate-200"
            aria-label={mobileMenuOpen ? "Chiudi menu" : "Apri menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="menu-mobile"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav
            id="menu-mobile"
            className="md:hidden py-4 border-t border-slate-800"
            aria-label="Navigazione principale mobile"
          >
            <div className="flex flex-col gap-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive(item.href)
                      ? "bg-emerald-500/10 text-emerald-300"
                      : "text-slate-200 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
