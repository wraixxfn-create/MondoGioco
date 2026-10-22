# Audit di release — MondoGioco

**Data:** 22 ottobre 2026  
**Ambiente verificato:** checkout locale, Node.js v22.22.3, npm 10.9.8; nessuna configurazione Supabase/Vercel fornita.  
**Esito:** **non pronto per una release multiplayer pubblica** finché i controlli bloccanti qui sotto non vengono completati su staging. Il gioco offline ha build e test di database/unità verdi; i percorsi cloud reali non sono stati verificati.

## Checklist funzionale

### Implementato (con evidenza nel codice/test)

- [x] Homepage, navigazione, pagine Allenamento, Gioca, Profilo, Classifiche, Account e Multiplayer.
- [x] Gioco geografico in locale: allenamento libero, sfida a round e contro il tempo; globo 3D, input coordinate accessibile, distanza/punteggio, reveal e riepilogo. Dataset locale e progressi locali funzionano senza cloud.
- [x] Autenticazione email Supabase (signup/login/recovery/reset) e progressione cloud; UI disabilitata esplicitamente se Supabase manca.
- [x] Stanze multiplayer reali, lobby, pronto/avvio, round, timer DB, risposta e punteggio autorevoli, reveal, classifica finale, disconnessione/riconnessione e trasferimento host nel backend.
- [x] Statistiche, storico, XP, achievement, avatar, impostazioni, classifica e relazioni "seguo". Le classifiche locali non inventano avversari.
- [x] Migrazioni SQL 001–005; rate-limit per utente; test DB con PGlite, inclusi RLS, unicità/duplicati, round fuori fase e autorizzazioni.
- [x] Texture NASA locali e fallback grafico; il globo è caricato dinamicamente, solo lato client.

### Non dimostrato / incompleto per il rilascio

- [ ] **Signup/login/profilo cloud reale e sessione scaduta/refresh** con un progetto Supabase: non verificati, mancano URL/key e utenti di test. I test browser esistenti in assenza di cloud controllano soprattutto gli stati espliciti/offline, non una sessione email reale né la scadenza JWT sul servizio hosted.
- [ ] **Partita multiplayer hosted completa** con due browser fino alla classifica finale: il test Playwright è ora impostato per completare 3 round, ma richiede Supabase e browser installato; non è stato eseguito con successo in questo ambiente.
- [ ] **Disconnessione/riconnessione browser reale** su rete instabile: coperta da test del motore DB/RPC, non da un test E2E browser end-to-end.
- [ ] **Tentativi ostili su servizio hosted** (modifica punteggio e accesso stanza privata): test DB locali verificano permessi/RLS e il rifiuto di scritture arbitrarie, ma la verifica remota (`verify:remote`) non è stata eseguita.
- [ ] Provider Auth Anonymous, conferma email, redirect, publication Realtime, job di manutenzione e limiti del progetto Supabase devono essere configurati e provati nel progetto scelto.
- [ ] Nessuna metrica di carico, memoria o FPS raccolta su smartphone fisico; nessun piano/indice verificato con `EXPLAIN ANALYZE` sul volume reale.
- [ ] Nessun dominio/Vercel collegato e nessun deploy pubblico eseguito. La procedura è in [`DEPLOYMENT.md`](DEPLOYMENT.md).
- [ ] Nessun sink centralizzato di error monitoring (Sentry o equivalente). È presente un boundary UI con diagnostica locale privacy-safe; il logging strutturato server-side/monitoring va configurato dal gestore.

## Checklist tecnica richiesta

### Compilazione, test e dipendenze

