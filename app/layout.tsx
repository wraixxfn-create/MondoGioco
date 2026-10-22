import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "MondoGioco — Esplora il mondo giocando",
  description:
    "Un gioco geografico web con globo 3D interattivo, quiz, multiplayer e classifiche. Impara la geografia divertendoti!",
  keywords: ["geografia", "quiz", "gioco", "multiplayer", "globo 3D", "imparare"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{--font-display:"Space Grotesk",system-ui,sans-serif;--font-body:"Inter",system-ui,sans-serif;--font-mono:"JetBrains Mono",monospace;}`,
          }}
        />
      </head>
      <body className="flex flex-col min-h-screen antialiased">
        <a href="#contenuto" className="skip-link">
          Salta al contenuto principale
        </a>
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 -left-32 h-[600px] w-[600px] rounded-full bg-cyan-400/10 blur-[120px]" />
          <div className="absolute -top-20 -right-32 h-[700px] w-[700px] rounded-full bg-emerald-400/10 blur-[130px]" />
          <div className="absolute bottom-0 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-[120px]" />
        </div>
        <Header />
        <main id="contenuto" className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
