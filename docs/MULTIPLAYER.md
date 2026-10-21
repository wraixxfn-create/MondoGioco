# Multiplayer online — architettura e contratto

Questo documento descrive **come funziona davvero** il multiplayer di MondoGioco:
modello degli stati, autorità del server, timestamp, riconnessione, limiti ed
errori. È la referencia per chi modifica il backend o il client.

> Principio: il client è un **visualizzatore** di snapshot prodotti dal database
> e un **richiedente** di azioni. Non decide mai punteggi, soluzioni o fasi.

---

## 1. Perché non esiste un fallback "offline"

La versione precedente creava stanze in `localStorage` e le mostrava come
multiplayer quando Supabase non era raggiungibile. Due client non potevano
incontrarsi, ma l'interfaccia lo lasciava intendere.

Ora:

- se Supabase non è configurato → `/multiplayer` mostra un avviso e disabilita
  creazione/ingresso;
- se la rete manca → errore esplicito con possibilità di riprovare;
- non esistono bot, avversari simulati o eventi finti.

Il gioco **in singolo** resta offline-first e salva i progressi sul dispositivo.

---

## 2. Modello dati

| Tabella                               | Schema        | Contenuto                                 | Chi può leggere                           |
| ------------------------------------- | ------------- | ----------------------------------------- | ----------------------------------------- |
| `game_rooms`                          | `public`      | Stanza, fase, timer, host, configurazione | Solo i membri                             |
| `game_room_members`                   | `public`      | Giocatori, punteggio, pronto, connessione | Solo i membri                             |
| `game_rounds`                         | `public`      | Prompt e opzioni dei round già iniziati   | Solo i membri, solo round ≤ corrente      |
| `game_answers`                        | `public`      | Risposte, esito, punti, tempo di risposta | Solo i membri, solo dopo la rivelazione   |
| `game_events`                         | `public`      | Feed eventi (join, start, reveal, close…) | Solo i partecipanti                       |
| `game_settings`                       | `public`      | Limiti configurabili (una riga)           | Tutti                                     |
| `question_bank`                       | `app_private` | Domande + **risposte corrette**           | Nessun client                             |
| `round_keys`                          | `app_private` | Soluzione del round                       | Nessun client                             |
| `rate_limits`, `rate_limit_policies`  | `app_private` | Contatori e limiti                        | Nessun client                             |
| `profile_private`, `profile_sessions` | `app_private` | Email, punteggi, storico                  | Nessun client (solo RPC del proprietario) |

Lo schema `app_private` non è esposto da PostgREST e non ha `GRANT` verso
`anon`/`authenticated`. Le risposte corrette non escono mai dal database prima
della chiusura del round.

---

## 3. Macchina a stati

```
                 create_room
                     │
                     ▼
                 ┌────────┐      start_game (host, tutti pronti, ≥2 connessi)
                 │ lobby  │──────────────────────────────────┐
                 └────────┘                                  ▼
                     │                              ┌──────────────────┐
      leave/close/expiry                           │   round_active   │
                     │                              └──────────────────┘
                     │                                 │            ▲
                     │        tempo scaduto (+grace)   │            │ round successivo
                     │        oppure tutti hanno       ▼            │ (tempo reveal scaduto)
                     │        risposto          ┌──────────────────┐│
                     │                          │   round_reveal   ││
                     │                          └──────────────────┘│
                     │                                 │            │
                     │                    ultimo round │            │
                     │                                 ▼            │
                     │                          ┌──────────────────┐
                     │                          │     finished     │
                     │                          └──────────────────┘
                     ▼                                 │
                 ┌────────┐◀───────── chiusura / archiviazione ─────┘
                 │ closed │
                 └────────┘
```

- `lobby`: ingressi consentiti, pronto e avvio.
- `round_active`: risposte accettate solo per `current_round`, entro
  `round_ends_at + 1500 ms`.
- `round_reveal`: soluzione e risultati del round visibili; durata
  `reveal_seconds` (default 8).
- `finished`: classifica finale; statistiche registrate una sola volta.
- `closed`: sola lettura per un massimo di 24h, poi cancellazione.