- [x] `npm run lint` — **PASS** (0 errori, 0 warning: risolta la dipendenza mancante di `handleNext` nell'effetto di auto-avanzamento di `/play`).
- [x] `npm run format:check` — **PASS**: Prettier applicato a tutto il repository e aggiunto al workflow CI.
- [x] `npm run type-check` — **PASS**.
- [x] `npm test` — **PASS: 13 file, 221 test** (test unitari e test DB su PGlite).
- [x] `npm run build` — **PASS**, Next.js 16.4.2, tutte le route compilate e prerenderizzate.
- [x] Smoke test della build con `npm start` e richiesta HTTP locale — `200 OK`, HTML 23.690 byte; verificati `nosniff`, `DENY`, `strict-origin-when-cross-origin` e `Permissions-Policy` attesi.
- [x] `npm run test:e2e` — **PASS in CI** (workflow `CI`, esecuzione sul branch `arena/ad8ba497-mondogioco`): 22 test su 4 file, progetti `chromium` e `mobile-chromium`. La suite precedente selezionava etichette della UI pre-redesign e falliva; i test `game`, `navigation` e `cloud-features` sono stati riscritti sulle etichette attuali (radio delle modalità, coordinate manuali, riepilogo, classifica, menu mobile) e i fallimenti E2E vengono ora pubblicati come annotazioni GitHub. Questo sandbox di sviluppo non può scaricare Chromium, quindi l'esecuzione browser resta delegata alla CI.
- [ ] `npm run verify:remote` — **BLOCCATO**: exit code 2 atteso dallo script per credenziali Supabase assenti. Non ha eseguito richieste né modificato un ambiente remoto.
- [x] `npm audit --omit=dev` — **0 vulnerabilità runtime**.
- [ ] `npm audit` completo — **5 finding high, tutti nella toolchain dev**: `braces <=3.0.3` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`. Il registry disponibile in questo ambiente non offre una versione patch di `braces`; il fix automatico suggerito da npm degraderebbe `eslint-config-next` a 14.x, incompatibile con la toolchain Next 16. Non è stato applicato un downgrade forzato. Ri-verificare l'audit e aggiornare la catena non appena esiste un fix compatibile.
- [x] Aggiornati React e React DOM al patch `19.3.1`; Next/ESLint config restano allineati a `16.4.2`. `npm ci` riproduce l'installazione.
- [ ] ESLint 9.39.5 è marcato deprecato da npm; il salto a ESLint 10 non è compatibile coi peer ranges dei plugin React/Import/JSX-A11y inclusi in `eslint-config-next@16.4.2` (npm riporta installazione `invalid`). È stato ripristinato ESLint 9 e verificato lint; aggiornare quando la toolchain Next/plugin supporta il nuovo major senza peer mismatch.

### Sicurezza e robustezza

- [x] Il client usa solo URL e anon/publishable key Supabase: la anon key è pubblica per definizione e la sicurezza dipende da RLS. `.env.example` non contiene più un campo service-role da copiare per errore. `.env*` è ignorato da Git.
- [x] Migrazioni 002–005 separano profilo/email/domande/soluzioni in `app_private`; tabelle pubbliche di gioco hanno letture ristrette via RLS e le scritture passano da RPC `SECURITY DEFINER` con permessi revocati.
- [x] Test DB coprono autorizzazione owner/host/membro, letture private, round futuri, risposta duplicata, input risposta fuori opzioni, rate limit per utente, idempotenza e concorrenza/lock delle RPC.
- [x] Validazione input nel client (funzioni dedicate, senza dipendenza Zod: il vecchio modulo `lib/validators` era usato solo dai test ed è stato rimosso) e controlli nel database; coordinate geografiche validate nel gioco singolo; React effettua escaping dei testi renderizzati.
- [x] API/error states trattati nell'interfaccia; aggiunto `app/error.tsx` con retry e diagnostica che non registra messaggio o stack potenzialmente sensibili. Aggiunti `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `Permissions-Policy` in Next config; aggiunto controllo header E2E (non eseguito nel sandbox).
- [ ] Non è configurata una Content Security Policy (CSP) né HSTS esplicito. Definire CSP testata con Next/Supabase e attivare HSTS dopo la decisione sul dominio HTTPS, prima della release pubblica.
- [ ] Nessun limite di abuso per IP/WAF: il rate limiting per account non impedisce attacchi distribuiti o account anonimi multipli. Usare limiti provider/CDN, alert e CAPTCHA/risk control solo se il traffico lo richiede.
- [ ] Nessun test di penetrazione sul progetto remoto né verifica automatica delle policy RLS hosted. Ripetere `verify:remote` e i controlli SQL dopo ogni deploy di migrazioni.
- [ ] Streak locale usa il tempo del dispositivo; punteggi singoli offline sono validati per plausibilità al sync ma non sono prova antifrode. Non usarli come premi/competizione monetaria.
- [ ] Dati pubblici di leaderboard (nickname/avatar/livello/punteggi) sono aggregati ma identificabili con nickname. Definire retention, informativa privacy/consenso e procedura cancellazione account prima del lancio pubblico.

### Query, performance, responsive e componenti

- [x] Indici presenti per codice/fase stanza, membri/risposte/eventi, profilo/sessioni e idempotenza; query principali sono confinate nel DB. Le funzioni leaderboard aggregano le sessioni e i costi dipenderanno dal volume.
- [ ] Non è possibile certificare efficienza delle query senza dati e `EXPLAIN (ANALYZE, BUFFERS)` del progetto reale; verificare crescita di `profile_sessions`, `game_events`, `rate_limits` e politiche di retention.
- [x] Asset texture presenti in varianti WebP dimensionate: day 2048 circa 156 KiB (1024 circa 46 KiB su mobile/risparmio dati), normal 1024 circa 35 KiB; caricamento on-demand dentro il globo, normal map solo su schermi larghi. Il globo è `dynamic(..., { ssr:false })`, con fallback, DPR ridotto, rotazione configurabile e loop WebGL sospeso fuori schermo/scheda nascosta.
- [ ] Il bundle statico prodotto dalla build contiene 22 chunk JS; gli script referenziati nell'HTML prerenderizzato home sono circa 938 kB non compressi / 264 kB gzip e la pagina Gioca circa 1009 kB / 289 kB gzip (misura 22 ottobre 2026, dopo la rimozione di 4 dipendenze inutilizzate e l'aggiunta del client Supabase). Le texture sono ~237 KiB. `browserslist` non è stato aggiunto: una prova con target moderni non ha ridotto il bundle (`next`/`react-dom` sono precompilati), quindi non è stato introdotto un cambio senza beneficio misurato. Sono misure da filesystem della build, non una cattura di rete: chunk caricati dinamicamente, caching, TTFB e tempo di avvio vanno misurati con Lighthouse/DevTools su un deploy; FPS/heap vanno misurati su smartphone reale.
- [x] Test Playwright già includono viewport mobile 390×844, overflow orizzontale e controlli touch, ma l'esecuzione in questo ambiente è bloccata dall'installazione browser.
- [x] Componenti React applicativi sotto `components/` sono importati dalle pagine/layout. I file SVG standard (`file.svg`, `next.svg`, `vercel.svg`, `window.svg`, `globe.svg`) in `public/` risultano asset generici non referenziati dal codice; impatto trascurabile, lasciati invariati.
- [x] Mancavano un workflow CI e un config minimo Supabase CLI: aggiunti `.github/workflows/ci.yml` e `supabase/config.toml`.

