import React from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GlobeHero } from "@/components/globe/GlobeHero";

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center space-y-6 pt-8">
        <h1 className="text-5xl md:text-6xl font-bold gradient-text">Esplora il Mondo</h1>
        <p className="text-xl text-slate-400 max-w-2xl mx-auto">
          Impara la geografia giocando. Quiz interattivi, sfide multiplayer e un globo 3D da
          esplorare.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Link href="/play">
            <Button size="lg" variant="primary">
              Inizia a Giocare
            </Button>
          </Link>
          <Link href="/training">
            <Button size="lg" variant="secondary">
              Allenamento
            </Button>
          </Link>
        </div>
      </section>

      {/* Globe Hero */}
      <section className="relative">
        <GlobeHero />
      </section>

      {/* Features Grid */}
      <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card hover>
          <CardHeader
            title="Quiz Interattivi"
            description="Capitali, bandiere, posizione e popolazione"
            icon={<span className="text-2xl">🎯</span>}
          />
          <p className="text-sm text-slate-400">
            Metti alla prova le tue conoscenze con quiz su misura per ogni livello di difficoltà.
          </p>
        </Card>

        <Card hover>
          <CardHeader
            title="Globo 3D NASA"
            description="Texture reale Blue Marble, picking preciso"
            icon={<span className="text-2xl">🌍</span>}
          />
          <p className="text-sm text-slate-400">
            Ruota e zooma la Terra con mouse, touch o tastiera: ogni click è convertito in
            coordinate geografiche reali.
          </p>
        </Card>

        <Card hover>
          <CardHeader
            title="Multiplayer"
            description="Sfida amici e giocatori online"
            icon={<span className="text-2xl">👥</span>}
          />
          <p className="text-sm text-slate-400">
            Crea stanze private o unisciti a partite pubbliche per competere in tempo reale.
          </p>
        </Card>

        <Card hover>
          <CardHeader
            title="Classifiche"
            description="Scala la classifica globale"
            icon={<span className="text-2xl">🏆</span>}
          />
          <p className="text-sm text-slate-400">
            Guadagna punti, sali di livello e conquista le prime posizioni della classifica.
          </p>
        </Card>

        <Card hover>
          <CardHeader
            title="Allenamento"
            description="Impara senza pressione"
            icon={<span className="text-2xl">📚</span>}
          />
          <p className="text-sm text-slate-400">
            Studia i paesi del mondo in modalità allenamento, senza timer né punteggio.
          </p>
        </Card>

        <Card hover>
          <CardHeader
            title="Progressione"
            description="Traccia i tuoi miglioramenti"
            icon={<span className="text-2xl">📈</span>}
          />
          <p className="text-sm text-slate-400">
            Monitora le tue statistiche, i punti guadagnati e i record personali.
          </p>
        </Card>
      </section>

      {/* CTA Section */}
      <section className="text-center space-y-4 py-12">
        <h2 className="text-3xl font-bold text-white">Pronto a partire per il tuo viaggio?</h2>
        <p className="text-slate-400 max-w-xl mx-auto">
          Crea un account gratuito e inizia subito a giocare. Salva i tuoi progressi e sfida i tuoi
          amici.
        </p>
        <div className="pt-4">
          <Link href="/profile">
            <Button size="lg">Crea Account</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
