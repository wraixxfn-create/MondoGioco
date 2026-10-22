// ============================================================
// MondoGioco — Registro dei pacchetti di contenuti
// ============================================================
// REGOLA DI ARCHITETTURA: il browser scarica solo i pacchetti
// richiesti dai filtri attivi, non l'intero dataset.
//
// - i pacchetti curati (poche centinaia di record) sono piccoli e
//   costituiscono l'esperienza di base: si caricano subito;
// - i pacchetti generati da GeoNames sono divisi per continente e
//   vengono importati on demand con `import()` dinamico: Next.js
//   crea un chunk separato per ciascuno.
//
// Aggiungere un pacchetto = aggiungere una voce a `PACK_DESCRIPTORS`.
// Nessun'altra parte del codice deve cambiare.

import type { CuratedPack, GeneratedPack, HydratedLocation, SourceId } from "@/data/content/schema";
import type { Continent } from "@/types";
import { hydrateCuratedRow, hydratePackedRow } from "./hydrate";

export interface PackDescriptor {
  id: string;
  title: string;
  description: string;
  /** Pacchetti curati a mano (indizi originali, revisione umana). */
  curated: boolean;
  sourceIds: SourceId[];
  /** Continenti coperti: [] = pacchetto trasversale. */
  continents: Continent[];
  /** Stima della dimensione del pacchetto (byte): guida il budget client. */
  approxBytes: number;
  /** Se true il pacchetto fa parte del caricamento di base. */
  core: boolean;
}

export interface LoadedPack extends PackDescriptor {
  version: string;
  locations: HydratedLocation[];
}

type CuratedLoader = () => Promise<{ PACK: CuratedPack } | { default: CuratedPack }>;
type GeneratedLoader = () => Promise<{ PACK: GeneratedPack } | { default: GeneratedPack }>;

interface PackEntry extends PackDescriptor {
  kind: "curated" | "generated";
  load: CuratedLoader | GeneratedLoader;
}

const CORE_CURATED: { descriptor: Omit<PackEntry, "kind" | "load">; load: CuratedLoader }[] = [
  {
    descriptor: {
      id: "curated-core",
      title: "Luoghi iconici",
      description:
        "Capitali, città, monumenti, isole e luoghi naturali selezionati dalla redazione.",
      curated: true,
      sourceIds: ["curated"],
      continents: [],
      approxBytes: 90_000,
      core: true,
    },
    load: () => import("@/data/content/packs/curated-core"),
  },
  {
    descriptor: {
      id: "curated-mountains",
      title: "Montagne e vulcani",
      description: "Cime, massicci, catene e vulcani di tutti i continenti.",
      curated: true,
      sourceIds: ["curated"],
      continents: [],
      approxBytes: 26_000,
      core: true,
    },
    load: () => import("@/data/content/packs/curated-mountains"),
  },
  {
    descriptor: {
      id: "curated-hydro",
      title: "Fiumi e laghi",
      description: "Grandi fiumi e laghi: il punto indicato è dichiarato nell'indizio.",
      curated: true,
      sourceIds: ["curated"],
      continents: [],
      approxBytes: 44_000,
      core: true,
    },
    load: () => import("@/data/content/packs/curated-hydro"),
  },
  {
    descriptor: {
      id: "curated-historic",
      title: "Luoghi storici",
      description: "Siti archeologici e città dell'antichità in tutto il mondo.",
      curated: true,
      sourceIds: ["curated"],
      continents: [],
      approxBytes: 40_000,
      core: true,
    },
    load: () => import("@/data/content/packs/curated-historic"),
  },
  {
    descriptor: {
      id: "curated-landmarks",
      title: "Monumenti, isole e natura",
      description: "Architetture iconiche, isole e grandi ambienti naturali.",
      curated: true,
      sourceIds: ["curated"],
      continents: [],
      approxBytes: 34_000,
      core: true,
    },
    load: () => import("@/data/content/packs/curated-landmarks"),
  },
];

const CITY_PACKS: { descriptor: Omit<PackEntry, "kind" | "load">; load: GeneratedLoader }[] = [
  {
    descriptor: {
      id: "cities-europe",
      title: "Città e capitali — Europa",
      description:
        "Città e capitali europee selezionate da GeoNames e verificate su Natural Earth.",
      curated: false,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      continents: ["europe"],
      approxBytes: 46_000,
      core: false,
    },
    load: () => import("@/data/content/generated/cities-europe"),
  },
  {
    descriptor: {
      id: "cities-asia",
      title: "Città e capitali — Asia",
      description:
        "Città e capitali asiatiche selezionate da GeoNames e verificate su Natural Earth.",
      curated: false,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      continents: ["asia"],
      approxBytes: 85_000,
      core: false,
    },
    load: () => import("@/data/content/generated/cities-asia"),
  },
  {
    descriptor: {
      id: "cities-africa",
      title: "Città e capitali — Africa",
      description:
        "Città e capitali africane selezionate da GeoNames e verificate su Natural Earth.",
      curated: false,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      continents: ["africa"],
      approxBytes: 53_000,
      core: false,
    },
    load: () => import("@/data/content/generated/cities-africa"),
  },
  {
    descriptor: {
      id: "cities-north_america",
      title: "Città e capitali — America del Nord",
      description: "Città e capitali nordamericane selezionate da GeoNames e verificate.",
      curated: false,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      continents: ["north_america"],
      approxBytes: 34_000,
      core: false,
    },
    load: () => import("@/data/content/generated/cities-north_america"),
  },
  {
    descriptor: {
      id: "cities-south_america",
      title: "Città e capitali — America del Sud",
      description: "Città e capitali sudamericane selezionate da GeoNames e verificate.",
      curated: false,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      continents: ["south_america"],
      approxBytes: 22_000,
      core: false,
    },
    load: () => import("@/data/content/generated/cities-south_america"),
  },
  {
    descriptor: {
      id: "cities-oceania",
      title: "Città e capitali — Oceania",
      description: "Città e capitali dell'Oceania selezionate da GeoNames e verificate.",
      curated: false,
      sourceIds: ["geonames", "natural-earth", "iso-3166"],
      continents: ["oceania"],
      approxBytes: 11_000,
      core: false,
    },
    load: () => import("@/data/content/generated/cities-oceania"),
  },
];

