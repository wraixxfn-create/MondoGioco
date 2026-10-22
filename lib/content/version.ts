// ============================================================
// MondoGioco — Versionamento dei contenuti
// ============================================================
// Il dataset è versionato su tre livelli:
// - `CONTENT_SCHEMA_VERSION` (in `data/content/schema.ts`): cambia la
//   FORMA dei dati e invalida lo storico dei luoghi visti;
// - `CONTENT_VERSION` (nel manifest generato): cambia quando i DATI
//   cambiano (nuovi luoghi, correzioni, ricostruzione dei pacchetti);
// - versione del singolo pacchetto (`PACK.version`): permette di
//   aggiornare un solo pacchetto senza toccare gli altri.
//
// Le correzioni si fanno nelle fonti o nel generatore, poi:
//   npm run content:build
// che rigenera i pacchetti, il manifest e l'audit geometrico.

import { GENERATED_MANIFEST } from "@/data/content/generated/manifest";

/** Versione dei contenuti (es. "1.0.0"). */
export const CONTENT_VERSION: string = GENERATED_MANIFEST.contentVersion;

/** Schema dei dati: se cambia, lo storico dei luoghi visti va azzerato. */
export { CONTENT_SCHEMA_VERSION } from "@/data/content/schema";

/** Data di generazione del dataset (ISO 8601, YYYY-MM-DD). */
export const CONTENT_GENERATED_AT: string = GENERATED_MANIFEST.generatedAt;

/** Totale dei luoghi nei pacchetti generati (città + capitali). */
export const GENERATED_LOCATION_COUNT: number = GENERATED_MANIFEST.totalLocations;

/** Prefisso delle chiavi usate nel localStorage. */
export const STORAGE_PREFIX = "mondogioco.content";
