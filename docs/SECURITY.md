# Sicurezza e privacy dei dati

Documento operativo: cosa è pubblico, cosa è privato, quali policy esistono e
quali rischi restano. Le fonti di verità sono le migrazioni SQL in
`supabase/migrations/`.

---

## 1. Ruoli e chiavi

| Ruolo / chiave     | Dove vive                                | Può fare                                                                                                                                           |
| ------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anon`             | chiave anon (pubblica, nel browser)      | Leggere `profiles` (solo campi pubblici), `game_settings`, `get_leaderboard`, `server_time`. **Nessuna** RPC multiplayer, nessuna tabella `game_*` |
| `authenticated`    | JWT di sessione (anche anonima Supabase) | RPC multiplayer, lettura delle sole stanze di cui è membro, RPC del proprio profilo                                                                |
| `service_role`     | **solo server/script amministrativi**    | Bypassa RLS. Mai nel client, mai in `NEXT_PUBLIC_*`, mai nel repository                                                                            |
| `postgres` (owner) | migrazioni                               | Crea tabelle/funzioni `security definer`                                                                                                           |

Il browser riceve esclusivamente `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. La anon key è pubblica per design: la
protezione è la RLS, non la segretezza della chiave.

Gli script di verifica (`scripts/verify-remote.mjs`) usano **solo** la anon key.

---

## 2. Dati pubblici vs privati

### Pubblici (leggibili anche senza login)

| Dato                                                     | Dove                    | Note                      |
| -------------------------------------------------------- | ----------------------- | ------------------------- |
| `profiles.id`                                            | tabella `profiles`      | UUID utente               |
| `profiles.username`                                      | tabella `profiles`      | univoco, case-insensitive |
| `profiles.avatar_url`, `profiles.level`, `created_at`    | tabella `profiles`      | profilo pubblico          |
| Classifica: username, punteggio totale, partite, livello | RPC `get_leaderboard`   | aggregati, nessuna email  |
| Limiti di gioco                                          | tabella `game_settings` | trasparenza sui limiti    |

### Privati (solo proprietario o server)

| Dato                          | Dove                                             | Accesso                                                  |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Email                         | `app_private.profile_private.email`              | solo RPC `get_my_profile` (proprietario)                 |
| Punteggi/XP/vittorie totali   | `app_private.profile_private`                    | proprietario via RPC; aggregati pubblici via leaderboard |
| Storico partite               | `app_private.profile_sessions`                   | solo server (usato per classifiche periodiche)           |
| Domande + risposte corrette   | `app_private.question_bank`                      | solo server                                              |
| Soluzione del round           | `app_private.round_keys`                         | restituita solo dopo la rivelazione                      |
| Contatori rate limit / policy | `app_private.rate_limits`, `rate_limit_policies` | solo server                                              |
| Risposte dei giocatori        | `game_answers`                                   | solo membri, **solo dopo** la chiusura del round         |
| Codice stanza                 | `game_rooms.code`                                | chi possiede il codice; visibile ai membri               |

---

## 3. RLS e permessi

Tutte le tabelle esposte hanno `ROW LEVEL SECURITY` abilitata.

| Tabella             | Policy                                   | Regola                                                        |
| ------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `profiles`          | `profiles_public_read` (SELECT)          | lettura a tutti; **nessun** INSERT/UPDATE/DELETE per i client |
| `game_settings`     | `game_settings_public_read` (SELECT)     | lettura a tutti; nessuna scrittura                            |
| `game_rooms`        | `game_rooms_member_read` (SELECT)        | solo membri (`is_room_member`)                                |
| `game_room_members` | `game_room_members_member_read` (SELECT) | solo membri della stessa stanza                               |
| `game_rounds`       | `game_rounds_member_read` (SELECT)       | membri e solo round ≤ `current_round`                         |
| `game_answers`      | `game_answers_member_read` (SELECT)      | membri e solo round con `revealed_at` valorizzato             |
| `game_events`       | `game_events_member_read` (SELECT)       | partecipanti (esclusi gli espulsi)                            |

Non esistono policy di `INSERT`/`UPDATE`/`DELETE` sulle tabelle di gioco: i
privilegi sono revocati e ogni scrittura passa da funzioni `security definer`.

### Perché due helper

`app_private.is_room_member` e `app_private.is_room_participant` sono
`security definer` e restituiscono **solo un booleano sulla propria
appartenenza**. Le policy le usano per evitare la ricorsione infinita che si
creerebbe se `game_room_members` consultasse sé stessa sotto RLS. L'`EXECUTE` è
concesso ad `authenticated` perché il ruolo che valuta la policy deve poterle
chiamare.

### Verifica manuale (SQL Editor)

```sql
-- Tutte le tabelle esposte devono avere RLS abilitata
select relname, relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by relname;

-- Nessun permesso di scrittura per i client sulle tabelle di gioco
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
order by table_name, grantee;

-- Lo schema privato non deve avere grant per i client
select has_schema_privilege('authenticated', 'app_private', 'USAGE');  -- atteso: false
select has_schema_privilege('anon', 'app_private', 'USAGE');           -- atteso: false
```

---

