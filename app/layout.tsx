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
      <body className="flex flex-col min-h-screen">
        <a href="#contenuto" className="skip-link">
          Salta al contenuto principale
        </a>
        <Header />
        <main id="contenuto" className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
