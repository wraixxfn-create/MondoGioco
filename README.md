# 🌍 MondoGioco

Gioco geografico web in italiano con **globo 3D NASA interattivo**, **classifiche live**, **multiplayer in tempo reale** e **allenamento**.

## 🚀 Avvio rapido

Non serve configurare variabili d'ambiente o database: **Supabase è già collegato** (e l'app funziona anche offline salvando i progressi sul dispositivo).

```bash
npm install
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) e inizia subito a giocare.

## 🎮 Cosa puoi fare

- **Gioca (`/play`)** — Trova oltre 130 luoghi reali sul globo 3D con indizi progressivi, calcolo distanza Haversine e tre modalità (_Allenamento libero_, _Sfida a round_, _Contro il tempo_).
- **Allenamento (`/training`)** — Esplora stati, capitali, bandiere, popolazione e coordinate senza limiti di tempo.
- **Multiplayer (`/multiplayer`)** — Crea o unisciti a una stanza con codice a 6 caratteri e sfida gli amici in tempo reale tramite Supabase Realtime.
- **Classifiche (`/leaderboard`)** — Classifica globale, mensile e settimanale aggiornata automaticamente a fine partita.
- **Profilo (`/profile`)** — Livelli, XP, obiettivi sbloccabili e sincronizzazione opzionale su account cloud Supabase Auth.

## 🛠️ Comandi principali

```bash
npm run dev          # Avvia il server di sviluppo
npm run build        # Crea la build di produzione
npm start            # Avvia la build di produzione
npm test             # Esegue i test unitari (Vitest)
npm run test:e2e     # Esegue i test end-to-end (Playwright)
npm run lint         # Controlla la qualità del codice
```

## ⚙️ Supabase personalizzato (opzionale)

Il progetto usa già un'istanza Supabase pronta all'uso. Se in futuro vuoi collegare un tuo progetto diverso, imposta `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` ed esegui [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql).

## 📄 Licenza e crediti

Distribuito con licenza [MIT](LICENSE). Texture NASA _Blue Marble_ e dati geografici aperti documentati in [`CREDITS.md`](CREDITS.md).
