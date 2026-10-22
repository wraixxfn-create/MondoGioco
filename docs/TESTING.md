# Strategia di test

Il progetto distingue tre livelli:

1. **Test unitari** (`tests/unit`, jsdom) — logica pura del client.
2. **Test di integrazione DB** (`tests/db`, PostgreSQL reale via PGlite/WASM) —
   migrazioni, RLS, funzioni, concorrenza e autorizzazioni.
3. **Verifiche che richiedono credenziali reali** — progetto Supabase e due
   browser. Non girano in CI senza segreti e lo dichiarano esplicitamente.

```bash
npm test                 # unit + db (nessuna credenziale richiesta)
npm run test:e2e         # Playwright (i test online si auto-saltano senza env)
npm run verify:remote    # flusso reale completo contro Supabase
```

---

## 1. Test DB con PostgreSQL reale (PGlite)

`tests/db/harness.ts` avvia un database PostgreSQL in WASM, ricostruisce il
contesto Supabase minimo (ruoli `anon`/`authenticated`/`service_role`, schema
`auth`, `auth.uid()` basata su GUC del JWT, publication `supabase_realtime`) e
applica **tutte** le migrazioni del repository in ordine.

Non è un mock: vengono eseguiti SQL, vincoli, trigger, policy RLS e PL/pgSQL
reali. Le differenze note rispetto a Supabase hosted:

- una sola connessione → le chiamate concorrenti sono serializzate (il
  comportamento applicativo è comunque esercitato; per il vero parallelismo
  serve il progetto hosted, coperto da `verify:remote`);
- `uuid-ossp` non è disponibile: la funzione è emulata con `gen_random_uuid()`;
- l'IP del client non esiste, quindi non si può testare un rate limit per IP.

### Progressione server (`tests/db/progression.test.ts`)

Copie degli stessi scenari di accettazione lato database (migrazione 005):
aggregati completi da `record_solo_game`, **idempotenza** con `session_key`
(retry senza doppie statistiche), XP obiettivo accreditati **una sola volta**,
compatibilità con la firma storica a 6 argomenti, validazione
bullseye/streak, autenticazione obbligatoria sulle RPC sensibili, streak
giornaliera (giorno dopo/salto), catalogo avatar e sblocco per livello,
impostazioni solo note e booleane, progressione/storico **solo del
chiamante**, amici per nickname, classifica amici senza email, spareggio
classifica ed esclusione degli utenti senza partite.

### Scenari coperti (`tests/db/multiplayer.test.ts`)

| Requisito                               | Test                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Due o più giocatori nella stessa stanza | "permette a un secondo giocatore di entrare…"                                                                                                                                  |
| Codice invito e ingresso                | "crea una stanza con codice valido…"                                                                                                                                           |
| Join non autorizzato                    | "rifiuta codici inesistenti o malformati…", "non conferma l'esistenza…", "blocca l'ingresso quando è piena", "impedisce l'ingresso a un espulso"                               |
| Autenticazione richiesta                | "richiede autenticazione" (anon → permission denied; JWT senza `sub` → `MG401`)                                                                                                |
| RLS                                     | "non consente a un estraneo di leggere la stanza (RLS)", "nasconde i round futuri e le risposte non rivelate via RLS", "impedisce a un giocatore espulso di leggere la stanza" |
| Rientro dal link d'invito               | "permette al membro di rientrare con il codice durante la partita"                                                                                                             |
| Solo l'host avvia / tutti pronti        | "solo l'host può avviare e servono tutti pronti"                                                                                                                               |
| Risposte simultanee                     | "accetta risposte simultanee di due giocatori…"                                                                                                                                |
| Risposta duplicata                      | "impedisce risposte duplicate"                                                                                                                                                 |
| Timer scaduto / risposta tarda          | "impedisce risposte tarde quando il timer è scaduto"                                                                                                                           |
| Round errato                            | "rifiuta un round diverso da quello corrente"                                                                                                                                  |
| Nessuna soluzione prima del reveal      | "non espone la risposta corretta durante il round", "nasconde i punteggi parziali del round in corso"                                                                          |
| Risposta fuori dalle opzioni            | "non accetta risposte fuori dalle opzioni"                                                                                                                                     |
| Disconnessione e riconnessione          | "marca i giocatori silenziosi come disconnessi…"                                                                                                                               |
| Host disconnesso                        | "trasferisce l'host se l'host resta disconnesso" (dopo 180 s di silenzio)                                                                                                      |
| Uscita e stanza vuota                   | "chiude la stanza quando tutti escono", "trasferisce l'host quando l'host esce volontariamente"                                                                                |
| Chiusura stanza                         | "chiude la stanza solo su richiesta dell'host"                                                                                                                                 |
| Stanze abbandonate                      | "chiude le lobby scadute e archivia le stanze chiuse"                                                                                                                          |
| Lettura senza effetti collaterali       | "la lettura dello stato non fa avanzare la fase"                                                                                                                               |
| Rate limiting                           | "applica il rate limit configurato"                                                                                                                                            |
| Manutenzione da cron                    | "permette la manutenzione da service_role (pg_cron)"                                                                                                                           |
| Alterazione punteggi                    | "non permette di scrivere punteggi o fasi direttamente"                                                                                                                        |
| Modifiche a profili/classifiche         | "non consente modifiche arbitrarie a profili e classifiche"                                                                                                                    |
| Punteggi singoli validati               | "valida i punteggi singoli lato server…"                                                                                                                                       |
| Classifica finale registrata una volta  | "registra la classifica finale multiplayer una sola volta"                                                                                                                     |

