# Sistema dei contenuti geografici

MondoGioco propone migliaia di round distinti partendo da un dataset
geografico versionato, validato e separato dalle regole di gioco.
Questo documento descrive l'architettura, i numeri, le fonti e le
procedure di aggiornamento.

Stato attuale: **contenuti v1.0.0 · schema v2 · generati il 2026-10-22**.

---

## 1. I numeri

| Voce                       | Valore                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Luoghi totali              | **3.686** (338 curati a mano + 3.348 generati)                                                     |
| Categorie                  | capitale, città, monumento, montagna, fiume, lago, isola, natura, storico (9)                      |
| Continenti                 | Europa 727 · Asia 1.241 · Africa 774 · America N. 483 · America S. 314 · Oceania 146 · Antartide 1 |
| Difficoltà                 | 1 → 738 · 2 → 1.502 · 3 → 1.446                                                                    |
| Pacchetti                  | 11 (5 curati nel bundle di base, 6 città caricati on demand)                                       |
| Esito controllo geometrico | 3.429 dentro i confini · 210 entro tolleranza · 47 non verificabili · **0 fuori**                  |

Suddivisione per pacchetto:

| Pacchetto              | Luoghi | Tipo     | Caricamento            |
| ---------------------- | -----: | -------- | ---------------------- |
| `curated-core`         |    133 | curato   | bundle di base         |
| `curated-mountains`    |     43 | curato   | bundle di base         |
| `curated-hydro`        |     86 | curato   | bundle di base         |
| `curated-historic`     |     38 | curato   | bundle di base         |
| `curated-landmarks`    |     38 | curato   | bundle di base         |
| `cities-europe`        |    619 | generato | on demand (continente) |
| `cities-asia`          |  1.157 | generato | on demand (continente) |
| `cities-africa`        |    727 | generato | on demand (continente) |
| `cities-north_america` |    436 | generato | on demand (continente) |
| `cities-south_america` |    279 | generato | on demand (continente) |
| `cities-oceania`       |    130 | generato | on demand (continente) |

---

## 2. Architettura: quattro strati separati

```
┌──────────────────────────────────────────────────────────────┐
│ UI            app/play, app/contenuti, app/training          │
│               (filtri, schede, riepiloghi)                   │
├──────────────────────────────────────────────────────────────┤
│ Regole        lib/game/engine.ts, lib/game/geo.ts            │
│               (punteggio, timer, combo: non sanno NIENTE      │
│                di come i luoghi vengono scelti)              │
├──────────────────────────────────────────────────────────────┤
│ Selezione     lib/content/selection.ts, catalog.ts,          │
│               recency.ts, collections.ts                     │
│               (filtri, quote di difficoltà, vincoli          │
│                geografici, antiripetizione)                  │
├──────────────────────────────────────────────────────────────┤
│ Dati          data/content/{schema,sources}.ts               │
│               data/content/packs/*.ts   (curati, a mano)     │
│               data/content/generated/*.ts (generati)         │
│               lib/content/{registry,hydrate,catalog}.ts      │
└──────────────────────────────────────────────────────────────┘
```

La regola che tiene insieme tutto: **il motore di gioco riceve gli
obiettivi già scelti** (`createGame(dataset, config, rng, now,
{ targets })`). Non estrae, non filtra, non conosce i pacchetti.
Questo permette di cambiare dataset, aggiungere categorie o
ribilanciare la difficoltà senza toccare una riga di regole.

### Dove sta ogni cosa

| Percorso                      | Responsabilità                                                               |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `data/content/schema.ts`      | Forma dei dati: tuple compatte, categorie, livelli, esiti dei controlli      |
| `data/content/sources.ts`     | Registro delle fonti (id, licenza, attribuzione, note)                       |
| `data/content/packs/*.ts`     | Pacchetti curati a mano (indizi originali, revisione umana)                  |
| `data/content/generated/*.ts` | Pacchetti generati + manifest + audit geometrico (**non modificare a mano**) |
| `lib/content/registry.ts`     | Elenco dei pacchetti e caricamento **on demand** con cache                   |
| `lib/content/hydrate.ts`      | Dalle tuple compattate ai luoghi usati a runtime                             |
| `lib/content/catalog.ts`      | Indice, faccette (conteggi per continente/categoria/…) e filtri              |
| `lib/content/selection.ts`    | Generatore di round: quote di difficoltà, vincoli, antiripetizione           |
| `lib/content/recency.ts`      | Storico dei luoghi già proposti (localStorage)                               |
| `lib/content/collections.ts`  | Mappe tematiche e pacchetti di sfida (solo dati)                             |
| `lib/content/quality.ts`      | Validatore unico condiviso da test, script e interfaccia                     |
| `lib/content/version.ts`      | Versioni e costanti derivate dal manifest                                    |
| `scripts/build-content.mjs`   | Generatore: ricostruisce pacchetti, manifest e audit                         |