## 4. Controlli lato server (riepilogo)

- Identità presa da `auth.uid()`: nessuna RPC accetta un `user_id` dal client.
- Appartenenza verificata con lock (`require_member`) e helper RLS.
- Fase e round verificati prima di ogni scrittura.
- Timer basati su `now()` del database; grazia di 1,5 s per la rete.
- Risposte duplicate bloccate da lock + `UNIQUE(room_id, round_index, user_id)`.
- Punteggio calcolato dal server (100–200 punti per risposta corretta).
- Avvio partita solo host, solo in lobby, solo con tutti pronti e ≥ 2 connessi.
- Espulsioni e chiusura stanza solo host; nessuna modifica diretta alle tabelle.
- Domande estratte e soluzioni conservate in `app_private`.
- Statistiche finali calcolate e registrate dal server una sola volta
  (`stats_recorded`).
- Errori "attesi" restituiti come JSON (`ok:false`) per non perdere i contatori
  di rate limiting; errori interni come eccezioni.

### Anti-enumerazione delle stanze

- Il codice è di 6 caratteri su un alfabeto di 32 simboli senza ambigui
  (`A-HJ-NP-Z2-9`) ≈ 1,07 miliardi di combinazioni.
- Non esiste alcun elenco pubblico di stanze.
- `join_room` non conferma se un codice esiste quando la stanza non è
  raggiungibile: restituisce sempre `MG404:room_not_found`.
- I tentativi falliti **contano** nel rate limit (15/min per utente).
- Le stanze sono leggibili solo dai membri (RLS).

### Input e vincoli

- Validazione Zod lato client (solo UX) + `CHECK` SQL lato server.
- Nome stanza 3–40 caratteri, caratteri di controllo rimossi.
- Codice stanza validato con regex; nessuna interpolazione SQL (RPC parametrizzate).
- Risposta obbligatoriamente presente tra le opzioni del round (operatore `?` su JSONB).
- Limiti numerici su round, giocatori, durata, punteggi.

---

## 5. Rate limiting

Implementato nel database (`app_private.rate_limit_policies` +
`consume_rate_limit`) con finestra fissa per utente. Non richiede servizi
esterni e vale anche per tentativi falliti (grazie agli errori strutturati).

Limiti principali: creazione stanza 6/10 min, ingressi 15/min, risposte
120/min, heartbeat 120/min, manutenzione 10/min. Tabella completa in
[`docs/MULTIPLAYER.md`](MULTIPLAYER.md#limiti-configurabili).

---

## 6. Rischi residui e mitigazioni consigliate

| Rischio                              | Stato                                                                          | Mitigazione                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Punteggi singolo auto-dichiarati     | **Accettato** (gioco offline-first). Validati per plausibilità, non autorevoli | Usare il multiplayer per competizioni; opzionale: separare le classifiche |
| Utente apre più account anonimi      | Possibile                                                                      | Abilitare CAPTCHA/Turnstile su Auth; richiedere email per le classifiche  |
| Enumerazione distribuita su molti IP | Parziale (limite per utente)                                                   | WAF/CDN con limiti per IP; monitoraggio                                   |
| Furto di JWT                         | Standard Supabase                                                              | HTTPS, scadenza token, refresh sicuro, niente token in URL                |
| DoS su RPC                           | Parziale                                                                       | Rate limit DB + limiti del provider; `maintenance_tick` leggero           |
| Realtime non autorizzato             | RLS applicata                                                                  | Realtime rispetta RLS; gli eventi non contengono soluzioni                |
| Chiave `service_role` esposta        | Prevenuto                                                                      | Mai in `NEXT_PUBLIC_*`; se sospetta, **ruotare** subito le chiavi         |
| XSS                                  | React escaping + nessun HTML da utenti                                         | Nessun `dangerouslySetInnerHTML` sui dati di gioco                        |
| Snapshot obsoleto sul client         | Accettato                                                                      | Il server rifiuta azioni non valide; il client riallinea con heartbeat    |

### Cosa **non** è stato fatto (limiti dichiarati)

- Nessun rate limit per IP a livello database: Supabase non espone l'IP nelle
  RPC. Da aggiungere al bordo (Vercel/Cloudflare).
- Nessun sistema anti-cheat comportamentale (es. latenze impossibili): il
  multiplayer è knowledge-based e il server misura i tempi reali.
- Nessuna moderazione dei nickname oltre a formato e unicità.
- Nessun canale spettatori: chi è espulso non può seguire la partita.

---

## 7. Procedura in caso di incidente

1. **Sospetta perdita della service_role key**: ruotala in
   Project Settings → API → _Rotate_; aggiorna gli script server; verifica i log.
2. **Abuso di stanze**: alza temporaneamente i rate limit? No — abbassali:
   ```sql
   update app_private.rate_limit_policies set max_hits = 2 where bucket = 'create_room';
   ```
3. **Dati compromessi**: controlla `game_events` (audit delle azioni) e i log
   Auth; chiudi le stanze sospette con `close_room`.
4. **Deploy di nuove migrazioni**: applica in staging, esegui `npm run verify:remote`,
   poi in produzione. Non modificare migrazioni già applicate: creane una nuova.
