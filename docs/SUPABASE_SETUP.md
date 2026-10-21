# Setup Supabase passo passo (per principianti)

Questa guida porta il progetto da "nessun database" a **multiplayer online
funzionante**. Richiede circa 15 minuti. Il gioco in singolo funziona anche
senza questi passaggi.

> **Cosa NON fare mai**: incollare la `service_role` key in `.env.local`,
> in una variabile `NEXT_PUBLIC_*`, nel codice o in un repository. Quella chiave
> aggira la Row Level Security. Il client usa solo la **anon public key**, che è
> pubblica per design e protetta da RLS.

---

## 0. Prerequisiti

- Node.js 20+ e `npm install` già eseguito.
- Un account su [supabase.com](https://supabase.com) (piano gratuito sufficiente).
- Due schede del browser per provare una partita a due giocatori.

---

## 1. Crea il progetto Supabase

1. Vai su [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.
2. Scegli un nome (es. `mondogioco`), una password robusta per il database e la
   region più vicina (es. `West EU (Ireland)` per l'Italia).
3. Attendi 1–2 minuti: il progetto crea database, auth e realtime.

## 2. Recupera URL e anon key

1. Nel progetto: **Project Settings** (ingranaggio) → **API**.
2. Copia:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Nella cartella del progetto:

```bash
cp .env.example .env.local
```

4. Apri `.env.local` e incolla i valori:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...   # chiave pubblica anon
```

5. Riavvia `npm run dev` (le variabili `NEXT_PUBLIC_*` vengono lette all'avvio).

> Se la pagina `/multiplayer` continua a mostrare "Multiplayer non
> configurato", controlla che l'URL inizi con `https://` e termini con
> `.supabase.co` e che la chiave anon sia quella **anon public** (non la
> service_role).

## 3. Applica le migrazioni

Le migrazioni sono in `supabase/migrations/` e vanno eseguite **in ordine**:

| File                                | Contenuto                                                              |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `001_initial_schema.sql`            | Schema storico (profili, tabelle legacy)                               |
| `002_profiles_rate_limits.sql`      | Profili pubblici/privati, rate limiting, classifica RPC                |
| `003_multiplayer_authoritative.sql` | Multiplayer autoritativo: stanze, membri, round, risposte, eventi, RPC |
| `004_question_bank_seed.sql`        | Banca domande generata (180 domande)                                   |

### Opzione A — SQL Editor (nessuna installazione)

1. Dashboard → **SQL Editor** → **New query**.
2. Apri `supabase/migrations/001_initial_schema.sql`, copia **tutto** il
   contenuto, incollalo nell'editor e premi **Run**.
3. Ripeti in ordine con `002`, `003`, `004`.
4. Se un file restituisce errori, fermati e leggi il messaggio: quasi sempre è
   un passaggio saltato (es. `004` senza `003`).

> ⚠️ Le migrazioni `002` e `003` eliminano le vecchie tabelle `player_profiles`,
> `game_sessions`, `rooms` e `room_players`, che consentivano a qualsiasi client
> di scrivere punteggi arbitrari. Eventuali dati di quelle tabelle vengono persi:
> erano classifiche "fidate dal client", non verificabili.

### Opzione B — Supabase CLI (per chi usa il terminale)

```bash
npx supabase login
npx supabase link --project-ref <project-ref>   # lo trovi nell'URL del progetto
npx supabase db push                            # applica tutte le migrazioni
```

## 4. Abilita l'accesso anonimo (necessario per gli ospiti)

Il multiplayer crea una **vera sessione Supabase** anche per chi non ha un
account: serve perché RLS e autorizzazioni funzionino davvero.

1. Dashboard → **Authentication** → **Providers** (o **Sign In / Providers**).
2. Apri **Anonymous** e attivalo (**Enable anonymous sign-ins**).
3. Salva.

Senza questo passaggio la pagina mostra:
"Accesso anonimo disattivato su Supabase".

### Account con email (opzionale)

- **Authentication → Providers → Email** è attivo per default.
- Per test rapidi puoi disattivare **Confirm email** in **Authentication →
  Sign In / Up → Email**. In produzione conviene tenerlo attivo e configurare
  **Site URL** + **Redirect URLs** con il dominio dell'app.

## 5. Verifica Realtime

La migrazione `003` aggiunge le tabelle `game_rooms`, `game_room_members`,
`game_rounds` e `game_events` alla publication `supabase_realtime`.

1. Dashboard → **Database** → **Replication** (o **Publications**).
2. Controlla che `supabase_realtime` includa le tabelle `game_*`.
3. Se mancano, esegui in SQL Editor:

```sql
alter publication supabase_realtime add table public.game_rooms;
alter publication supabase_realtime add table public.game_room_members;
alter publication supabase_realtime add table public.game_rounds;
alter publication supabase_realtime add table public.game_events;
```

Se Realtime non è disponibile, il multiplayer continua a funzionare tramite
sincronizzazione periodica RPC (indicatore "Sincronizzazione periodica").

## 5-bis. Pulizia automatica delle stanze (consigliata)

Finché qualcuno tiene aperta la pagina `/multiplayer`, il client chiama
`maintenance_tick()` ogni 2 minuti: archivia le stanze chiuse e chiude quelle
abbandonate. Se nessuno ha l'app aperta, quelle stanze restano lì finché non
torna un utente autenticato.

Per una pulizia garantita anche a sito chiuso, abilita l'estensione
**pg_cron** (Dashboard → **Database** → **Extensions** → `pg_cron`) e pianifica:

```sql
select cron.schedule(
  'mondogioco-maintenance',
  '* * * * *',
  $$select public.maintenance_tick()$$
);
```

- Gira ogni minuto come `postgres`/service role (la funzione accetta
  `service_role` senza JWT).
- Per fermarla: `select cron.unschedule('mondogioco-maintenance');`.
- È idempotente: eseguirla più spesso non crea effetti collaterali.
- Se non vuoi usare pg_cron va bene lo stesso: la stanza viene chiusa alla
  prima chiamata utile di un client, al massimo con qualche minuto di ritardo.

## 6. Verifica reale con due utenti

```bash
npm run verify:remote
```

Lo script (`scripts/verify-remote.mjs`):

- usa **solo** la anon key;
- crea due sessioni anonime reali;
- crea una stanza, entra con il codice, imposta il pronto, avvia la partita;
- invia risposte, verifica il rifiuto dei duplicati, la rivelazione della
  soluzione e la chiusura della stanza;
- verifica che le tabelle private e le soluzioni **non** siano leggibili dal client.

Se tutti i controlli sono ✔ il backend è pronto.

## 7. Prova nel browser

1. `npm run dev`
2. Apri `http://localhost:3000/multiplayer` in **due finestre diverse** (una
   normale e una in incognito, così le sessioni anonime sono distinte).
3. Nella prima: **Crea Nuova Stanza** → copia il codice o il link.
4. Nella seconda: **Unisciti a Stanza** → incolla il codice.
5. Entrambi cliccano **Sono pronto**, l'host clicca **Avvia Partita**.
6. Rispondete allo stesso round: la soluzione e i punti compaiono alla chiusura
   del round, decisa dal server.

## 8. Deploy (Vercel o simile)

1. Aggiungi `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` nelle
   variabili d'ambiente del provider (non nel repository).
2. Applica le migrazioni anche al progetto di produzione.
3. In **Authentication → URL Configuration** imposta **Site URL** e i
   **Redirect URLs** con il dominio reale.
4. Non committare `.env.local` (è già in `.gitignore`).

---

## Troubleshooting

| Sintomo                                                 | Causa probabile                           | Soluzione                                            |
| ------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| "Multiplayer non configurato"                           | env assenti o non valide                  | controlla `.env.local` e riavvia `npm run dev`       |
| "Accesso anonimo disattivato"                           | Anonymous provider off                    | passo 4                                              |
| "Codice stanza non valido o stanza non più disponibile" | codice errato, stanza chiusa/piena        | verifica il codice; crea una nuova stanza            |
| "Troppe richieste in poco tempo"                        | rate limit per utente                     | attendi (es. 60s per `join_room`)                    |
| "Permesso negato dal database"                          | migrazioni mancanti o ruolo sbagliato     | riapplica `002`–`004`, verifica di usare la anon key |
| "Profilo non ancora creato"                             | trigger `handle_new_user` assente         | verifica il trigger in `002`                         |
| Realtime non aggiorna                                   | publication non configurata               | passo 5 (il polling resta attivo)                    |
| Errori `gen_random_uuid`                                | PostgreSQL < 13                           | usa un progetto Supabase attuale                     |
| La stanza non parte                                     | meno di 2 giocatori o qualcuno non pronto | lobby: servono tutti pronti                          |

## Dove sono i limiti

Tutti i limiti sono nella tabella pubblica `game_settings` (una sola riga) e
nelle policy di rate limiting `app_private.rate_limit_policies`.
Per modificarli (solo amministratori, es. SQL Editor):

```sql
update public.game_settings
set default_round_seconds = 30,
    reveal_seconds = 10,
    lobby_ttl_seconds = 3600,
    host_handover_seconds = 45
where id = 1;

update app_private.rate_limit_policies
set max_hits = 10, window_seconds = 600
where bucket = 'create_room';
```

Valori attuali e loro significato: [`docs/MULTIPLAYER.md`](MULTIPLAYER.md#limiti-configurabili).
