# Build, database e deploy

Questa procedura prepara una prima pubblicazione senza applicare modifiche a servizi remoti. **Non eseguire `db push` su produzione senza backup e approvazione esplicita.** Il repository non è collegato a un progetto Supabase, account Vercel o dominio: nessun deploy è stato eseguito.

## 1. Requisiti e avvio locale

- Node.js 22 (o almeno la versione LTS supportata dal team) e npm.
- Per solo gioco singolo, nessun account o servizio esterno.
- Per account cloud/multiplayer, progetto Supabase con migrations 001–005, Auth configurato e env del progetto.

```bash
npm ci
npm run dev
# http://localhost:3000
```

Copia `.env.example` in `.env.local` solo se hai un progetto Supabase. Inserisci esclusivamente URL e anon/publishable key dal pannello API. La anon key è pubblica ed è destinata al browser. **Non aggiungere mai `service_role` in `NEXT_PUBLIC_*`, `.env.example`, GitHub Actions o Vercel client env.** L'app e `verify:remote` non ne hanno bisogno.

```bash
npm run lint
npm run type-check
npm test
npm run build
npm start
```

L'ordine consigliato per convalidare il codice è lint → type-check → test → build. `npm start` avvia la build appena prodotta. Le prove E2E richiedono Playwright/Chromium:

```bash
npx playwright install chromium
npm run test:e2e
```

Se l'installazione del browser non è disponibile sulla rete locale, non dichiarare l'E2E passato; usare CI con i browser Playwright installati. I test multiplayer online richiedono anche env Supabase e provider Anonymous attivo.

## 2. Configurare Supabase in staging

1. Crea un progetto **staging** in una regione UE e conserva le credenziali DB fuori dal repository.
2. Configura URL e anon key in `.env.local` e riavvia Next.
3. Applica in ordine le migrazioni `supabase/migrations/001_...sql` → `005_...sql`. Sono migrazioni versionate; `supabase/config.toml` è il config minimo CLI aggiunto al progetto.
4. Auth → Providers: abilita Email e Anonymous (necessario agli ospiti multiplayer). Scegli deliberatamente se richiedere conferma email; verifica l'invio SMTP per non usare il servizio email di default in produzione.
5. Auth → URL Configuration: Site URL staging e Redirect URLs esatti per staging, `http://localhost:3000/auth` e `http://localhost:3000/auth/reset` in sviluppo. Aggiungi dominio production e reset URL dopo averlo deciso; evita redirect wildcard permissivi in produzione.
6. Database → Replication: verifica `game_rooms`, `game_room_members`, `game_rounds` e `game_events` in `supabase_realtime`. Se Realtime non è abilitato, il client usa il polling fallback, ma bisogna comunque verificare il comportamento in condizioni reali.
7. (Consigliato) abilita `pg_cron` e pianifica `public.maintenance_tick()` ogni minuto per pulizia anche quando nessun client è aperto; il contratto SQL è documentato in `docs/SUPABASE_SETUP.md`.
8. Esegui i test non distruttivi:

```bash
npm run verify:remote
```

Lo script crea sessioni anonime e una stanza di prova nel progetto target. Eseguirlo solo su staging o con approvazione, perché non è un test puramente read-only. In seguito esegui Playwright con due contesti reali e controlla che stanza/risultati siano archiviati secondo la policy. I test DB PGlite non sostituiscono la verifica hosted di RLS, grants, Auth e Realtime.

### Migrazioni CLI (staging prima, produzione poi)

Da una checkout con Supabase CLI disponibile:

```bash
npx supabase login
npx supabase link --project-ref <project-ref-staging>
npx supabase db push --dry-run
# Controlla ogni migration proposta, il progetto linkato e lo stato remoto.
npx supabase db push
npm run verify:remote
```

Il `project-ref` non è un segreto; il login CLI deve rimanere locale e non va copiato nei log. Usa un progetto staging vuoto per la prima prova. Migrazioni 002/003 rimuovono tabelle legacy permissive; prima di riutilizzare un database storico, fai backup ed esporta i dati interessati: alcune tabelle legacy vengono eliminate. In produzione, verifica lo stato con CLI e backup PITR/snapshot prima dell'applicazione; non usare `db reset` su remoto.

## 3. Build/deploy Vercel

Il repository è una Next.js App Router app: Vercel normalmente rileva framework e comando di build. Non è necessario committare `vercel.json`; non aggiungere opzioni di output statico (`output: export`), perché l'app usa funzionalità Next e client dinamici.

