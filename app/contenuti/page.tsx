"use client";

// ============================================================
// /contenuti — panoramica del sistema di contenuti geografici
// ============================================================
// Pagina di servizio: mostra cosa c'è nel dataset, come è organizzato
// e da quali fonti arriva. I contatori reali si ottengono caricando i
// pacchetti on demand (bottone in fondo alla sezione "Mappe"), così la
// pagina non scarica tutto il dataset al primo colpo.

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, Pill } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { listPackDescriptors, loadPacks, loadedBytes } from "@/lib/content/registry";
import { buildIndex, countAvailable } from "@/lib/content/catalog";
import type { ContentIndex } from "@/lib/content/catalog";
import { isChallengePack, listCollections } from "@/lib/content/collections";
import { validateLocations, summarizeIssues, errorsOnly } from "@/lib/content/quality";
import type { DifficultyMix } from "@/lib/content/selection";
import {
  CONTENT_GENERATED_AT,
  CONTENT_SCHEMA_VERSION,
  CONTENT_VERSION,
  GENERATED_LOCATION_COUNT,
} from "@/lib/content/version";
import { DATA_SOURCES } from "@/data/content/sources";
import { formatNumber } from "@/lib/utils";

const MODE_LABEL: Record<string, string> = {
  challenge: "Sfida",
  sprint: "Sprint",
  precision: "Precisione",
  timed: "Tempo",
  training: "Allenamento",
  daily: "Giornaliera",
  survival: "Sopravvivenza",
};

function planLabel(rounds: number, mix?: DifficultyMix, ramp?: boolean): string {
  if (ramp) return `${rounds} round in rampa (dal più facile)`;
  if (!mix) return `${rounds} round`;
  const parts = ([1, 2, 3] as const)
    .filter((level) => (mix[level] ?? 0) > 0)
    .map((level) => {
      const percent = Math.round((mix[level] ?? 0) * 100);
      const name = level === 1 ? "facili" : level === 2 ? "medi" : "difficili";
      return `${percent}% ${name}`;
    });
  return `${rounds} round · ${parts.join(" · ")}`;
}