Le transizioni avvengono **solo** dentro `app_private.advance_room`, chiamata da
`heartbeat`, `sync_room`, `submit_answer` e `maintenance_tick`. Il client non
può impostare la fase.

---

## 4. Autorità del server: cosa viene validato

Ogni RPC controlla, nell'ordine:

1. **Autenticazione**: `auth.uid()` non nullo (sessione Supabase, anche anonima).
2. **Rate limit**: contatore per bucket e utente (`enforce_rate`).
3. **Appartenenza**: `is_room_member` / `require_member` con lock della riga.
4. **Fase**: la stanza è in una fase che consente l'azione.
5. **Round**: `p_round_index = current_round` (nessuna risposta "in anticipo" o
   "in ritardo").
6. **Tempo**: `now() <= round_ends_at + answer_grace_ms`.
7. **Contenuto**: la risposta è esattamente una delle opzioni del round.
8. **Unicità**: `UNIQUE(room_id, round_index, user_id)` + lock del membro →
   nessun doppio invio.

Il punteggio è calcolato dal server:

```
response_ms = clamp(clock_timestamp() - round_started_at, 0, round_seconds*1000)
bonus       = floor((1 - response_ms / (round_seconds*1000)) * 100)
points      = correct ? 100 + bonus : 0        // 100..200 per round
```

Non esistono parametri di punteggio, esito o destinazione inviabili dal client.
Le RPC non accettano un `user_id`: l'identità è sempre quella del JWT.

### Concorrenza

- `SELECT … FOR UPDATE` sulla stanza e poi sul membro, **sempre nello stesso
  ordine** (stanza → membro) per evitare deadlock.
- La riga della stanza serializza le transizioni: due client che chiamano
  `sync_room` insieme non avanzano due volte lo stesso round.
- `UNIQUE` sulle risposte è la barriera finale contro due invii simultanei.
- `stats_recorded` rende idempotente la registrazione finale.
- `advance_room` è idempotente: se la fase è già avanzata, non fa nulla.

---

## 5. Timestamp e latenza (strategia documentata)

- Ogni timestamp è generato **dal database** (`now()`), mai dal client.
- `public.server_time()` restituisce l'ora server; il client stima l'offset
  `serverNow = Date.now() + offset` con metà del round-trip misurato.
- Ogni snapshot contiene `server_time`, usato anche per correggere la deriva.
- Il countdown mostrato è quindi `ends_at − serverNow` (solo estetica: la
  decisione resta server-side).
- Tolleranza di rete: `answer_grace_ms = 1500 ms` oltre `round_ends_at` per
  accettare risposte già in volo. La rivelazione avviene dopo la grazia.
- Se tutti i giocatori connessi hanno risposto, il round si chiude subito.
- Se nessuno chiama RPC, il DB non avanza: gli heartbeat dei client (ogni ~3 s)
  fanno da "motore"; `maintenance_tick` chiude le stanze senza nessuno.

Conseguenza dichiarata: un client molto lento può mostrare per qualche secondo
una fase vecchia, ma lo stato successivo arriva dallo snapshot e il server
rifiuta le azioni non più valide (`round_closed`, `round_not_active`).

---

## 6. Riconnessione, host e chiusura

| Situazione                                                  | Comportamento                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Refresh / rete persa e tornata                              | `reconnect_room(room_id)` riattiva lo stesso membro preservando punteggio             |
| Nessun heartbeat per `reconnect_grace_seconds` (90 s)       | Il giocatore è marcato `disconnected` (visibile in lobby)                             |
| Host silenzioso per `host_handover_seconds` (180 s)         | Host trasferito al membro connesso con `joined_at` più antico + evento `host_changed` |
| Host esce o stanza vuota                                    | `leave_room` chiude se non resta nessuno connesso                                     |
| Tutti si disconnettono per `empty_room_ttl_seconds` (120 s) | `maintenance_tick` chiude con `abandoned`                                             |
| Lobby non avviata entro 30 min                              | Chiusura `lobby_expired`                                                              |
| Partita oltre `room_max_duration_seconds` (2h)              | Chiusura `game_expired`                                                               |
| Risultati non consultati per 1h                             | Chiusura `results_expired`                                                            |
| Stanza chiusa da 24h                                        | Cancellazione (cascade su membri, round, risposte, eventi)                            |

