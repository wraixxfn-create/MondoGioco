# 🌍 MondoGioco

**Esplora il mondo giocando** — Un gioco geografico web con globo 3D interattivo, quiz, multiplayer e classifiche.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Caratteristiche

- 🌍 **Globo 3D interattivo** — Esplora il mondo in tre dimensioni con React Three Fiber
- 🎯 **Quiz multipli** — Capitali, bandiere, posizione, continenti e popolazione
- 🎮 **Multiplayer in tempo reale** — Sfida amici e giocatori online con Supabase Realtime
- 🏆 **Classifiche** — Scala la classifica globale e guadagna XP
- 📈 **Progressione** — Sistema di livelli, obiettivi e statistiche dettagliate
- 📚 **Modalità allenamento** — Studia i paesi senza pressione
- 📱 **Responsive** — Ottimizzato per desktop, tablet e smartphone
- 🎨 **Tema scuro elegante** — UI moderna con animazioni fluide
- ♿ **Accessibile** — Supporto keyboard navigation e screen reader

## 🚀 Demo

Il progetto è configurato per funzionare localmente. Segui le istruzioni di installazione per avviarlo.

## 📋 Prerequisiti

- **Node.js** 22.x o superiore
- **npm** 10.x o superiore
- Un account **Supabase** (gratuito) per le funzionalità multiplayer e autenticazione

## 🛠️ Installazione

### 1. Clona il repository

```bash
git clone https://github.com/tuo-username/MondoGioco.git
cd MondoGioco
```

### 2. Installa le dipendenze

```bash
npm install
```

### 3. Configura le variabili d'ambiente

Copia il file `.env.example` in `.env.local`:

```bash
cp .env.example .env.local
```

### 4. Configura Supabase (opzionale ma consigliato)

Per abilitare autenticazione, multiplayer e classifiche:

1. Crea un progetto su [Supabase](https://supabase.com)
2. Copia le credenziali dal dashboard (Settings → API)
3. Aggiorna `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. Esegui la migration del database:
   - Vai su Supabase Dashboard → SQL Editor
   - Copia e incolla il contenuto di `supabase/migrations/001_initial_schema.sql`
   - Esegui la query

### 5. Avvia il server di sviluppo

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) nel browser.

## 📦 Comandi disponibili

```bash
# Sviluppo
npm run dev              # Avvia il server di sviluppo con Turbopack
npm run build            # Crea la build di produzione
npm run start            # Avvia il server di produzione

# Qualità del codice
npm run lint             # Esegui ESLint
npm run lint:fix         # Correggi automaticamente gli errori ESLint
npm run format           # Formatta il codice con Prettier
npm run format:check     # Verifica la formattazione
npm run type-check       # Verifica i tipi TypeScript

# Test
npm run test             # Esegui i test unitari con Vitest
npm run test:watch       # Esegui i test in modalità watch
npm run test:e2e         # Esegui i test end-to-end con Playwright
npm run test:e2e:install # Installa i browser per Playwright
```

## 🏗️ Struttura del progetto

```
MondoGioco/
├── app/                          # Next.js App Router
│   ├── page.tsx                  # Homepage
│   ├── play/                     # Pagina Gioca (quiz)
│   ├── training/                 # Modalità allenamento
│   ├── multiplayer/              # Stanze multiplayer
│   ├── leaderboard/              # Classifiche
│   ├── profile/                  # Profilo utente
│   ├── api/                      # API routes
│   ├── layout.tsx                # Layout principale
│   └── globals.css               # Stili globali
│
├── components/
│   ├── globe/                    # Componenti globo 3D
│   │   ├── Globe.tsx             # Globo interattivo
│   │   └── GlobeHero.tsx         # Globo per homepage
│   ├── ui/                       # Componenti UI riutilizzabili
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── Timer.tsx
│   │   └── StatusStates.tsx      # Loading, Error, Empty
│   ├── layout/                   # Header e Footer
│   ├── quiz/                     # Componenti quiz
│   └── multiplayer/              # Componenti multiplayer
│
├── lib/
│   ├── supabase/                 # Client Supabase
│   │   ├── client.ts             # Client browser
│   │   ├── server.ts             # Client server
│   │   └── middleware.ts         # Client middleware
│   ├── validators/               # Schemi Zod
│   │   └── index.ts
│   └── utils/                    # Utility functions
│       ├── index.ts              # Funzioni helper
│       ├── quiz-generator.ts     # Generatore quiz
│       └── id.ts                 # Generatore ID
│
├── types/                        # Tipi TypeScript
│   ├── index.ts                  # Tipi principali
│   └── database.ts               # Tipi database Supabase
│
├── data/                         # Dati statici
│   └── countries.ts              # Dataset paesi
│
├── tests/
│   ├── unit/                     # Test unitari (Vitest)
│   └── e2e/                      # Test E2E (Playwright)
│
├── supabase/
│   └── migrations/               # Migrazioni database
│       └── 001_initial_schema.sql
│
└── Configuration files
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── vitest.config.ts
    ├── playwright.config.ts
    └── eslint.config.mjs
```

## 🎮 Come giocare

### Modalità Singolo Giocatore

1. Vai su **Gioca**
2. Scegli il tipo di quiz:
   - **Capitali** — Indovina la capitale del paese
   - **Bandiere** — Riconosci la bandiera
   - **Posizione** — Clicca sul globo per indicare dove si trova il paese
   - **Continenti** — Indovina il continente
   - **Popolazione** — Quale paese ha più abitanti?
3. Seleziona la difficoltà (Facile, Medio, Difficile)
4. Scegli il numero di domande (5, 10, 15, 20)
5. Rispondi più velocemente possibile per ottenere più punti!

### Modalità Allenamento

- Vai su **Allenamento**
- Esplora i paesi del mondo senza pressione
- Filtra per continente o cerca per nome
- Clicca su un paese per vedere i dettagli

### Multiplayer

1. Vai su **Multiplayer**
2. **Crea una stanza**:
   - Scegli nome, tipo di quiz e difficoltà
   - Condividi il codice stanza con i tuoi amici
3. **Unisciti a una stanza**:
   - Inserisci il codice stanza di 6 caratteri
4. Aspetta che tutti i giocatori siano pronti
5. Inizia la sfida!

### Classifiche e Progressione

- Guadagna XP per ogni partita giocata
- Sali di livello e sblocca nuovi obiettivi
- Scala la classifica globale
- Monitora le tue statistiche nel profilo

## 🧪 Testing

Il progetto include test unitari e end-to-end:

```bash
# Esegui tutti i test unitari
npm run test

# Esegui i test in modalità watch durante lo sviluppo
npm run test:watch

# Esegui i test E2E (richiede browser installati)
npm run test:e2e:install  # Solo la prima volta
npm run test:e2e
```

**Copertura test:**
- ✅ 72 test unitari passati
- ✅ Utility functions
- ✅ Validatori Zod
- ✅ Generatore quiz
- ✅ Dataset paesi
- 🎭 Test E2E per navigazione e UI

## 🚀 Deployment

### Vercel (Consigliato)

1. Push del codice su GitHub
2. Importa il progetto su [Vercel](https://vercel.com)
3. Configura le variabili d'ambiente nel dashboard Vercel
4. Deploy automatico!

### Altri provider

```bash
npm run build
npm run start
```

Il progetto è compatibile con qualsiasi provider che supporti Node.js.

## 🔧 Configurazione avanzata

### Personalizzazione quiz

Modifica `lib/utils/quiz-generator.ts` per:
- Aggiungere nuovi tipi di quiz
- Modificare i limiti di tempo
- Cambiare la logica di generazione domande

### Aggiungere paesi

Modifica `data/countries.ts` per:
- Aggiungere nuovi paesi
- Modificare le coordinate
- Aggiornare le informazioni

### Temi e stili

Modifica `app/globals.css` per:
- Cambiare i colori del tema
- Aggiungere animazioni personalizzate
- Modificare le variabili CSS

## 🤝 Contribuire

Contribuzioni sono benvenute! Per contribuire:

1. Fork del repository
2. Crea un branch per la tua feature (`git checkout -b feature/AmazingFeature`)
3. Commit delle modifiche (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Apri una Pull Request

### Linee guida

- Segui le convenzioni di codice esistenti
- Aggiungi test per le nuove funzionalità
- Aggiorna la documentazione se necessario
- Esegui `npm run lint` e `npm run test` prima di commitare

## 📄 Licenza

Questo progetto è distribuito con licenza MIT. Vedi il file `LICENSE` per maggiori dettagli.

## 🙏 Ringraziamenti

- **Next.js** — Framework React
- **React Three Fiber** — Rendering 3D
- **Supabase** — Backend as a Service
- **Tailwind CSS** — Utility-first CSS
- **Three.js** — Libreria 3D

## 📧 Contatti

Per domande, suggerimenti o segnalazioni di bug, apri una issue su GitHub.

---

**Fatto con ❤️ in Italia**