export default function ContentPage() {
  const [index, setIndex] = useState<ContentIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [issues, setIssues] = useState<{ total: number; errors: number; byCode: string[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const thematic = useMemo(() => listCollections("thematic"), []);
  const challenges = useMemo(() => listCollections("challenge").filter(isChallengePack), []);
  const packs = useMemo(() => listPackDescriptors(), []);
  const totalLocations = index?.locations.length ?? null;

  // I pacchetti curati fanno parte del bundle di base: si possono contare
  // subito, senza attese.
  useEffect(() => {
    let cancelled = false;
    const curatedIds = packs.filter((pack) => pack.curated).map((pack) => pack.id);
    loadPacks(curatedIds)
      .then((loaded) => {
        if (cancelled) return;
        setIndex(buildIndex(loaded.flatMap((pack) => pack.locations)));
      })
      .catch(() => {
        if (!cancelled) setError("Impossibile caricare i pacchetti curati.");
      });
    return () => {
      cancelled = true;
    };
  }, [packs]);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadPacks(packs.map((pack) => pack.id));
      const locations = loaded.flatMap((pack) => pack.locations);
      const next = buildIndex(locations);
      setIndex(next);
      const found = validateLocations(locations);
      const byCode = summarizeIssues(found);
      setIssues({
        total: found.length,
        errors: errorsOnly(found).length,
        byCode: Object.entries(byCode)
          .sort((a, b) => b[1] - a[1])
          .map(([code, count]) => `${code}: ${count}`),
      });
    } catch {
      setError("Impossibile caricare tutti i pacchetti: riprova più tardi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#16244d]/80 via-[#111e3a]/90 to-[#0f1a33]/95 backdrop-blur-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00d9a5]/10 via-transparent to-[#0ea5e9]/10 pointer-events-none" />
        <div className="relative p-6 md:p-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-bold tracking-widest uppercase text-white/80">
            📚 Contenuti geografici
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-white">
            Cosa c&apos;è dentro <span className="gradient-text">il gioco.</span>
          </h1>
          <p className="text-white/60 leading-relaxed max-w-3xl">
            Luoghi, mappe tematiche, sfide e fonti. Il dataset è versionato, validato
            automaticamente e aggiornabile senza toccare le regole del gioco: qui trovi il quadro
            completo e i limiti noti.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Pill tone="success">Contenuti v{CONTENT_VERSION}</Pill>
            <Pill tone="info">Schema v{CONTENT_SCHEMA_VERSION}</Pill>
            <Pill tone="accent">Generato il {CONTENT_GENERATED_AT}</Pill>
          </div>
        </div>
      </div>

      {/* Numeri */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Luoghi nel dataset"
          value={formatNumber(totalLocations ?? GENERATED_LOCATION_COUNT)}
          hint={totalLocations ? "contati ora" : `+ ${formatNumber(338)} curati`}
        />
        <StatCard
          label="Luoghi generati"
          value={formatNumber(GENERATED_LOCATION_COUNT)}
          hint="da GeoNames, verificati su Natural Earth"
        />
        <StatCard
          label="Pacchetti"
          value={String(packs.length)}
          hint={`${packs.filter((pack) => pack.curated).length} curati a mano`}
        />
        <StatCard
          label="Caricati ora"
          value={`${Math.round(loadedBytes() / 1024)} kB`}
          hint="si scarica solo ciò che serve"
        />
      </div>

      {/* Mappe tematiche */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold tracking-widest uppercase text-white/60">
            Mappe tematiche
          </h2>
          <span className="text-xs text-white/40">
            {index ? `${formatNumber(index.locations.length)} luoghi caricati` : "caricamento…"}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {thematic.map((collection) => {
            const count = index ? countAvailable(index, collection.criteria) : null;
            return (
              <Card key={collection.id} className="!p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{collection.icon}</span>
                  <h3 className="font-bold text-white">{collection.title}</h3>
                  {count !== null && (
                    <span className="ml-auto text-xs font-bold px-2 py-1 rounded-full bg-white/10 border border-white/10 text-white/70">
                      {formatNumber(count)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/60">{collection.description}</p>
              </Card>
            );
          })}
        </div>
        {!index?.facets.categories.some((entry) => entry.value === "city") && (
          <div className="text-xs text-white/40">
            I contatori completi richiedono tutti i pacchetti città: premendo il bottone qui sotto
            vengono caricati una volta sola.
          </div>
        )}
      </section>

      {/* Sfide */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold tracking-widest uppercase text-white/60">
          Pacchetti di sfida
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {challenges.map((challenge) => {
            const count = index ? countAvailable(index, challenge.criteria) : null;
            return (
              <Card key={challenge.id} className="!p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{challenge.icon}</span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-white">{challenge.title}</h3>
                    <p className="text-sm text-white/60">{challenge.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Pill tone="info">
                    {planLabel(challenge.rounds, challenge.plan.difficultyMix, challenge.plan.ramp)}
                  </Pill>
                  <Pill tone="accent">
                    {MODE_LABEL[challenge.recommendedMode] ?? challenge.recommendedMode}
                  </Pill>
                  {count !== null && <Pill tone="success">{formatNumber(count)} luoghi</Pill>}
                </div>
                <Link href={`/play?challenge=${challenge.id}`}>
                  <Button size="sm" className="w-full">
                    Gioca questa sfida →
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Qualità */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold tracking-widest uppercase text-white/60">
            Controllo di qualità
          </h2>
          <Button size="sm" variant="secondary" onClick={loadAll} disabled={loading}>
            {loading ? "Caricamento…" : "Carica tutto e verifica"}
          </Button>
        </div>
        <Card className="!p-5 space-y-2 text-sm text-white/70">
          <p>
            Ogni record passa un validatore comune (usato anche dai test e dallo script di
            generazione): coordinate nei range, id univoci, metadati presenti, indizi leggibili,
            fonte dichiarata, assenza di duplicati e di coppie troppo vicine.
          </p>
          {issues && (
            <div className="pt-2 space-y-1 text-xs">
              <div className="text-white">
                {issues.errors === 0
                  ? `✅ Nessun errore bloccante su ${formatNumber(totalLocations ?? 0)} luoghi.`
                  : `⚠️ ${issues.errors} errori su ${formatNumber(totalLocations ?? 0)} luoghi.`}
              </div>
              {issues.byCode.length > 0 && (
                <div className="text-white/50">Avvisi: {issues.byCode.join(" · ")}</div>
              )}
            </div>
          )}
          {error && <div className="text-amber-200 text-xs">{error}</div>}
        </Card>
      </section>

      {/* Fonti */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold tracking-widest uppercase text-white/60">
          Fonti e attribuzioni
        </h2>
        <div className="grid gap-4">
          {DATA_SOURCES.map((source) => (
            <Card key={source.id} className="!p-5 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-white">{source.name}</h3>
                <Pill tone="info">{source.license}</Pill>
              </div>
              <p className="text-sm text-white/60">{source.dataset}</p>
              <p className="text-xs text-white/50">
                Attribuzione: {source.attribution} —{" "}
                <a
                  href={source.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  licenza
                </a>{" "}
                ·{" "}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-white"
                >
                  sito
                </a>
              </p>
              <p className="text-xs text-white/40">{source.notes}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Limiti */}
      <section className="space-y-4">
        <h2 className="text-sm font-bold tracking-widest uppercase text-white/60">Limiti noti</h2>
        <Card className="!p-5 text-sm text-white/70 space-y-2">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              La popolazione è un proxy di notorietà, non un dato di quiz: può essere datata
              rispetto all&apos;ultimo censimento.
            </li>
            <li>
              Le città generate hanno indizi sintetizzati dai metadati (regione, posizione nel
              paese, popolazione, fasce di coordinate): chiari ma meno ricchi di quelli scritti a
              mano per i luoghi curati.
            </li>
            <li>
              I confini usati per i controlli sono Natural Earth 1:10m: territori contesi o molto
              piccoli possono risultare privi di geometria e quindi non verificabili.
            </li>
            <li>
              L&apos;Antartide non ha insediamenti permanenti: non genera luoghi automatici, restano
              solo i record curati.
            </li>
          </ul>
        </Card>
      </section>

      <div className="pb-6 flex justify-center">
        <Link href="/play">
          <Button size="lg">Torna a giocare 🎮</Button>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card className="!p-5">
      <div className="text-xs uppercase tracking-widest text-white/50">{label}</div>
      <div className="text-2xl font-black text-white mt-1">{value}</div>
      <div className="text-xs text-white/40 mt-1">{hint}</div>
    </Card>
  );
}