const PACK_ENTRIES: PackEntry[] = [
  ...CORE_CURATED.map((entry) => ({
    ...entry.descriptor,
    kind: "curated" as const,
    load: entry.load,
  })),
  ...CITY_PACKS.map((entry) => ({
    ...entry.descriptor,
    kind: "generated" as const,
    load: entry.load,
  })),
];

const loaded = new Map<string, LoadedPack>();
const pending = new Map<string, Promise<LoadedPack>>();

/** Tutti i pacchetti disponibili (con i metadati, senza i dati). */
export function listPackDescriptors(): PackDescriptor[] {
  return PACK_ENTRIES.map((entry) => ({
    id: entry.id,
    title: entry.title,
    description: entry.description,
    curated: entry.curated,
    sourceIds: entry.sourceIds,
    continents: entry.continents,
    approxBytes: entry.approxBytes,
    core: entry.core,
  }));
}

export function getPackDescriptor(id: string): PackDescriptor | undefined {
  return listPackDescriptors().find((pack) => pack.id === id);
}

/** Pacchetti già caricati in memoria. */
export function loadedPacks(): LoadedPack[] {
  return [...loaded.values()];
}

export function isPackLoaded(id: string): boolean {
  return loaded.has(id);
}

/** Byte stimati già scaricati dal client (utile al budget e alla UI). */
export function loadedBytes(): number {
  return loadedPacks().reduce((sum, pack) => sum + pack.approxBytes, 0);
}

/** Luoghi già caricati (tutti i pacchetti in memoria). */
export function loadedLocations(): HydratedLocation[] {
  return loadedPacks().flatMap((pack) => pack.locations);
}

async function hydrateEntry(entry: PackEntry): Promise<LoadedPack> {
  const imported = await entry.load();
  const pack = ("PACK" in imported ? imported.PACK : imported.default) as
    CuratedPack | GeneratedPack;
  const locations =
    entry.kind === "curated"
      ? (pack as CuratedPack).rows.map((row) => hydrateCuratedRow(row, pack.id, pack.sourceId))
      : (pack as GeneratedPack).rows.map((row) => hydratePackedRow(row, pack.id));
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    curated: entry.curated,
    sourceIds: entry.sourceIds,
    continents: entry.continents,
    approxBytes: entry.approxBytes,
    core: entry.core,
    version: pack.version,
    locations,
  };
}

/** Carica un pacchetto (memoizzato: il secondo import è gratuito). */
export function loadPack(id: string): Promise<LoadedPack> {
  const cached = loaded.get(id);
  if (cached) return Promise.resolve(cached);
  const inFlight = pending.get(id);
  if (inFlight) return inFlight;
  const entry = PACK_ENTRIES.find((candidate) => candidate.id === id);
  if (!entry) return Promise.reject(new Error(`Pacchetto sconosciuto: ${id}`));
  const promise = hydrateEntry(entry)
    .then((pack) => {
      loaded.set(id, pack);
      pending.delete(id);
      return pack;
    })
    .catch((error) => {
      pending.delete(id);
      throw error;
    });
  pending.set(id, promise);
  return promise;
}

/** Carica più pacchetti in parallelo. */
export function loadPacks(ids: string[]): Promise<LoadedPack[]> {
  return Promise.all(ids.map((id) => loadPack(id)));
}

/** Pacchetti dell'esperienza di base (solo curati: poche centinaia di kB). */
export function loadCorePacks(): Promise<LoadedPack[]> {
  return loadPacks(CORE_CURATED.map(({ descriptor }) => descriptor.id));
}

/**
 * Sceglie i pacchetti necessari a soddisfare un criterio di filtro.
 * I pacchetti curati sono sempre inclusi (sono piccoli e trasversali);
 * i pacchetti città solo se serve il loro continente.
 */
export function packsForCriteria(criteria: {
  continents?: Continent[];
  countries?: string[];
  packs?: string[];
  categories?: string[];
}): string[] {
  const ids = new Set<string>(CORE_CURATED.map(({ descriptor }) => descriptor.id));
  for (const id of criteria.packs ?? []) ids.add(id);
  const continents = new Set(criteria.continents ?? []);
  if (continents.size > 0) {
    for (const entry of CITY_PACKS) {
      if (entry.descriptor.continents.some((continent) => continents.has(continent))) {
        ids.add(entry.descriptor.id);
      }
    }
  } else if (!criteria.packs?.length) {
    // Nessun filtro geografico: servono tutti i continenti.
    for (const entry of CITY_PACKS) ids.add(entry.descriptor.id);
  }
  return [...ids];
}

/** Svuota la cache (usato dai test). */
export function resetPackCache(): void {
  loaded.clear();
  pending.clear();
}
