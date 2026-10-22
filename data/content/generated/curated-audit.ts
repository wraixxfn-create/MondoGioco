// ============================================================
// curated-audit.ts — esito del controllo punto-entro-confini
// ============================================================
// FILE GENERATO da `npm run content:build` — NON MODIFICARE A MANO.
// Le correzioni si fanno nelle fonti o nello script di generazione.
//
// Fonte dati: GeoNames cities1000 (CC BY 4.0) via pacchetto npm
//   `all-the-cities` (MIT) — © GeoNames contributors.
// Geometrie di controllo: Natural Earth 1:10m (pubblico dominio) via
//   pacchetto npm `world-atlas` (ISC).
// Denominazioni: `i18n-iso-countries` (MIT) e `countries-list` (MIT).
// Generato il 2026-10-22 · versione contenuti 1.0.0.
// ============================================================
import type { GeoCheckResult } from "../schema";

export interface CuratedGeoAuditEntry {
  geoCheck: GeoCheckResult;
  borderDistanceKm?: number;
}

export const CURATED_GEO_AUDIT: Record<string, CuratedGeoAuditEntry> = {
  roma: {
    geoCheck: "inside",
  },
  parigi: {
    geoCheck: "inside",
  },
  londra: {
    geoCheck: "inside",
  },
  berlino: {
    geoCheck: "inside",
  },
  madrid: {
    geoCheck: "inside",
  },
  lisbona: {
    geoCheck: "inside",
  },
  amsterdam: {
    geoCheck: "inside",
  },
  vienna: {
    geoCheck: "inside",
  },
  atene: {
    geoCheck: "inside",
  },
  stoccolma: {
    geoCheck: "inside",
  },
  oslo: {
    geoCheck: "inside",
  },
  helsinki: {
    geoCheck: "inside",
  },
  copenaghen: {
    geoCheck: "near",
    borderDistanceKm: 1.2,
  },
  varsavia: {
    geoCheck: "inside",
  },
  praga: {
    geoCheck: "inside",
  },
  budapest: {
    geoCheck: "inside",
  },
  reykjavik: {
    geoCheck: "inside",
  },
  dublino: {
    geoCheck: "inside",
  },
  mosca: {
    geoCheck: "inside",
  },
  kiev: {
    geoCheck: "inside",
  },
  bruxelles: {
    geoCheck: "inside",
  },
  berna: {
    geoCheck: "inside",
  },
  istanbul: {
    geoCheck: "inside",
  },
  barcellona: {
    geoCheck: "inside",
  },
  venezia: {
    geoCheck: "near",
    borderDistanceKm: 0.3,
  },
  edimburgo: {
    geoCheck: "inside",
  },
  "torre-pisa": {
    geoCheck: "inside",
  },
  "mont-saint-michel": {
    geoCheck: "inside",
  },
  alhambra: {
    geoCheck: "inside",
  },
  stonehenge: {
    geoCheck: "inside",
  },
  meteore: {
    geoCheck: "inside",
  },
  "monte-bianco": {
    geoCheck: "inside",
  },
  etna: {
    geoCheck: "inside",
  },
  "lago-bled": {
    geoCheck: "inside",
  },
  nordkapp: {
    geoCheck: "near",
    borderDistanceKm: 2.2,
  },
  lofoten: {
    geoCheck: "inside",
  },
  santorini: {
    geoCheck: "inside",
  },
  malta: {
    geoCheck: "inside",
  },
  tokyo: {
    geoCheck: "inside",
  },
  pechino: {
    geoCheck: "inside",
  },
  shanghai: {
    geoCheck: "inside",
  },
  "nuova-delhi": {
    geoCheck: "inside",
  },
  mumbai: {
    geoCheck: "inside",
  },
  seul: {
    geoCheck: "inside",
  },
  bangkok: {
    geoCheck: "inside",
  },
  singapore: {
    geoCheck: "inside",
  },
  giacarta: {
    geoCheck: "inside",
  },
  hanoi: {
    geoCheck: "inside",
  },
  "kuala-lumpur": {
    geoCheck: "inside",
  },
  "hong-kong": {
    geoCheck: "near",
    borderDistanceKm: 23.8,
  },
  taipei: {
    geoCheck: "inside",
  },
  kyoto: {
    geoCheck: "inside",
  },
  baghdad: {
    geoCheck: "inside",
  },
  teheran: {
    geoCheck: "inside",
  },
  riyad: {
    geoCheck: "inside",
  },
  dubai: {
    geoCheck: "inside",
  },
  gerusalemme: {
    geoCheck: "inside",
  },
  kathmandu: {
    geoCheck: "inside",
  },
  ulaanbaatar: {
    geoCheck: "inside",
  },
  fuji: {
    geoCheck: "inside",
  },
  everest: {
    geoCheck: "inside",
  },
  "ha-long": {
    geoCheck: "near",
    borderDistanceKm: 2.9,
  },
  "grande-muraglia": {
    geoCheck: "inside",
  },
  "taj-mahal": {
    geoCheck: "inside",
  },
  "angkor-wat": {
    geoCheck: "inside",
  },
  petra: {
    geoCheck: "inside",
  },
  "il-cairo": {
    geoCheck: "inside",
  },
  luxor: {
    geoCheck: "inside",
  },
  marrakech: {
    geoCheck: "inside",
  },
  tunisi: {
    geoCheck: "inside",
  },
  tripoli: {
    geoCheck: "inside",
  },
  lagos: {
    geoCheck: "inside",
  },
  abuja: {
    geoCheck: "inside",
  },
  nairobi: {
    geoCheck: "inside",
  },
  "addis-abeba": {
    geoCheck: "inside",
  },
  accra: {
    geoCheck: "inside",
  },
  kinshasa: {
    geoCheck: "inside",
  },
  "dar-es-salaam": {
    geoCheck: "inside",
  },
  "citta-del-capo": {
    geoCheck: "inside",
  },
  antananarivo: {
    geoCheck: "inside",
  },
  kilimangiaro: {
    geoCheck: "inside",
  },
  "cascate-vittoria": {
    geoCheck: "inside",
  },
  serengeti: {
    geoCheck: "inside",
  },
  "erg-chebbi": {
    geoCheck: "inside",
  },
  zanzibar: {
    geoCheck: "inside",
  },
  "new-york": {
    geoCheck: "inside",
  },
  washington: {
    geoCheck: "inside",
  },
  "los-angeles": {
    geoCheck: "inside",
  },
  "san-francisco": {
    geoCheck: "inside",
  },
  chicago: {
    geoCheck: "inside",
  },
  "las-vegas": {
    geoCheck: "inside",
  },
  miami: {
    geoCheck: "near",
    borderDistanceKm: 1.1,
  },
  toronto: {
    geoCheck: "inside",
  },
  ottawa: {
    geoCheck: "inside",
  },
  vancouver: {
    geoCheck: "inside",
  },
  "citta-del-messico": {
    geoCheck: "inside",
  },
  lavana: {
    geoCheck: "inside",
  },
  panama: {
    geoCheck: "inside",
  },
  honolulu: {
    geoCheck: "inside",
  },
  anchorage: {
    geoCheck: "inside",
  },
  "grand-canyon": {
    geoCheck: "inside",
  },
  yellowstone: {
    geoCheck: "inside",
  },
  niagara: {
    geoCheck: "inside",
  },
  denali: {
    geoCheck: "inside",
  },
  "monte-rushmore": {
    geoCheck: "inside",
  },
  "chichen-itza": {
    geoCheck: "inside",
  },
  "rio-de-janeiro": {
    geoCheck: "inside",
  },
  brasilia: {
    geoCheck: "inside",
  },
  "buenos-aires": {
    geoCheck: "inside",
  },
  santiago: {
    geoCheck: "inside",
  },
  lima: {
    geoCheck: "inside",
  },
  bogota: {
    geoCheck: "inside",
  },
  quito: {
    geoCheck: "inside",
  },
  caracas: {
    geoCheck: "inside",
  },
  "la-paz": {
    geoCheck: "inside",
  },
  manaus: {
    geoCheck: "inside",
  },
  ushuaia: {
    geoCheck: "near",
    borderDistanceKm: 0.9,
  },
  "machu-picchu": {
    geoCheck: "inside",
  },
  iguazu: {
    geoCheck: "inside",
  },
  "salar-de-uyuni": {
    geoCheck: "inside",
  },
  "perito-moreno": {
    geoCheck: "inside",
  },
  galapagos: {
    geoCheck: "inside",
  },
  "isola-di-pasqua": {
    geoCheck: "inside",
  },
  sydney: {
    geoCheck: "inside",
  },
  canberra: {
    geoCheck: "inside",
  },
  melbourne: {
    geoCheck: "inside",
  },
  auckland: {
    geoCheck: "inside",
  },
  wellington: {
    geoCheck: "inside",
  },
  uluru: {
    geoCheck: "inside",
  },
  "grande-barriera-corallina": {
    geoCheck: "near",
    borderDistanceKm: 2.1,
  },
  suva: {
    geoCheck: "inside",
  },
  "port-moresby": {
    geoCheck: "inside",
  },
  "bora-bora": {
    geoCheck: "near",
    borderDistanceKm: 0.7,
  },
  pompei: {
    geoCheck: "inside",
  },
  "valle-dei-templi": {
    geoCheck: "inside",
  },
  "nuraghe-su-nuraxi": {
    geoCheck: "inside",
  },
  "acropoli-atene": {
    geoCheck: "inside",
  },
  cnosso: {
    geoCheck: "inside",
  },
  delfi: {
    geoCheck: "inside",
  },
  efeso: {
    geoCheck: "inside",
  },
  troia: {
    geoCheck: "inside",
  },
  "gobekli-tepe": {
    geoCheck: "inside",
  },
  baalbek: {
    geoCheck: "inside",
  },
  palmira: {
    geoCheck: "inside",
  },
  gerasa: {
    geoCheck: "inside",
  },
  masada: {
    geoCheck: "inside",
  },
  cartagine: {
    geoCheck: "near",
    borderDistanceKm: 0.4,
  },
  volubilis: {
    geoCheck: "inside",
  },
  "leptis-magna": {
    geoCheck: "inside",
  },
  "grande-zimbabwe": {
    geoCheck: "inside",
  },
  axum: {
    geoCheck: "inside",
  },
  lalibela: {
    geoCheck: "inside",
  },
  persepoli: {
    geoCheck: "inside",
  },
  "mohenjo-daro": {
    geoCheck: "inside",
  },
  "esercito-terracotta": {
    geoCheck: "inside",
  },
  ayutthaya: {
    geoCheck: "inside",
  },
  bagan: {
    geoCheck: "inside",
  },
  sigiriya: {
    geoCheck: "inside",
  },
  hampi: {
    geoCheck: "inside",
  },
  ellora: {
    geoCheck: "inside",
  },
  "angkor-thom": {
    geoCheck: "inside",
  },
  nazca: {
    geoCheck: "inside",
  },
  tiwanaku: {
    geoCheck: "inside",
  },
  tikal: {
    geoCheck: "inside",
  },
  teotihuacan: {
    geoCheck: "inside",
  },
  palenque: {
    geoCheck: "inside",
  },
  copan: {
    geoCheck: "inside",
  },
  "mesa-verde": {
    geoCheck: "inside",
  },
  cahokia: {
    geoCheck: "inside",
  },
  newgrange: {
    geoCheck: "inside",
  },
  "torre-di-londra": {
    geoCheck: "inside",
  },
  "fiume-po": {
    geoCheck: "inside",
  },
  "fiume-tevere": {
    geoCheck: "inside",
  },
  "fiume-arno": {
    geoCheck: "near",
    borderDistanceKm: 12.4,
  },
  "fiume-adige": {
    geoCheck: "near",
    borderDistanceKm: 1.5,
  },
  "fiume-danubio": {
    geoCheck: "inside",
  },
  "fiume-reno": {
    geoCheck: "inside",
  },
  "fiume-senna": {
    geoCheck: "near",
    borderDistanceKm: 1.9,
  },
  "fiume-loira": {
    geoCheck: "near",
    borderDistanceKm: 1.2,
  },
  "fiume-rodano": {
    geoCheck: "near",
    borderDistanceKm: 1,
  },
  "fiume-garonna": {
    geoCheck: "near",
    borderDistanceKm: 0,
  },
  "fiume-ebro": {
    geoCheck: "inside",
  },
  "fiume-tago": {
    geoCheck: "inside",
  },
  "fiume-douro": {
    geoCheck: "near",
    borderDistanceKm: 1.7,
  },
  "fiume-tamigi": {
    geoCheck: "inside",
  },
  "fiume-shannon": {
    geoCheck: "inside",
  },
  "fiume-vistola": {
    geoCheck: "near",
    borderDistanceKm: 0.4,
  },
  "fiume-elba": {
    geoCheck: "near",
    borderDistanceKm: 6,
  },
  "fiume-volga": {
    geoCheck: "near",
    borderDistanceKm: 2.6,
  },
  "fiume-dnepr": {
    geoCheck: "near",
    borderDistanceKm: 4.5,
  },
  "fiume-don": {
    geoCheck: "inside",
  },
  "fiume-ob": {
    geoCheck: "inside",
  },
  "fiume-lena": {
    geoCheck: "inside",
  },
  "fiume-amur": {
    geoCheck: "inside",
  },
  "fiume-nilo": {
    geoCheck: "inside",
  },
  "fiume-congo": {
    geoCheck: "near",
    borderDistanceKm: 4,
  },
  "fiume-niger": {
    geoCheck: "inside",
  },
  "fiume-zambesi": {
    geoCheck: "near",
    borderDistanceKm: 1.3,
  },
  "fiume-orange": {
    geoCheck: "inside",
  },
  "fiume-limpopo": {
    geoCheck: "near",
    borderDistanceKm: 4.6,
  },
  "fiume-giordano": {
    geoCheck: "near",
    borderDistanceKm: 2,
  },
  "fiume-tigri": {
    geoCheck: "inside",
  },
  "fiume-eufrate": {
    geoCheck: "inside",
  },
  "fiume-gange": {
    geoCheck: "inside",
  },
  "fiume-indo": {
    geoCheck: "inside",
  },
  "fiume-brahmaputra": {
    geoCheck: "inside",
  },
  "fiume-yangtze": {
    geoCheck: "near",
    borderDistanceKm: 3.1,
  },
  "fiume-giallo": {
    geoCheck: "inside",
  },
  "fiume-mekong": {
    geoCheck: "near",
    borderDistanceKm: 7.4,
  },
  "fiume-rosso": {
    geoCheck: "near",
    borderDistanceKm: 6.5,
  },
  "fiume-mississippi": {
    geoCheck: "inside",
  },
  "fiume-missouri": {
    geoCheck: "inside",
  },
  "fiume-rio-grande": {
    geoCheck: "inside",
  },
  "fiume-colorado": {
    geoCheck: "inside",
  },
  "fiume-columbia": {
    geoCheck: "near",
    borderDistanceKm: 2.6,
  },
  "fiume-yukon": {
    geoCheck: "near",
    borderDistanceKm: 1.4,
  },
  "fiume-amazzoni": {
    geoCheck: "near",
    borderDistanceKm: 2.4,
  },
  "fiume-parana": {
    geoCheck: "near",
    borderDistanceKm: 5.4,
  },
  "fiume-orinoco": {
    geoCheck: "inside",
  },
  "fiume-san-francesco": {
    geoCheck: "near",
    borderDistanceKm: 6.5,
  },
  "fiume-murray": {
    geoCheck: "inside",
  },
  "fiume-darling": {
    geoCheck: "inside",
  },
  "lago-vittoria": {
    geoCheck: "inside",
  },
  "lago-tanganica": {
    geoCheck: "inside",
  },
  "lago-malawi": {
    geoCheck: "inside",
  },
  "lago-ciad": {
    geoCheck: "inside",
  },
  "lago-baikal": {
    geoCheck: "inside",
  },
  "lago-caspio": {
    geoCheck: "near",
    borderDistanceKm: 200.9,
  },
  "lago-aral": {
    geoCheck: "inside",
  },
  "lago-issyk-kul": {
    geoCheck: "inside",
  },
  "lago-van": {
    geoCheck: "inside",
  },
  "lago-urmia": {
    geoCheck: "inside",
  },
  "lago-poyang": {
    geoCheck: "inside",
  },
  "lago-taihu": {
    geoCheck: "inside",
  },
  "lago-tonle-sap": {
    geoCheck: "inside",
  },
  "lago-toba": {
    geoCheck: "inside",
  },
  "lago-ladoga": {
    geoCheck: "inside",
  },
  "lago-onega": {
    geoCheck: "inside",
  },
  "lago-balaton": {
    geoCheck: "inside",
  },
  "lago-ginevra": {
    geoCheck: "inside",
  },
  "lago-costanza": {
    geoCheck: "inside",
  },
  "lago-como": {
    geoCheck: "inside",
  },
  "lago-garda": {
    geoCheck: "inside",
  },
  "lago-maggiore": {
    geoCheck: "inside",
  },
  "lago-trasimeno": {
    geoCheck: "inside",
  },
  "lago-loch-ness": {
    geoCheck: "inside",
  },
  "lago-vattern": {
    geoCheck: "inside",
  },
  "lago-titicaca": {
    geoCheck: "inside",
  },
  "lago-maracaibo": {
    geoCheck: "near",
    borderDistanceKm: 28.3,
  },
  "lago-superiore": {
    geoCheck: "inside",
  },
  "lago-michigan": {
    geoCheck: "inside",
  },
  "lago-huron": {
    geoCheck: "inside",
  },
  "lago-erie": {
    geoCheck: "inside",
  },
  "lago-ontario": {
    geoCheck: "inside",
  },
  "lago-salato": {
    geoCheck: "inside",
  },
  "lago-crater-lake": {
    geoCheck: "inside",
  },
  "lago-nicaragua": {
    geoCheck: "inside",
  },
  colosseo: {
    geoCheck: "inside",
  },
  "torre-eiffel": {
    geoCheck: "inside",
  },
  "big-ben": {
    geoCheck: "inside",
  },
  "sagrada-familia": {
    geoCheck: "inside",
  },
  neuschwanstein: {
    geoCheck: "inside",
  },
  "santa-sofia": {
    geoCheck: "inside",
  },
  "piramidi-giza": {
    geoCheck: "inside",
  },
  "abu-simbel": {
    geoCheck: "inside",
  },
  "citta-proibita": {
    geoCheck: "inside",
  },
  borobudur: {
    geoCheck: "inside",
  },
  "statua-liberta": {
    geoCheck: "near",
    borderDistanceKm: 1.3,
  },
  "cristo-redentore": {
    geoCheck: "inside",
  },
  "opera-sydney": {
    geoCheck: "inside",
  },
  sicilia: {
    geoCheck: "inside",
  },
  sardegna: {
    geoCheck: "inside",
  },
  capri: {
    geoCheck: "near",
    borderDistanceKm: 8.5,
  },
  creta: {
    geoCheck: "inside",
  },
  "islanda-isola": {
    geoCheck: "inside",
  },
  groenlandia: {
    geoCheck: "inside",
  },
  "cuba-isola": {
    geoCheck: "inside",
  },
  "madagascar-isola": {
    geoCheck: "inside",
  },
  "mauritius-isola": {
    geoCheck: "inside",
  },
  "maldives-isola": {
    geoCheck: "near",
    borderDistanceKm: 17,
  },
  sumatra: {
    geoCheck: "inside",
  },
  giava: {
    geoCheck: "inside",
  },
  borneo: {
    geoCheck: "inside",
  },
  "nuova-guinea": {
    geoCheck: "inside",
  },
  honshu: {
    geoCheck: "inside",
  },
  tasmania: {
    geoCheck: "inside",
  },
  svalbard: {
    geoCheck: "unavailable",
  },
  sahara: {
    geoCheck: "inside",
  },
  "deserto-atacama": {
    geoCheck: "inside",
  },
  "deserto-gobi": {
    geoCheck: "inside",
  },
  "deserto-kalahari": {
    geoCheck: "inside",
  },
  "valle-della-morte": {
    geoCheck: "inside",
  },
  "foresta-amazzonica": {
    geoCheck: "inside",
  },
  "fiordi-norvegesi": {
    geoCheck: "inside",
  },
  "salto-angel": {
    geoCheck: "inside",
  },
  cervino: {
    geoCheck: "inside",
  },
  "monte-rosa": {
    geoCheck: "inside",
  },
  eiger: {
    geoCheck: "inside",
  },
  zugspitze: {
    geoCheck: "inside",
  },
  grossglockner: {
    geoCheck: "inside",
  },
  marmolada: {
    geoCheck: "inside",
  },
  "gran-sasso": {
    geoCheck: "inside",
  },
  teide: {
    geoCheck: "inside",
  },
  "ben-nevis": {
    geoCheck: "inside",
  },
  snowdon: {
    geoCheck: "inside",
  },
  olimpo: {
    geoCheck: "inside",
  },
  elbrus: {
    geoCheck: "inside",
  },
  urali: {
    geoCheck: "inside",
  },
  caucaso: {
    geoCheck: "inside",
  },
  k2: {
    geoCheck: "inside",
  },
  kangchenjunga: {
    geoCheck: "inside",
  },
  "nanga-parbat": {
    geoCheck: "inside",
  },
  annapurna: {
    geoCheck: "inside",
  },
  damavand: {
    geoCheck: "inside",
  },
  ararat: {
    geoCheck: "inside",
  },
  kinabalu: {
    geoCheck: "inside",
  },
  "puncak-jaya": {
    geoCheck: "inside",
  },
  yushan: {
    geoCheck: "inside",
  },
  "monte-kenya": {
    geoCheck: "inside",
  },
  ruwenzori: {
    geoCheck: "inside",
  },
  toubkal: {
    geoCheck: "inside",
  },
  "monte-camerun": {
    geoCheck: "inside",
  },
  "table-mountain": {
    geoCheck: "inside",
  },
  drakensberg: {
    geoCheck: "inside",
  },
  aconcagua: {
    geoCheck: "inside",
  },
  "ojos-del-salado": {
    geoCheck: "inside",
  },
  chimborazo: {
    geoCheck: "inside",
  },
  cotopaxi: {
    geoCheck: "inside",
  },
  huascaran: {
    geoCheck: "inside",
  },
  "pico-da-neblina": {
    geoCheck: "inside",
  },
  "monte-cook": {
    geoCheck: "inside",
  },
  kosciuszko: {
    geoCheck: "inside",
  },
  "mauna-kea": {
    geoCheck: "inside",
  },
  "monte-rainier": {
    geoCheck: "inside",
  },
  vinson: {
    geoCheck: "inside",
  },
  vesuvio: {
    geoCheck: "inside",
  },
  stromboli: {
    geoCheck: "inside",
  },
  krakatoa: {
    geoCheck: "near",
    borderDistanceKm: 38,
  },
};

export default CURATED_GEO_AUDIT;