## Gate prima della release pubblica

- [ ] Audit dependency aggiornato; finding high dev risolti o eccezione accettata formalmente e non presente nella catena di produzione.
- [ ] Staging Supabase nuovo, migrazioni controllate e `verify:remote` tutto verde.
- [ ] Auth email/anon, redirect, privacy/retention, Realtime e manutenzione provati.
- [ ] Playwright Chromium + mobile passano; test cloud signup/login/profilo, partita multiplayer completa e reconnect completati su staging.
- [ ] Build Vercel production, HTTPS/dominio, secret/env, alert/log retention e rollback verificati.
- [ ] Smoke test manuale da due dispositivi e approvazione del proprietario per ogni operazione sul database di produzione.

---

## Ciclo di hardening 2026-10-22 (migrazione 006 + correzioni client)

Questa sezione registra il secondo passaggio di audit. Le prove sono state eseguite su questo checkout; **nessun test E2E è stato eseguito in locale** (download Chromium bloccato dalla rete del sandbox) e nessun progetto Supabase reale è stato contattato.

### Difetti corretti (per gravità)

**Critici**

1. **Fuga dei punteggi live in multiplayer.** `game_room_members` era leggibile via PostgREST dai membri e pubblicata su Realtime: durante un round si potevano leggere i `score` già assegnati, aggirando la mascheratura dello snapshot. La 006 revoca la SELECT, rimuove la tabella dalla publication e il client smette di sottoscriverla (i cambi di membri arrivano da `game_rooms.version`).
2. **Blocco della stanza all'avvio partita.** Se la banca domande non copriva i round richiesti, `start_game` inseriva round parziali e la stanza restava in `round_active` senza poter ripartire. Ora la capienza è verificata prima delle scritture e l'errore è `MG500:round_generation_failed` (ritentabile).
3. **Partite perfette rifiutate.** Il limite di plausibilità era 5.000 punti/round, ma il motore assegna fino a 6.250 con combo ×1,25: una partita legittima non veniva registrata. Allineati i limiti (score ≤ round×6.250, round ≤ 200) e gli XP vengono ricalcolati dal server.