I test usano `shiftRoomClock` per spostare i timestamp lato server (setup), non
per bypassare la logica: le funzioni continuano a leggere `now()`.

---

## 2. Test unitari del client

- `tests/unit/multiplayer.test.ts` — configurazione assente, normalizzazione dei
  codici (alfabeto senza `I/O/0/1`), mapping errori, timer dai timestamp server,
  memoria della stanza attiva, condizioni di avvio, host assente.
- `tests/unit/player-store.test.ts` — persistenza locale (migrazione v1→v2), XP,
  idempotenza locale per `sessionId`, obiettivi una sola volta, streak,
  accuratezza/record, **nessun giocatore inventato** in classifica locale,
  stati espliciti senza cloud (amici/auth/recupero), traduzione errori Auth,
  avatar bloccati/sbloccati, impostazioni persistenti con riduzione animazioni
  applicata al DOM, validazione nickname, **nessuna finta stanza** quando
  Supabase non è configurato.
- `tests/unit/progression.test.ts` — regole XP documentate, catalogo obiettivi,
  streak giornaliera (confini di mese), avatar/titoli cosmetici, normalizzazione
  impostazioni, statistiche derivate (dato mancante = `null`, non 0), pareggi
  e ordinamento classifiche.
- `tests/unit/missions.test.ts` — metriche reali delle missioni (nessun campo
  inesistente), miglior run survival non cumulabile, determinismo della
  selezione giornaliera, assenza di ricompense XP finte.
- Gli altri test coprono globo, geo, dataset, obiettivi e paesi.

---

## 3. Verifiche che richiedono credenziali reali

Queste **non** possono passare senza un progetto Supabase configurato. In loro
assenza il codice lo dichiara (test saltati o exit code 2), non finge successo.

### `npm run verify:remote`

`scripts/verify-remote.mjs` — usa solo la anon key e l'accesso anonimo:

1. `server_time` + allineamento orologio;
2. profili leggibili senza email;
3. `game_rooms`/`game_answers` non leggibili da `anon`;
4. `app_private` non raggiungibile via REST;
5. `game_settings` leggibili;
6. due sessioni anonime reali;
7. creazione stanza, join con codice, estraneo che non vede nulla;
8. pronto, avvio (solo host), round attivo senza soluzione;
9. risposta accettata, duplicato rifiutato, seconda risposta;
10. reveal con soluzione e risultati;
11. chiusura stanza e rifiuto delle risposte successive.

Serve: env `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
migrazioni applicate, provider Anonymous attivo.

### `npm run test:e2e`

- `tests/e2e/cloud-features.spec.ts` — classifica, profilo, e stato reale della
  pagina multiplayer (senza credenziali: avviso + pulsanti disabilitati).
- `tests/e2e/multiplayer-online.spec.ts` — **due contesti browser reali**:
  l'host crea la stanza, l'ospite entra dal link, entrambi rispondono, la
  soluzione arriva dal server. Se le env mancano, il test è marcato _skipped_
  con un messaggio esplicito.

### Cosa NON è verificato automaticamente

- Concorrenza su connessioni multiple reali (il DB hosted serializza comunque
  con lock e vincoli; verificabile manualmente con due browser).
- Configurazione di Realtime lato dashboard (lo script verifica le RPC, non il
  websocket; il polling resta un fallback funzionante).
- Invio email di conferma account (dipende dalle impostazioni del progetto).
- Carico e abuso distribuito (serve un test di load/WAF esterno).
