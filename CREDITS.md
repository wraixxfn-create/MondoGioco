# Crediti, fonti dei dati e licenze

Questo file documenta la provenienza e la licenza di ogni risorsa
esterna usata da MondoGioco, come richiesto dalle rispettive licenze.

## Texture del globo terrestre

| File                                    | Fonte                                                                                                                                                                                                                                 | Licenza                                                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/textures/earth-day-4096.jpg`    | NASA Visible Earth — "Blue Marble: Land Surface, Shallow Water, and Shaded Topography" (immagine equirettangolare 4096×2048), distribuita anche nel repository ufficiale di Three.js (`examples/textures/planets/earth_day_4096.jpg`) | **Pubblico dominio** — le immagini NASA non sono protette da diritto d'autore salvo diversa indicazione ([NASA Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)) |
| `public/textures/earth-normal-2048.jpg` | Normal map derivata dai dati topografici NASA, dal repository ufficiale di Three.js (`examples/textures/planets/earth_normal_2048.jpg`)                                                                                               | **Pubblico dominio** (derivata da dati NASA)                                                                                                                                                      |

Attribuzione consigliata dalla NASA, riportata anche in-game:

> Texture: NASA Blue Marble — Visible Earth (pubblico dominio)

## Dati geografici (luoghi del gioco)

Il sistema di contenuti (`data/content/` + `lib/content/`) contiene
**3.686 luoghi**: **338 curati a mano** (pacchetti in
`data/content/packs/`) e **3.348 generati** (pacchetti in
`data/content/generated/`, ricostruiti da `npm run content:build`).

Ogni record dichiara un `sourceId` che punta al registro
`data/content/sources.ts`: nessun dato entra nel gioco senza una fonte
documentata. Nessuna coordinata, nessun luogo e nessuna informazione
storica è inventata.

### Città e capitali generate (3.348 luoghi)

| Fonte                                                                                                                                        | Cosa è usato                                                                               | Licenza                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [GeoNames](https://www.geonames.org/) — export `cities1000` (insediamenti con popolazione ≥ 1.000), via pacchetto npm `all-the-cities` (MIT) | id, nome, coordinate (arrotondate a 4 decimali, ~11 m), popolazione, codice amministrativo | **CC BY 4.0** — attribuzione: "Dati geografici © GeoNames contributors", <https://creativecommons.org/licenses/by/4.0/> |

### Controlli geometrici e denominazioni

| Fonte                                                                                           | Uso                                                                                     | Licenza              |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------- |
| [Natural Earth](https://www.naturalearthdata.com/) 1:10m, via pacchetto npm `world-atlas` (ISC) | confini di stato e linee di costa per il controllo "il punto cade nel paese dichiarato" | **Pubblico dominio** |
| `countries-list` (MIT) e `i18n-iso-countries` (MIT)                                             | nomi dei paesi in italiano/inglese e codici ISO 3166-1                                  | MIT                  |

### Pacchetti curati (338 luoghi)

- **Nomi, coordinate e dati**: allineati alle stesse banche dati sopra
  (Natural Earth, GeoNames) per le voci che vi compaiono; per monumenti,
  fiumi e siti storici si usano i punti di riferimento pubblicati dalle
  stesse fonti o da materiale di pubblico dominio.
- **Indizi (`hints`) e temi**: testi **originali** scritti per
  MondoGioco, non copiati da guide, enciclopedie o siti di terzi.
- **Struttura** (id, categorie, difficoltà, temi, revisione): originale.

I 338 record curati sono verificati uno per uno con il controllo
punto-entro-confini: 298 dentro i confini, 39 entro la tolleranza
(coste e isole), 1 senza geometria disponibile, **0 da correggere**.

### Validazione

I controlli automatici stanno in `lib/content/quality.ts` (condiviso da
test, script di generazione e pagina `/contenuti`) e nella suite
`tests/unit/content-*.test.ts`: id univoci, coordinate valide, metadati
presenti, fonte dichiarata, assenza di duplicati e di coppie di luoghi
ambigua, correttezza della selezione dei round.

Dettagli, numeri aggiornati e limiti noti: **`docs/CONTENT.md`**.

## Dataset paesi (quiz/allenamento)

`data/countries.ts`: nomi, capitali, popolazione, superficie e
coordinate sono dati fattuali di pubblico dominio (valori di
riferimento standard); le bandiere sono emoji Unicode.

## Librerie

Three.js / React Three Fiber / drei: licenza MIT.
Next.js / React: licenza MIT. Tailwind CSS: licenza MIT.
Vedi `package.json` per l'elenco completo.

## Codice del progetto

Licenza MIT — vedi il file `LICENSE`.