**Importanti**

4. **Risposta rifiutata a un giocatore attivo.** Un heartbeat marcava `disconnected` un client con timer in background; `submit_answer` ora ripristina la presenza su richiesta autenticata durante il round.
5. **Errore RLS mascherato da errore di rete.** `mapTransportError` restituiva `NETWORK` anche per violazioni RLS/JWT: la UI riprovava all'infinito senza mostrare la causa. Ora distingue `MG403:permission_denied` e `SESSION`.
6. **Crash/hang del profilo con dati corrotti.** `calculateLevel(NaN)` non terminava (loop infinito, pagina congelata); contatori NaN/stringhe in localStorage avvelenavano XP e classifiche. Aggiunte guardie (`Number.isFinite`, tetto livello 200) e normalizzazione di profilo e sessioni.
7. **Progressi cloud che sparivano al login.** Se il profilo cloud aveva contatori inferiori al locale (es. account usato su un altro dispositivo), il merge poteva mostrare valori del dispositivo sbagliato; inoltre il logout non ripristinava lo stato. Merge per massimo documentato + gestione sessione assente.
8. **Missioni impossibili e ricompense finte.** Le missioni misuravano campi inesistenti (`continents`, serie mai calcolata) e mostravano "+XP" senza che nulla venisse accreditato. Ora misurano dati reali (`bullseyes`, `bestStreak`, miglior run survival) e sono dichiarate come obiettivi di pratica senza XP.
9. **Heartbeat che riscriveva la stanza a ogni battito** (8 giocatori ≈ 2,7 scritture/s + eventi Realtime a cascata): scritture solo se la presenza è stantia.
10. **Doppia registrazione delle partite** in caso di errore di rete dopo una chiamata andata a buon fine: il retry con firma vecchia avviene solo sugli errori "funzione mancante".

**Minori**

11. Errori di salvataggio cloud silenziosi nel riepilogo → ora mostrati con `syncError`; uscita dalla stanza con errore ignorato → ora segnalata; timer del round che usava `Date.now()` invece dell'orologio del server → corretto.
12. `Modal` senza focus trap/Escape/ripristino focus; header con polling ogni 2 s (ora event-driven); globo che continuava a renderizzare fuori schermo; texture 4096 JPG (462 KB) scaricata anche su mobile.
13. Codice/dipendenze inutilizzate rimosse: `framer-motion`, `react-icons`, `@supabase/ssr`, `zod`, `lib/supabase/server.ts`, `lib/validators`, `lib/utils/quiz-generator.ts` e i tipi del vecchio quiz. Nessuna funzionalità è stata rimossa: erano rami non raggiungibili.

### Verifiche eseguite (22 ottobre 2026)

| Comando                | Esito                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `npm ci`               | 521 pacchetti, nessun errore                                                                       |
| `npx tsc --noEmit`     | 0 errori                                                                                           |
| `npx eslint .`         | 0 errori, 0 warning                                                                                |
| `npx vitest run`       | **13 file, 191 test, tutti passati** (unit + DB PGlite, ~111 s)                                    |
| `npm run format:check` | tutti i file conformi                                                                              |
| `npm run build`        | build di produzione OK, 11 route statiche                                                          |
| `npm run test:e2e`     | **non eseguito**: Chromium non scaricabile in questo ambiente (ECONNRESET); resta delegato alla CI |

Test DB aggiunti in questo ciclo (`tests/db/audit-regressions.test.ts`, 11 casi): cap punteggio/XP, rifiuto bullseye/serie incoerenti, sessione lunga, avvio con banca insufficiente, nessuna lettura diretta dei punteggi, risposta di un giocatore marcato disconnesso, heartbeat senza riscritture, partita completa a 2 giocatori con registrazione una sola volta, isolamento tra stanze simultanee.

### Rischi residui (invariati)

- E2E browser e partita hosted su staging non eseguiti in questo ambiente; la CI resta l'unica prova browser.
- Nessuna CSP/HSTS, nessun limite per IP/WAF, nessun sink di monitoring centralizzato.
- Rate limit per account: più account anonimi possono ancora generare stanze; servono limiti provider/CDN se il traffico lo richiede.
- Punteggi offline restano plausibilità, non prova antifrode.
- Migrazione 006 non applicata ad alcun ambiente remoto: va provata su staging prima della produzione.
