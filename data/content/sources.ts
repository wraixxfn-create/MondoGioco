// ============================================================
// MondoGioco — Registro delle fonti dei dati geografici
// ============================================================
//
// Ogni record del dataset dichiara `sourceId`, che punta a una voce di
// questo registro. Nessun dato entra nel gioco senza una fonte
// dichiarata: è il modo in cui il progetto rispetta le licenze e rende
// verificabile la provenienza di ogni coordinata.
//
// Le licenze qui elencate sono tutte compatibili con la redistribuzione
// in un prodotto open source, purché venga riportata l'attribuzione
// indicata in `attribution` (ripresa in `CREDITS.md` e nell'interfaccia).

import type { SourceId } from "./schema";

export interface DataSource {
  id: SourceId;
  /** Nome della banca dati. */
  name: string;
  /** Cosa è stato usato esattamente. */
  dataset: string;
  /** Licenza della banca dati. */
  license: string;
  /** URL della licenza. */
  licenseUrl: string;
  /** Testo di attribuzione da riportare (requisito della licenza). */
  attribution: string;
  /** URL di riferimento della fonte. */
  url: string;
  /** Note su derivazioni, arrotondamenti e limiti noti. */
  notes: string;
}

export const DATA_SOURCES: DataSource[] = [
  {
    id: "geonames",
    name: "GeoNames",
    dataset:
      "GeoNames `cities1000` (insediamenti con popolazione ≥ 1.000) — id, nome, " +
      "coordinate, popolazione, codice amministrativo e feature code",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Dati geografici © GeoNames contributors — CC BY 4.0",
    url: "https://www.geonames.org/",
    notes:
      "Usato tramite il pacchetto npm `all-the-cities` (MIT) che ridistribuisce " +
      "l'export GeoNames. Le coordinate sono arrotondate a 4 decimali (~11 m). " +
      "La popolazione è l'ultimo valore pubblicato nell'export e può essere " +
      "datata: viene usata solo come proxy di notorietà, non come dato di quiz.",
  },
  {
    id: "natural-earth",
    name: "Natural Earth",
    dataset:
      "Natural Earth 1:10m — `admin_0_countries` (confini di stato) e `land` " +
      "(linea di costa), ridistribuiti come TopoJSON dal pacchetto `world-atlas`",
    license: "Pubblico dominio",
    licenseUrl: "https://www.naturalearthdata.com/about/terms-of-use/",
    attribution: "Geometrie di riferimento: Natural Earth (pubblico dominio)",
    url: "https://www.naturalearthdata.com/",
    notes:
      "Usato SOLO come strumento di controllo e derivazione (bounding box, " +
      "posizione relativa nel paese, distanza dalla costa, verifica " +
      "punto-entro-confini). Le geometrie non sono incluse nel bundle del browser.",
  },
  {
    id: "iso-3166",
    name: "ISO 3166-1 + traduzioni",
    dataset: "Codici paese alpha-2/alpha-3/numeric e denominazioni in italiano e inglese",
    license: "MIT",
    licenseUrl: "https://opensource.org/license/mit",
    attribution:
      "Codici e nomi dei paesi: `i18n-iso-countries` (MIT), continenti: " +
      "`countries-list` (MIT)",
    url: "https://www.iso.org/iso-3166-country-codes.html",
    notes:
      "Tabella di riferimento generata da script e usata per filtri, " +
      "attribuzione dei continenti e denominazioni in italiano.",
  },
  {
    id: "curated",
    name: "Redazione MondoGioco",
    dataset:
      "Luoghi curati a mano: monumenti, rilievi, fiumi, laghi, isole, siti " +
      "storici e città selezionate, con indizi testuali originali",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Testi degli indizi: MondoGioco — CC BY 4.0",
    url: "https://github.com/wraixxfn-create/MondoGioco",
    notes:
      "Le coordinate sono punti di riferimento noti (non inventati) arrotondati " +
      "a 2-4 decimali; la revisione umana è dichiarata in `quality.reviewed`. " +
      "Gli indizi sono testi originali scritti per il gioco: non sono copiati " +
      "da guide o enciclopedie e non riportano dati verificati voce per voce, " +
      "per questo restano volutamente generici sui dettagli più specialistici.",
  },
];

const SOURCES_BY_ID = new Map(DATA_SOURCES.map((s) => [s.id, s]));

export function getSource(id: SourceId): DataSource | undefined {
  return SOURCES_BY_ID.get(id);
}

/** Testo di attribuzione per una o più fonti (da mostrare nell'interfaccia). */
export function attributionFor(ids: Iterable<SourceId>): string[] {
  const out: string[] = [];
  const seen = new Set<SourceId>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const src = SOURCES_BY_ID.get(id);
    if (src) out.push(src.attribution);
  }
  return out;
}

/** Tutte le attribuzioni del progetto, in forma leggibile. */
export const ALL_ATTRIBUTIONS: string[] = DATA_SOURCES.map((s) => s.attribution);
