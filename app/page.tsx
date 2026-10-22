import React from "react";
import Link from "next/link";
import { Card, CardHeader, Pill } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GlobeHero } from "@/components/globe/GlobeHero";

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero premium - globo al centro */}
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#16244d]/80 via-[#111e3a]/90 to-[#0f1a33]/95 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00d9a5]/10 via-transparent to-[#0ea5e9]/10 pointer-events-none" />
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-cyan-400/12 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-emerald-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative grid lg:grid-cols-[1.1fr_0.9fr] gap-8 p-6 md:p-10 items-center">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-[#0a1433] text-xs font-black tracking-widest">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              NUOVA STAGIONE — SFIDA QUOTIDIANA + COMBO
            </div>
            <h1 className="text-5xl md:text-6xl font-black tracking-tighter leading-[0.9] text-white">
              Esplora il <span className="gradient-text block">mondo, giocando.</span>
            </h1>
            <p className="text-lg text-white/60 leading-relaxed max-w-xl">
              Un globo NASA interattivo al centro di tutto. Indizi curati, combo che premiano la
              precisione e modalità per ogni umore — dal relax allo sprint di 15 secondi.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <Link href="/play">
                <Button size="lg" className="shadow-[0_10px_30px_rgba(0,217,165,0.25)]">
                  ▶ Inizia a giocare
                </Button>
              </Link>
              <Link href="/multiplayer">
                <Button size="lg" variant="secondary">
                  👥 Multiplayer
                </Button>
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Pill tone="success">⚡ Sprint 15s</Pill>
              <Pill tone="warning">🎯 Precisione</Pill>
              <Pill tone="info">🛡️ Sopravvivenza</Pill>
              <Pill tone="accent">📅 Giornaliera</Pill>
            </div>
          </div>

          <div className="relative lg:h-[420px] h-[360px] rounded-[1.5rem] overflow-hidden border border-white/15 bg-[#02061a] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <GlobeHero />
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
              <div className="px-3 py-1.5 rounded-full bg-white text-[#0a1433] text-xs font-bold">
                🌍 Globo NASA Blue Marble
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#02061a]/80 backdrop-blur border border-white/15 text-xs font-semibold text-white/80">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Ruota • Zoom • Esplora
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="relative border-t border-white/10 bg-white/[0.04] backdrop-blur-md px-6 py-4 flex flex-wrap gap-6 justify-between text-sm">
          <div className="flex gap-6">
            <div>
              <div className="text-white font-black text-lg leading-none">130+</div>
              <div className="text-white/50 text-xs font-semibold tracking-widest uppercase">
                Luoghi reali
              </div>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <div className="text-white font-black text-lg leading-none">7</div>
              <div className="text-white/50 text-xs font-semibold tracking-widest uppercase">
                Modalità
              </div>
            </div>
            <div className="w-px bg-white/10" />
            <div>
              <div className="text-white font-black text-lg leading-none">∞</div>
              <div className="text-white/50 text-xs font-semibold tracking-widest uppercase">
                Rigocabilità
              </div>
            </div>
          </div>
          <div className="text-white/50 text-xs font-medium self-center hidden md:block">
            Nessun pay-to-win • solo abilità e costanza
          </div>
        </div>
      </section>

      {/* Feature bento */}
      <section className="grid md:grid-cols-3 gap-4">
        <Card className="!p-0 overflow-hidden group">
          <div className="h-1 bg-gradient-to-r from-emerald-400 to-cyan-400" />
          <div className="p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
              ⚡
            </div>
            <h3 className="text-white font-bold">Gameplay immediato</h3>
            <p className="text-sm text-white/60 leading-relaxed">
              Nessuna schermata inutile. Round → feedback → avanti. Auto-avanza opzionale, tempi
              morti zero.
            </p>
          </div>
        </Card>
        <Card className="!p-0 overflow-hidden group">
          <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
          <div className="p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
              🔥
            </div>
            <h3 className="text-white font-bold">Combo &amp; maestria</h3>
            <p className="text-sm text-white/60 leading-relaxed">
              Streak entro 700 km: bonus fino a ×1.25. Premia la costanza, non abusabile farmando.
            </p>
          </div>
        </Card>
        <Card className="!p-0 overflow-hidden group">
          <div className="h-1 bg-gradient-to-r from-violet-400 to-purple-500" />
          <div className="p-6 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
              🎯
            </div>
            <h3 className="text-white font-bold">Ritorno quotidiano</h3>
            <p className="text-sm text-white/60 leading-relaxed">
              Sfida giornaliera condivisa, missioni daily/weekly, streak e cosmetici sbloccabili.
            </p>
          </div>
        </Card>
      </section>

      {/* Modalità preview */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black tracking-widest uppercase text-white/60">
            Modalità in evidenza
          </h2>
          <Link href="/play" className="text-sm font-bold text-white hover:text-emerald-300">
            Vai a Gioca →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: "🏆",
              name: "Sfida",
              desc: "La classica 5 round",
              color: "from-amber-400 to-orange-500",
            },
            {
              icon: "⚡",
              name: "Sprint",
              desc: "15s di pressione",
              color: "from-cyan-400 to-blue-500",
            },
            {
              icon: "🎯",
              name: "Precisione",
              desc: "Senza timer",
              color: "from-emerald-400 to-teal-500",
            },
            {
              icon: "🛡️",
              name: "Sopravvivenza",
              desc: "3 vite",
              color: "from-rose-400 to-pink-500",
            },
          ].map((m) => (
            <Link key={m.name} href="/play" className="group">
              <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5 hover:bg-white/[0.08] hover:border-white/15 hover:-translate-y-0.5 transition-all">
                <div
                  className={`w-10 h-10 rounded-xl bg-gradient-to-br ${m.color} flex items-center justify-center text-lg shadow-md group-hover:scale-110 transition-transform`}
                >
                  {m.icon}
                </div>
                <div className="mt-3 text-white font-bold">{m.name}</div>
                <div className="text-xs text-white/50">{m.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Features grid legacy but refreshed */}
      <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card hover>
          <CardHeader
            title="Globo 3D NASA"
            description="Blue Marble 4K + picking preciso"
            icon={<span className="text-2xl">🌍</span>}
          />
          <p className="text-sm text-white/60">
            Ogni click è una coordenata reale Haversine. Arco di volo e midpoint animano il reveal.
          </p>
        </Card>
        <Card hover>
          <CardHeader
            title="Multiplayer vero"
            description="Realtime Supabase, no bot"
            icon={<span className="text-2xl">👥</span>}
          />
          <p className="text-sm text-white/60">
            Stanze, ready, round sincronizzati e classifica finale — tutto server-side.
          </p>
        </Card>
        <Card hover>
          <CardHeader
            title="Progressione gratificante"
            description="XP, livelli, missioni, cosmetici"
            icon={<span className="text-2xl">📈</span>}
          />
          <p className="text-sm text-white/60">
            Solo abilità: streak, missioni e collezionabili cosmetici, zero pay-to-win.
          </p>
        </Card>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#00d9a5]/15 via-[#0ea5e9]/10 to-[#a78bfa]/10 backdrop-blur-xl p-8 md:p-10 text-center">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <div className="relative space-y-4">
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-white">
            Pronto a partire?
          </h2>
          <p className="text-white/60 max-w-xl mx-auto">
            Gioca come ospite o crea un account per salvare progressi, streak e classifica su ogni
            dispositivo.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link href="/play">
              <Button size="lg">🎮 Gioca ora — è gratis</Button>
            </Link>
            <Link href="/auth">
              <Button size="lg" variant="secondary">
                Crea account
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