1. Importa il repository GitHub in Vercel; root directory è la root del repo, install command `npm ci`, build command `npm run build`, output automatico Next.js.
2. Crea prima un deploy Preview e collega le env del progetto **staging**. Imposta solo:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Verifica lint/typecheck/test/build in CI e smoke test sul Preview. Usa un progetto Supabase distinto dal production per Preview; non collegare preview casuali al DB production.
4. Aggiungi gli stessi due valori alle env **Production** usando il progetto production. Queste due env sono pubbliche nel bundle per design: sicurezza garantita da RLS/grants, non dal segreto della key.
5. Imposta in Supabase Site URL e Redirect URLs del dominio effettivo. Associa un dominio in Vercel se disponibile; Vercel fornisce certificato HTTPS quando il DNS è verificato. Nessun dominio è stato fornito o configurato in questa sessione.
6. Distribuisci una build preview, poi promuovi a Production solo dopo tutti i gate di `docs/RELEASE_AUDIT.md`. Usa `npm run verify:remote` soltanto contro staging prima della release; per production esegui prima controlli di sola lettura e smoke test approvati.

Il deploy GitHub/Vercel e la configurazione dei secrets non sono stati effettuati da questo agente: richiedono un workspace/progetto e approvazione del proprietario.

## 4. CI e log

`.github/workflows/ci.yml` esegue `npm ci`, install browser, lint, type-check, test unit/DB, build e Playwright desktop/mobile su push e pull request. I test cloud rimangono saltati se gli env non sono presenti; un CI verde da solo non certifica la partita hosted. Non aggiungere credenziali di produzione al workflow. Se si aggiunge in futuro E2E cloud, usare un progetto staging e secrets con permessi minimi.

- Vercel mostra log di build e server runtime; filtrare per deployment/time window e non inserire chiavi/token in log.
- Il boundary `app/error.tsx` mostra un fallback e scrive solo un digest non identificante nella console browser; **non è un sistema di raccolta centralizzato**. Configurare e provare Sentry o servizio equivalente (filtri PII, sampling, retention, alert) prima del traffico pubblico se si richiede osservabilità client.
- Abilitare alert su errori Auth/DB, quota Supabase, Realtime e rate limit. Non registrare email, JWT, password, risposte private o payload completi di richieste.

## 5. Rollback e aggiornamenti DB

### Codice

In Vercel seleziona il deployment Production precedente noto-buono e promuovilo secondo la procedura del team. Verifica homepage, `/play`, `/auth`, `/profile` e `/multiplayer`. Il ritorno del codice non annulla migrazioni DB.

### Database

Non esiste una serie automatica di migrazioni down. Preferire correzioni additive/forward-fix. Prima di un aggiornamento: backup/PITR verificabile, dry run CLI, conferma project-ref, staging completo, piano per dati e compatibilità vecchio/nuovo codice. Se si deve ripristinare dati, usare la procedura backup/PITR del provider con approvazione e consapevolezza della perdita di scritture successive allo snapshot. Non modificare manualmente la cronologia migration per far apparire il deploy riuscito.

## 6. Checklist di prima partita multiplayer pubblica

- [ ] Production URL e anon key corrette nelle env Vercel; nessun service-role nel browser/build.
- [ ] Le migrazioni 001–005 sono applicate e stato/backup confermati.
- [ ] RLS attiva, grants controllati; le policy private sono state validate su hosted DB.
- [ ] Anonymous Auth e Email Auth secondo policy, redirect HTTPS esatti, email di conferma/recovery ricevuta davvero.
- [ ] Realtime pubblica le tabelle previste; polling fallback osservato.
- [ ] Due browser/dispositivi con sessioni distinte entrano nella stessa stanza; host avvia; entrambi rispondono a tutti i round; entrambi vedono punteggi e classifica finale corretti.
- [ ] In un browser terzo: stanza privata non leggibile; update diretto di `game_rooms`/punteggi negato; risposta duplicata e tardiva rifiutate.
- [ ] Interrompere rete a un giocatore, ripristinarla e verificare stato coerente, round corrente e assenza di punteggio doppio.
- [ ] Verificare chiusura lobby abbandonata, trasferimento host e maintenance tick/cron.
- [ ] Smoke test da smartphone medio: niente overflow, navigazione touch, globo con/ senza texture, FPS e temperatura accettabili.
- [ ] Controllare errori/alert, quota, tasso di join e contenuti di log; provare rollback del codice su Preview.
- [ ] Privacy notice, retention/cancellazione account, supporto e responsabile operativo pubblicati prima di invitare utenti.
