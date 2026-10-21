# Crediti, fonti dei dati e licenze

Questo file documenta la provenienza e la licenza di ogni risorsa
esterna usata da MondoGioco, come richiesto dalle rispettive licenze.

## Texture del globo terrestre

| File | Fonte | Licenza |
| --- | --- | --- |
| `public/textures/earth-day-4096.jpg` | NASA Visible Earth — "Blue Marble: Land Surface, Shallow Water, and Shaded Topography" (immagine equirettangolare 4096×2048), distribuita anche nel repository ufficiale di Three.js (`examples/textures/planets/earth_day_4096.jpg`) | **Pubblico dominio** — le immagini NASA non sono protette da diritto d'autore salvo diversa indicazione ([NASA Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)) |
| `public/textures/earth-normal-2048.jpg` | Normal map derivata dai dati topografici NASA, dal repository ufficiale di Three.js (`examples/textures/planets/earth_normal_2048.jpg`) | **Pubblico dominio** (derivata da dati NASA) |

Attribuzione consigliata dalla NASA, riportata anche in-game:
> Texture: NASA Blue Marble — Visible Earth (pubblico dominio)

## Dati geografici (luoghi del gioco)

Il dataset `data/locations.ts` (oltre 130 luoghi) contiene:

- **Nomi e coordinate**: dati geografici fattuali (capitali, città,
  monumenti, luoghi naturali) allineati ai centroidi/punti di
  riferimento pubblicati da banche dati con licenza compatibile:
  - [Natural Earth](https://www.naturalearthdata.com/) — **pubblico dominio**;
  - [GeoNames](https://www.geonames.org/) — **CC BY 4.0**
    (attribuzione: "Geographical data © GeoNames contributors",
    <https://creativecommons.org/licenses/by/4.0/>).
  Le coordinate sono arrotondate a 4 decimali (~11 m).
- **Indizi (`hints`)**: testi originali scritti appositamente per
  MondoGioco, non copiati da guide, enciclopedie o siti di terzi.
- La struttura (id, categorie, difficoltà) è originale del progetto.

Il dataset è validato automaticamente dai test
(`tests/unit/locations.test.ts`): id univoci, coordinate nei range
geografici, almeno 2 indizi per luogo, copertura di tutti i
continenti abitati, nessuna coppia di obiettivi a meno di 40 km
(per evitare round ambigui).

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
