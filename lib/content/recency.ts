// ============================================================
// MondoGioco — Storico dei luoghi già proposti
// ============================================================
// Serve a due scopi distinti, entrambi richiesti dal gioco:
// 1. nella stessa sessione un luogo non deve MAI ripetersi;
// 2. fra sessioni consecutive la probabilità di rivedere lo stesso luogo
//    deve essere bassa e crescere lentamente col passare del tempo.
//
// I dati restano sul dispositivo (localStorage): non contengono nulla di
// personale e non lasciano il browser. Se lo storage non è disponibile
// (SSR, privacy, quota piena) la classe funziona comunque in memoria:
// la selezione dei round non si rompe mai per colpa dello storico.

import { CONTENT_SCHEMA_VERSION } from "@/data/content/schema";
import { CONTENT_VERSION } from "./version";

export const SEEN_STORAGE_KEY = `mondogioco.content.seen.v${CONTENT_SCHEMA_VERSION}`;

/** Numero massimo di luoghi tracciati (i più vecchi vengono rimossi). */
export const MAX_TRACKED_LOCATIONS = 5_000;

export interface SeenHistorySnapshot {
  /** Versione dello schema: se cambia, lo storico viene azzerato. */
  version: number;
  /** Versione dei contenuti: permette di rilevare dataset aggiornati. */
  contentVersion: string;
  /** Indice della sessione corrente (parte da 1). */
  session: number;
  /** id del luogo → indice dell'ultima sessione in cui è apparso. */
  entries: Record<string, number>;
}

export interface SeenHistoryOptions {
  storage?: Storage | null;
  key?: string;
  contentVersion?: string;
}

function emptySnapshot(contentVersion: string): SeenHistorySnapshot {
  return { version: CONTENT_SCHEMA_VERSION, contentVersion, session: 1, entries: {} };
}

/** Restituisce lo storage disponibile, o null (SSR, browser bloccato). */
function defaultStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export class SeenHistory {
  private snapshot: SeenHistorySnapshot;
  private readonly storage: Storage | null;
  private readonly key: string;

  constructor(options: SeenHistoryOptions = {}) {
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.key = options.key ?? SEEN_STORAGE_KEY;
    this.snapshot = emptySnapshot(options.contentVersion ?? CONTENT_VERSION);
    this.load();
  }

  /** Carica lo storico; i dati corrotti o di versioni diverse vengono ignorati. */
  load(): void {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<SeenHistorySnapshot>;
      if (parsed.version !== CONTENT_SCHEMA_VERSION) return;
      if (typeof parsed.session !== "number" || !parsed.entries) return;
      const entries: Record<string, number> = {};
      for (const [id, session] of Object.entries(parsed.entries)) {
        if (typeof session === "number" && Number.isFinite(session)) entries[id] = session;
      }
      this.snapshot = {
        version: CONTENT_SCHEMA_VERSION,
        contentVersion: parsed.contentVersion ?? CONTENT_VERSION,
        session: parsed.session,
        entries,
      };
    } catch {
      // Storico illeggibile: si riparte da zero senza interrompere il gioco.
      this.snapshot = emptySnapshot(this.snapshot.contentVersion);
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(this.snapshot));
    } catch {
      // Quota piena o storage in sola lettura: si continua in memoria.
    }
  }

  /** Indice della sessione corrente. */
  get sessionIndex(): number {
    return this.snapshot.session;
  }

  /** Versione dei contenuti con cui è stato creato lo storico. */
  get contentVersion(): string {
    return this.snapshot.contentVersion;
  }

  get size(): number {
    return Object.keys(this.snapshot.entries).length;
  }

  /** Mappa id → sessione dell'ultima apparizione (da passare al generatore). */
  entries(): Map<string, number> {
    return new Map(Object.entries(this.snapshot.entries));
  }

  /** Quante sessioni fa è apparso il luogo (undefined = mai visto). */
  ageOf(id: string): number | undefined {
    const session = this.snapshot.entries[id];
    return session === undefined ? undefined : this.snapshot.session - session;
  }

  /**
   * Segna i luoghi come visti nella sessione corrente. Da chiamare quando
   * i round vengono effettivamente proposti al giocatore.
   */
  markSeen(ids: Iterable<string>): void {
    for (const id of ids) this.snapshot.entries[id] = this.snapshot.session;
    this.prune();
    this.persist();
  }

  /**
   * Chiude la sessione corrente e ne apre una nuova.
   * Da chiamare all'inizio di ogni partita: è il meccanismo che fa
   * "invecchiare" i luoghi e quindi ne consente il ritorno.
   */
  startSession(): number {
    this.snapshot.session += 1;
    this.persist();
    return this.snapshot.session;
  }

  /** Rimuove le voci più vecchie quando si supera il limite. */
  private prune(): void {
    const keys = Object.keys(this.snapshot.entries);
    if (keys.length <= MAX_TRACKED_LOCATIONS) return;
    keys.sort((a, b) => (this.snapshot.entries[a] ?? 0) - (this.snapshot.entries[b] ?? 0));
    for (const key of keys.slice(0, keys.length - MAX_TRACKED_LOCATIONS)) {
      delete this.snapshot.entries[key];
    }
  }

  /** Azzera lo storico (usato dai test e dall'eventuale reset manuale). */
  clear(): void {
    this.snapshot = emptySnapshot(this.snapshot.contentVersion);
    if (this.storage) {
      try {
        this.storage.removeItem(this.key);
      } catch {
        // niente da fare: lo stato in memoria è già azzerato
      }
    }
  }
}

/** Istanza condivisa (una per scheda): evita più storici divergenti. */
let shared: SeenHistory | null = null;

export function getSeenHistory(): SeenHistory {
  if (!shared) shared = new SeenHistory();
  return shared;
}

export function resetSeenHistory(): void {
  shared = null;
}
