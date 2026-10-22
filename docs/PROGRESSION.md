# Utente, progressione e classifiche

Documento tecnico del sistema account/progressione introdotto nel quarto
passaggio. Fonti di verità: `lib/game/progression.ts` (logica pura condivisa),
`lib/services/player-store.ts` (client), `supabase/migrations/005_progression.sql`
(server). Le definizioni in TypeScript e in SQL **devono restare allineate**
(stessi id, soglie, XP, avatar).

---

## 1. Sistema utente

| Funzione                   | Implementazione                                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registrazione / login      | Pagina `/auth` → Supabase Auth (`signUp` / `signInWithPassword`). Se il progetto richiede conferma email, la UI dichiara "controlla la tua email" e **non** finge la sincronizzazione (non c'è sessione).                                                                                                                                        |
| Recupero password          | `/auth` scheda «Password dimenticata» → `resetPasswordForEmail` con redirect a `/auth/reset`; messaggio di successo identico che l'email esista o no (anti-enumerazione). `/auth/reset` accetta la nuova password solo con sessione di recovery valida (`PASSWORD_RECOVERY`/sessione dall'URL); link scaduti/usati mostrano uno stato esplicito. |
| Cambio password da loggato | Profilo → «Account e sicurezza» → `auth.updateUser`.                                                                                                                                                                                                                                                                                             |
| Profilo                    | `/profile`: nickname pubblico univoco (stesse regole della RPC `set_username`), avatar cosmetico, livello/titolo, statistiche, record, statistiche per modalità, obiettivi con avanzamento, storico (filtro «Solo multiplayer»), impostazioni.                                                                                                   |
| Statistiche personali      | Punti totali, partite, vittorie, bullseye, **accuratezza** (round buoni ÷ round giocati), **punteggio medio**, **record in una partita**, migliore serie, streak giornaliera corrente e migliore. Dato assente (0 partite/round) ⇒ `—`, mai uno zero inventato.                                                                                  |
| Impostazioni               | `reduceMotion`, `globeAutoRotate`: salvate in locale e, con account, via RPC `set_my_settings` (chiavi/valori validati). Agiscono davvero: attributo `data-reduce-motion` + media query in `globals.css`, rotazione del `GlobeHero`.                                                                                                             |
| Stato non autenticato      | Ospite = profilo locale dichiarato come tale; sessione ospite anonima Supabase distinta dall'account email; sessione scaduta ⇒ il profilo locale torna ospite **senza cancellare** i progressi del dispositivo.                                                                                                                                  |
| Errori di rete/auth        | `describeAuthError` traduce gli errori Supabase/RPC in italiano comprensibile (credenziali errate, email già registrata, email non confermata, rate limit, offline…).                                                                                                                                                                            |

### Configurazione Auth richiesta (dashboard Supabase)

- **Site URL** e **Redirect URLs** devono includere `<origine>/auth` e
  `<origine>/auth/reset` per ogni ambiente (localhost e dominio di produzione).
- Provider **Email** attivo per account/recupero; provider **Anonymous**
  attivo per gli ospiti multiplayer (vedi `SUPABASE_SETUP.md`).
- Con conferma email attiva il flusso resta corretto: registrazione →
  stato "in attesa di conferma" → login dopo il clic sul link.

---

## 2. Progressione

### Regole XP (fisse e testate)

XP di partita (`XP_RULES` in `progression.ts`, minimo 25 se almeno 1 round):

```
XP = max(25, round(punteggio / 12) + 40 × bullseye + 15 × round + 75 se vittoria)
```

- Livello: costo del livello `n` = `floor(100 × n^1.5)` XP (`calculateLevel`
  in client, `app_private.level_from_xp` in DB — stessa formula).
- Multiplayer: gli XP sono calcolati **solo dal server**
  (`record_multiplayer_results`, formula della migrazione 003 invariata).
- Partita in singolo: il client invia gli XP di partita; il server li limita
  (`≤ 2000 × round`) e valida punteggio/round/corrette. Gli **XP obiettivo non
  li invia il client**: li accredita il DB, altrimenti sarebbero duplicabili.

### Obiettivi (achievement)

| Id                   | Condizione                            | XP    |
| -------------------- | ------------------------------------- | ----- |
| `first_game`         | 1 partita                             | 100   |
| `bullseye_1`         | 1 colpo ≤ 100 km                      | 250   |
| `multiplayer_1`      | 1 partita multiplayer                 | 200   |
| `streak_5`           | serie di 5 round buoni in una partita | 300   |
| `multiplayer_win_1`  | 1 vittoria multiplayer                | 400   |
| `explorer_10`        | 10 partite                            | 500   |
| `correct_50`         | 50 round buoni in carriera            | 600   |
| `daily_7`            | streak giornaliera di 7 giorni        | 700   |
| `winner_5`           | 5 vittorie                            | 750   |
| `best_score_20000`   | 20.000 punti in una partita           | 800   |
| `cartographer_25000` | 25.000 punti totali                   | 1.000 |
| `games_50`           | 50 partite                            | 1.500 |

Anti-duplicazione: sul server la PK `(user_id, achievement_id)` di
`app_private.user_achievements` e l'accredito solo per righe effettivamente
inserite (`evaluate_achievements`); in locale la lista persistita
`unlockedAchievements`. Richieste ripetute non pagano mai due volte (test DB e unitari dedicati).

### Altre protezioni anti-replay

