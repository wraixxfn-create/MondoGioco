# 🌍 MondoGioco

Gioco geografico web in italiano con **globo 3D NASA interattivo**, **account e
progressione** (XP, livelli, obiettivi, streak), **classifiche** globale/settimanale/amici,
**allenamento** e **multiplayer online reale** basato su Supabase.

> Il multiplayer non usa bot, dati statici o aggiornamenti locali presentati come
> eventi di rete: stanze, round, timer, punteggi e classifica vivono nel database
> PostgreSQL e sono gestiti da funzioni server-side con Row Level Security.

## 🚀 Avvio rapido

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

- **Gioco in singolo** (`/play`, `/training`, `/profile`, `/leaderboard` in locale):
  funziona subito, senza configurazione. I progressi sono salvati sul dispositivo.
- **Multiplayer online** (`/multiplayer`): richiede un progetto Supabase configurato.
  Senza configurazione la pagina mostra un avviso esplicito e il pulsante di
  creazione stanza è disabilitato — **non** esiste una modalità "finta".

### Abilitare il multiplayer (riassunto)

```bash
cp .env.example .env.local
# inserisci Project URL + anon public key del TUO progetto Supabase
```

Poi applica le migrazioni in `supabase/migrations/` (**001 → 005**, in ordine),
abilita l'accesso anonimo e aggiungi `<origine>/auth` e `<origine>/auth/reset`
ai Redirect URLs (serve al recupero password). La guida passo passo per
principianti è in [`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

```bash
npm run verify:remote   # verifica reale: 2 utenti, stanza, round, chiusura
```

## 🎮 Cosa puoi fare

- **Gioca (`/play`)** — Oltre 130 luoghi reali sul globo 3D con indizi progressivi,
  distanza Haversine e tre modalità (_Allenamento libero_, _Sfida a round_,
  _Contro il tempo_).
- **Allenamento (`/training`)** — Stati, capitali, bandiere, popolazione e
  coordinate senza limiti di tempo.
- **Multiplayer (`/multiplayer`)** — Crea una stanza, condividi codice o link,
  lobby con stato di connessione e pronto, avvio da parte dell'host, round
  sincronizzati, risposte validate dal server, punteggi, classifica finale,
  riconnessione e passaggio di host.
- **Account (`/auth`, `/auth/reset`)** — Registrazione, login, recupero e cambio
  password via Supabase Auth. Senza configurazione i moduli sono disabilitati
  con un avviso esplicito (nessuna finta registrazione).
- **Classifiche (`/leaderboard`)** — Globale, settimanale/mensile e **amici**
  tramite RPC server-side; pareggi a pari punti con posizione condivisa.
  Senza cloud mostra **solo** i tuoi dati reali del dispositivo (nessun
  giocatore inventato).
- **Profilo (`/profile`)** — Nickname e avatar cosmetici sbloccabili, livelli e
  XP con regole documentate, 12 obiettivi accreditati una sola volta dal
  server, streak giornaliera, accuratezza, punteggio medio, record,
  statistiche per modalità, storico partite (con filtro multiplayer) e
  impostazioni (animazioni ridotte, rotazione globo) sincronizzate.

## 🛠️ Comandi

```bash
npm run dev            # server di sviluppo (porta 3000)
npm run build          # build di produzione
npm start              # build di produzione
npm test               # test unitari (jsdom) + test DB (PGlite/PostgreSQL)
npm run test:watch     # test in watch mode
npm run test:e2e       # test end-to-end (Playwright)
npm run verify:remote  # verifica sul progetto Supabase reale (richiede .env.local)
npm run lint           # ESLint
npm run type-check     # TypeScript
npm run db:seed        # rigenera la banca domande da data/countries.ts
```

## 🧱 Architettura in breve

| Livello  | Tecnologia                  | Responsabilità                                              |
| -------- | --------------------------- | ----------------------------------------------------------- |
| UI       | Next.js 16 + React 19       | Mostra snapshot del server, invia azioni via RPC            |
| Auth     | Supabase Auth               | Sessione utente (email o anonima) → ruolo `authenticated`   |
| Dati     | PostgreSQL + RLS            | Tabelle `game_*`, profili pubblici/privati                  |
| Autorità | Funzioni `security definer` | Validano fase, tempi, appartenenza; calcolano punteggi      |
| Realtime | Supabase Realtime           | Notifica i cambiamenti (il polling RPC resta come fallback) |

Dettagli su stati, timer, latenza ed errori: [`docs/MULTIPLAYER.md`](docs/MULTIPLAYER.md).
Utente, XP/livelli/obiettivi, streak, classifiche, pareggi e migrazione 005:
[`docs/PROGRESSION.md`](docs/PROGRESSION.md).
Modello di sicurezza e dati pubblici/privati: [`docs/SECURITY.md`](docs/SECURITY.md).
Strategia di test: [`docs/TESTING.md`](docs/TESTING.md).

## ⚠️ Limiti noti (dichiarati, non nascosti)

- I punteggi delle partite **in singolo** sono calcolati sul dispositivo (gioco
  offline-first). Il server ne valida solo la plausibilità: non sono una fonte
  autorevole per competizioni. Le partite **multiplayer** sono invece interamente
  calcolate dal server.
- Gli "amici" sono relazioni **"seguo"** unidirezionali per nickname pubblico
  (niente richieste/accettazioni): servono solo a comporre la classifica amici.
- La streak giornaliera cloud usa il **giorno UTC del server**, quella locale
  la data del dispositivo: vicino alla mezzanotte possono differire
  (documentato in `docs/PROGRESSION.md`).
- L'accesso ai dati Supabase usa la **anon key**, pubblica per design. La
  `service_role` key non è mai usata dal client né inclusa nel repository.
- Il rate limiting è applicativo (per utente); per protezioni anti-abuso su larga
  scala conviene aggiungere un WAF/CDN con limiti per IP.

## 📄 Licenza e crediti

Distribuito con licenza [MIT](LICENSE). Texture NASA _Blue Marble_ e dati
geografici aperti documentati in [`CREDITS.md`](CREDITS.md).