`maintenance_tick` è idempotente, richiede autenticazione, è rate-limited e può
essere invocata dai client o da `pg_cron`/service role.

### Realtime e polling

I canali Realtime su `game_rooms`, `game_room_members`, `game_rounds` e
`game_events` servono **solo come trigger**: alla notifica il client chiama
`sync_room` e applica lo snapshot. In parallelo c'è un heartbeat periodico
(default 3 s): se Realtime non è attivo (o la RLS non gli consente di leggere),
il multiplayer funziona comunque. L'interfaccia indica quale modalità è attiva.

---

## 7. Contratto RPC

Tutte le funzioni multiplayer sono `security definer`, con `search_path`
esplicito, eseguibili solo da `authenticated` (tranne `server_time`, anche
`anon`) e restituiscono JSON.

| RPC                                                                        | Chi             | Effetto                                        | Errori principali                              |
| -------------------------------------------------------------------------- | --------------- | ---------------------------------------------- | ---------------------------------------------- |
| `create_room(name, quiz, difficulty, rounds?, maxPlayers?, roundSeconds?)` | autenticato     | Crea stanza + host pronto + codice univoco     | `MG400:*`, `MG429:rate_limited`                |
| `join_room(code)`                                                          | autenticato     | Entra in lobby o rientra se già membro         | `MG404:room_not_found`, `MG409:room_full`      |
| `reconnect_room(roomId)`                                                   | membro          | Riattiva la connessione e riallinea lo stato   | `MG403:not_a_member`                           |
| `heartbeat(roomId)`                                                        | membro          | Presenza + avanzamento fasi + snapshot         | `MG403:not_a_member`                           |
| `sync_room(roomId)`                                                        | membro          | Avanzamento fasi + snapshot (senza presenza)   | `MG403:not_a_member`                           |
| `get_room_state(roomId)`                                                   | membro          | Snapshot in sola lettura                       | `MG403:not_a_member`                           |
| `set_ready(roomId, ready)`                                                 | membro          | Cambia il pronto (solo lobby)                  | `MG409:game_already_started`                   |
| `start_game(roomId)`                                                       | host            | Estrae domande, azzera punteggi, avvia round 1 | `MG403:host_only`, `MG409:players_not_ready`   |
| `submit_answer(roomId, roundIndex, answer)`                                | membro connesso | Valida, calcola punti, aggiorna punteggio      | `MG409:duplicate_answer`, `MG409:round_closed` |
| `leave_room(roomId)`                                                       | membro          | Esce; trasferisce host o chiude se vuota       | —                                              |
| `kick_member(roomId, userId)`                                              | host            | Espelle in lobby                               | `MG403:host_only`                              |
| `close_room(roomId)`                                                       | host            | Chiude la stanza                               | `MG403:host_only`                              |
| `maintenance_tick()`                                                       | autenticato     | Chiude/archivia stanze scadute                 | `MG429:rate_limited`                           |

### Formato delle risposte

Successo (snapshot):

```json
{
  "ok": true,
  "server_time": "2026-10-21T12:00:00.123Z",
  "room": { "id": "…", "code": "ABC234", "phase": "round_active", "current_round": 2, "…": "…" },
  "me": { "user_id": "…", "is_host": true, "answered_current_round": false, "score": 0, "…": "…" },
  "players": [{ "user_id": "…", "connection": "connected", "is_ready": true, "…": "…" }],
  "standings": [{ "rank": 1, "score": 250, "…": "…" }],
  "round": { "index": 2, "prompt": "…", "options": ["…"], "ends_at": "…", "…": "…" },
  "reveal": null,
  "settings": { "client_poll_ms": 3000, "…": "…" }
}
```

Errore "atteso" (HTTP 200, nessun rollback del rate limit):

```json
{ "ok": false, "error": "MG409:duplicate_answer", "detail": null }
```