---

## 3. Perché i pacchetti e non un file unico

Il client non scarica 3.686 luoghi tutti insieme:

- i **5 pacchetti curati** (338 luoghi, ~90 kB) fanno parte del bundle
  iniziale: sono l'esperienza di base e funzionano anche offline;
- i **6 pacchetti città** arrivano solo quando servono: scegliendo
  "Europa" si scarica `cities-europe` (~46 kB), non l'Asia.

Il registro (`lib/content/registry.ts`) espone `packsForCriteria()`,
che traduce un filtro (continente, paese, pacchetto) nell'elenco dei
pacchetti da caricare, e `loadedBytes()` per tenere d'occhio il budget.

---

## 4. Selezione dei round

`generateRounds(pool, count, plan, context)` è il cuore del sistema.

**Vincoli geografici** (`RoundPlan`):

- `minSeparationKm: 40` — due obiettivi più vicini sarebbero
  indistinguibili sul globo;
- `maxPerCountry: 2` (o `maxPerContinent`) — varietà geografica;
- `attempts: 24` — tentativi per round prima di allentare;
- se il parco luoghi non basta, i vincoli si allentano in tre passi
  (vincoli pieni → senza separazione → senza quote), **mai** con
  duplicati: si restituisce il massimo disponibile.

**Distribuzione della difficoltà**: quote deterministiche
(`difficultyMix`, default 25% / 40% / 35%) oppure `ramp: true`
(si parte dal livello 1 e si sale). La somma delle quote è sempre
`count`, senza arrotondamenti che lasciano buchi.

**Antiripetizione** (`lib/content/recency.ts`):

| Sessioni trascorse |    Peso di estrazione |
| -----------------: | --------------------: |
|    stessa sessione |           0 (escluso) |
|                  1 |                  0,05 |
|                  2 |                  0,20 |
|                  3 |                  0,45 |
|                  4 |                  0,70 |
|            5 o più | 1,00 (di nuovo pieno) |

Lo storico vive in `localStorage`
(`mondogioco.content.seen.v{CONTENT_SCHEMA_VERSION}`), tiene al più
5.000 luoghi ed è opzionale: senza storage il gioco funziona
comunque, con più ripetizioni.

**Determinismo**: passando un `rng` con seed (come fa la modalità
giornaliera) la sequenza di round è riproducibile; senza seed si usa
`Math.random`.

---

## 5. Estendere il sistema

### Aggiungere un luogo curato

Si modifica il pacchetto corrispondente in `data/content/packs/`.
Ogni riga è una tupla compatta:

```ts
// [id, nome, paese, codici ISO (separati da ;), continente, categoria,
//  difficoltà, lat, lng, temi[], indizi[]]
["colosseo", "Colosseo", "Italia", "IT", "europe", "monument", 1,
 41.8902, 12.4922, ["wonder", "ancient"], [
  "Indizio 1…", "Indizio 2…", "Indizio 3…",
]],
```

Coordinate e dati storici **devono** provenire da una fonte
documentata (`data/content/sources.ts`): non si inventano valori.
Poi:

```bash
npm run content:build   # rigenera manifest e audit geometrico
npm test                # i test di qualità girano su tutto il dataset
```

### Aggiungere una categoria

Le categorie stanno in un registro (`lib/content/categories.ts`) e il
tipo `LocationCategory` è un'unione aperta: una nuova categoria
richiede solo la sua voce nel registro (etichetta, icona, temi di
default, stile degli indizi). Nessuna modifica a motore, selezione o
interfaccia: i filtri e le faccette si popolano da sole.
Lo stesso vale per i **temi** (`lib/content/themes.ts`).

### Aggiungere una mappa tematica o una sfida

Si aggiunge un oggetto a `COLLECTIONS` (`lib/content/collections.ts`):
una collezione è solo un `criteria` (filtro) più — per le sfide —
`rounds`, `plan` e `recommendedMode`. Compare automaticamente in
`/contenuti` ed è giocabile da `/play?challenge=<id>`.

### Correggere un dato generato

I pacchetti in `data/content/generated/` sono generati: **non si
modificano a mano**. La correzione si fa:

1. nella fonte o nella tabella di conversione (`scripts/data/`), oppure
2. nei parametri di `CONFIG` in `scripts/build-content.mjs`,

poi `npm run content:build`. Le correzioni geometriche sui pacchetti
curati si vedono subito nell'audit (`curated-audit.ts`).

---

## 6. Qualità e controlli