- **Partita singola**: ogni partita ha un `sessionId` (UUID) generato a inizio
  partita e inviato come `p_session_key`; indice unico parziale
  `(user_id, session_key)` su `profile_sessions`. Un retry restituisce
  `{duplicate: true}` senza modificare nulla. La stessa chiave deduplica
  anche in locale.
- **Multiplayer**: invariato `game_rooms.stats_recorded` (una sola registrazione per stanza).
- Client vecchi / deploy progressivo: `record_solo_game` conserva la vecchia
  firma a 6 argomenti (i nuovi hanno default) e il client ripiega sulla
  firma storica se il DB non ha ancora la migrazione 005.

### Streak giornaliera

Una partita conclusa "oggi" mantiene la streak; il giorno successivo la
incrementa; qualsiasi salto la riporta a 1. **Giorno di riferimento**: data
locale del dispositivo per il profilo offline, **giorno UTC del server** per
il profilo cloud (deterministico e uguale per tutti; vicino alla mezzanotte
locale le due possono differire, ed è dichiarato qui invece che nascosto).

### Ricompense cosmetiche

Avatar predefiniti sbloccati per livello (`globe`, `compass` Lv1, `owl` Lv2,
`fox` Lv3, `penguin` Lv4, `rocket` Lv5, `crown` Lv7, `dragon` Lv10) e titolo
per livello. Solo estetica: nessun vantaggio di punteggio/gioco. Sul cloud
li valida la RPC `set_avatar` (catalogo chiuso + livello; vincolo CHECK in DB).

### Merge locale ↔ cloud

Per i contatori cumulativi vale il massimo tra locale e cloud (un dispositivo
offline non abbassa i progressi); nickname/avatar/impostazioni arrivano dal
server; gli obiettivi si uniscono. Il server resta l'autorità per nuovi
accrediti: il client non invia mai totali assoluti.

---

## 3. Classifiche

RPC: `get_leaderboard(p_range)` globale e `get_friends_leaderboard(p_range)`
amici; finestre `all` (aggregati in `profile_private`, indice su
`total_score DESC`), `week`/`month` (aggregazioni su `profile_sessions` con
indici su `ended_at` e `(user_id, ended_at)`). Massimo 50 righe.

- **Dati esposti**: solo `username`, `avatar_id`, punteggio, partite, livello.
  Mai email o dati privati (test dedicato).
- **Nuovi utenti**: compaiono dopo la prima partita registrata
  (`games_played > 0`; nelle finestre temporali, dopo la prima sessione nel periodo).
- **Pareggi**: ordinamento = punti DESC, poi **meno partite** (efficienza),
  poi username ASC (determinismo). La **posizione** dipende solo dai punti:
  pari punti ⇒ stessa posizione ("competition ranking" 1, 2, 2, 4), calcolata
  in client con `assignRanks` e testata.
- **Amici**: relazione "seguo" privata in `app_private.friendships`
  (`add_friend` per nickname pubblico esatto, case-insensitive; `remove_friend`;
  `list_friends`). La classifica amici include sé stessi + amici seguiti.
  Senza cloud/account: stato esplicito `unavailable`, mai elenchi inventati.
- **Senza cloud**: la classifica globale mostra **solo** i dati reali del
  giocatore su questo dispositivo (aggregati dallo storico locale, anche per
  settimana/mese). I vecchi giocatori "seed" sono stati rimossi dal codice.
- **Storico multiplayer**: `get_my_history(p_only_multiplayer)` + sezione nel
  profilo e riepilogo in pagina classifiche; le righe derivano esclusivamente
  dalle sessioni registrate dal server a fine partita online.

---

## 4. Migrazione 005 (compatibile)

Additiva: nuove colonne con default su `profiles` (`avatar_id`),
`profile_private` (round/correct/record/streak/settings) e `profile_sessions`
(`session_key`, `won`, `bullseyes`, `session_best_streak`); backfill degli
aggregati dalle sessioni esistenti con `GREATEST` (mai riduzioni); nuove
tabelle private `user_achievements` e `friendships`; nuovi bucket di rate
limit. Funzioni ricreate: `record_solo_game` (DROP+CREATE, nuovi parametri
con default ⇒ vecchie chiamate valide), `get_leaderboard` (colonna
`avatar_id` aggiuntiva nel risultato), `get_my_profile` (JSON solo esteso),
`record_multiplayer_results` (stessa firma/garanzie della 003). Nessuna
tabella rimossa, nessuna policy allentata; tabelle private senza GRANT.

**Rollback**: ripristinare i corpi funzione delle migrazioni 002/003 e
ignorare le nuove colonne/tabelle (sono additive e non lette dal vecchio
codice); gli XP obiettivo già accreditati restano nel totale XP (sono dati
di gioco legittimi, non vanno sottratti).

---

## 5. Accessibilità ed esperienza (riassunto)

- Skip-link «Salta al contenuto», `aria-current` sulla navigazione,
  `aria-expanded`/`aria-controls` sul menu mobile, focus visibile globale.
- `prefers-reduced-motion` **e** impostazione in-app disattivano animazioni
  CSS e rotazione del globo; controlli touch con `touch-action: manipulation`
  e aree di tocco adeguate; testi secondari su slate-300/400 per il contrasto.
- Globo: caricamento solo client con `dynamic`, DPR limitato a 1.8, rotazione
  decorativa spegnibile (impostazione/media query) per GPU e batteria.
- Ogni schermata nuova/modificata ha stati di caricamento (skeleton),
  vuoto (`EmptyState`), errore con retry (`ErrorState`) e feedback
  `role="status"`/`role="alert"` sulle azioni.