Errori interni (`MG5xx`) sono eccezioni Postgres e non sono recuperabili dal client.

### Note di sicurezza sulle risposte

- Durante `round_active`, `players[].score` e `standings[].score` sono **al netto
  dei punti del round in corso**: nessun indizio su chi ha risposto bene.
- `reveal` è presente solo in `round_reveal`/`finished`.
- `round` esiste solo per round già iniziati (mai domande future).
- Il codice stanza è visibile solo ai membri.

---

## 8. Limiti configurabili

In `public.game_settings`:

| Colonna                                     | Default      | Significato                            |
| ------------------------------------------- | ------------ | -------------------------------------- |
| `min_players`                               | 2            | Minimo per avviare                     |
| `default_max_players` / `max_players_limit` | 6 / 8        | Capienza                               |
| `min/default/max_rounds`                    | 3 / 8 / 15   | Numero round                           |
| `min/default/max_round_seconds`             | 10 / 25 / 90 | Durata round                           |
| `reveal_seconds`                            | 8            | Durata schermata soluzione             |
| `answer_grace_ms`                           | 1500         | Tolleranza risposte in volo            |
| `lobby_ttl_seconds`                         | 1800         | Vita massima della lobby               |
| `room_max_duration_seconds`                 | 7200         | Durata massima partita                 |
| `reconnect_grace_seconds`                   | 90           | Silenzio prima di `disconnected`       |
| `host_handover_seconds`                     | 180          | Silenzio dell'host prima del passaggio |
| `empty_room_ttl_seconds`                    | 120          | Stanza vuota prima della chiusura      |
| `finished_ttl_seconds`                      | 3600         | Conservazione risultati attivi         |
| `archived_retention_seconds`                | 86400        | Conservazione stanza chiusa            |
| `client_poll_ms`                            | 3000         | Intervallo heartbeat/sync              |

Rate limit in `app_private.rate_limit_policies` (per utente):

| Bucket                                   | Limite      |
| ---------------------------------------- | ----------- |
| `create_room`                            | 6 / 10 min  |
| `join_room`                              | 15 / min    |
| `reconnect_room`                         | 30 / min    |
| `heartbeat`                              | 120 / min   |
| `sync_room`                              | 180 / min   |
| `submit_answer`                          | 120 / min   |
| `set_ready`, `leave_room`, `kick_member` | 30–60 / min |
| `start_game`                             | 15 / min    |
| `close_room`                             | 20 / min    |
| `maintenance_tick`                       | 10 / min    |
| `set_username`                           | 5 / ora     |
| `record_solo_game`                       | 40 / ora    |

---

## 9. Catalogo errori (client)

`lib/services/multiplayer.ts` espone `describeMultiplayerError(code)`. I codici
più comuni:

| Codice                          | Significato / azione                              |
| ------------------------------- | ------------------------------------------------- |
| `NOT_CONFIGURED`                | env Supabase assenti                              |
| `ANONYMOUS_DISABLED`            | attivare il provider Anonymous                    |
| `NETWORK`                       | rete assente, riprovare                           |
| `MG401:authentication_required` | sessione assente                                  |
| `MG403:not_a_member`            | stanza persa: tornare alla home                   |
| `MG403:host_only`               | azione riservata all'host                         |
| `MG404:room_not_found`          | codice errato/chiuso/pieno (volutamente generico) |
| `MG409:duplicate_answer`        | già risposto                                      |
| `MG409:round_closed`            | tempo scaduto                                     |
| `MG409:round_not_active`        | fase non più attiva                               |
| `MG409:players_not_ready`       | manca qualche pronto                              |
| `MG429:rate_limited`            | attendere                                         |

---

## 10. Test e verifiche

- Test DB con PostgreSQL reale (PGlite): vedi `tests/db/multiplayer.test.ts`.
- Test della logica client: `tests/unit/multiplayer.test.ts`.
- Verifica sul progetto reale: `npm run verify:remote` (richiede credenziali).
- E2E con due browser reali: `tests/e2e/multiplayer-online.spec.ts`
  (saltato se le env non sono impostate).

Dettagli: [`docs/TESTING.md`](TESTING.md).