`lib/content/quality.ts` è il validatore unico, usato dai test, dallo
script di generazione e dalla pagina `/contenuti`. Controlla:

| Codice                                                              | Cosa segnala                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| `invalid-id`                                                        | id mancante o non in forma di slug                      |
| `duplicate-id`                                                      | id ripetuto                                             |
| `invalid-coordinates`                                               | coordinate fuori range o non numeriche                  |
| `missing-name` / `-country`                                         | metadati obbligatori assenti                            |
| `invalid-difficulty` / `-continent` / `unknown-category` / `-theme` | valori fuori dai registri                               |
| `missing-hints` / `short-hint`                                      | indizi assenti o troppo brevi                           |
| `unknown-source`                                                    | record senza fonte dichiarata                           |
| `duplicate-place`                                                   | stesso nome e stesso paese due volte                    |
| `ambiguous-cluster`                                                 | stessa categoria, stesso paese, troppo vicini (< 10 km) |
| `overlapping-coordinates`                                           | due luoghi a meno di 50 m (errore materiale)            |
| `unchecked-geometry`                                                | record mai passato dal controllo punto-entro-confini    |

Il controllo geometrico usa Natural Earth 1:10m: ogni record è
classificato `inside` / `near` (entro tolleranza) / `outside`
(scartato o da correggere) / `unavailable` (paese senza geometria).
I pacchetti generati non contengono nessun `outside`.

Suite di test dedicata (`tests/unit/content-*.test.ts`): distribuzione
di categorie e difficoltà, assenza di duplicati, validità delle
coordinate, correttezza della selezione (nessun repeat in partita,
vincoli rispettati, ripetizioni ridotte fra sessioni), caricamento on
demand, estensibilità con una categoria nuova, integrazione col motore.

---

## 7. Fonti e licenze

| Fonte                                                                        | Uso                                                    | Licenza          |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------- |
| [GeoNames](https://www.geonames.org/) (`cities1000`, via `all-the-cities`)   | città e capitali: id, nome, coordinate, popolazione    | CC BY 4.0        |
| [Natural Earth](https://www.naturalearthdata.com/) 1:10m (via `world-atlas`) | confini e coste per i controlli geometrici             | Pubblico dominio |
| `countries-list` / `i18n-iso-countries`                                      | nomi dei paesi e codici ISO                            | MIT              |
| Redazione MondoGioco                                                         | pacchetti curati: scelta dei luoghi e indizi originali | Progetto (MIT)   |

Attribuzioni complete, testi richiesti dalle licenze e note sui limiti
sono in `CREDITS.md` e in `/contenuti`. **Nessun dato è inventato**:
ogni record dichiara un `sourceId` che punta a `data/content/sources.ts`.

---

## 8. Limiti noti

- **Popolazione datata**: è un proxy di notorietà (per la difficoltà e
  gli indizi), non un dato di quiz.
- **Indizi generati**: le città dei pacchetti automatici hanno indizi
  sintetizzati dai metadati (regione, posizione nel paese, popolazione,
  fascia di coordinate). Sono corretti ma meno ricchi di quelli scritti
  a mano: per questo i 338 luoghi curati restano l'esperienza di base.
- **Confini contesti**: Natural Earth 1:10m attribuisce alcuni
  territori a Stati diversi da quelli dichiarati da GeoNames (è il caso
  del Somaliland e di 9 città scartate dal generatore). Non sono stati
  introdotti alias politici: quei record sono stati esclusi.
- **Territori senza geometria**: 7 codici ISO molto piccoli o d'oltremare
  (YT, RE, SJ, BQ, MQ, GP, GF → 46 record) e 1 record curato non hanno
  una geometria di riferimento: risultano `unavailable`, non errati.
- **Deduzione a 12 km**: la deduplica automatica agisce **dentro lo
  stesso paese**; due città omonime o vicine oltre un confine possono
  coesistere deliberatamente (es. Kinshasa/Brazzaville).
- **Antartide**: nessun insediamento permanente, quindi nessun luogo
  generato (McMurdo Station è una base con popolazione stagionale).
- **Ripetizioni**: con ~3.700 luoghi e 5–10 round a partita il gioco non
  si ripete a breve termine; in filtri molto stretti (es. "capitali
  d'Europa", ~40 luoghi) le ripetizioni tornano fisiologiche dopo una
  decina di partite.

---

## 9. Riferimenti rapidi

```bash
npm run content:build   # ricostruisce pacchetti, manifest, audit
npm run type-check      # controllo dei tipi su tutto il progetto
npm test                # test unitari (inclusi quelli sui contenuti)
npm run format:check    # stile del codice
```

File generati (da non modificare): `data/content/generated/*.ts`.
Panoramica per chi gioca: rotta `/contenuti`.
