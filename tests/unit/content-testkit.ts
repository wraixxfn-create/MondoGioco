import { listPackDescriptors, loadPacks, resetPackCache } from "@/lib/content/registry";
import type { LoadedPack } from "@/lib/content/registry";
import { buildIndex, type ContentIndex } from "@/lib/content/catalog";
import type { HydratedLocation } from "@/data/content/schema";

/** Carica TUTTI i pacchetti (curati e generati) e costruisce l'indice. */
export async function loadEverything(): Promise<{
  packs: LoadedPack[];
  locations: HydratedLocation[];
  index: ContentIndex;
}> {
  resetPackCache();
  const ids = listPackDescriptors().map((pack) => pack.id);
  const packs = await loadPacks(ids);
  const locations = packs.flatMap((pack) => pack.locations);
  return { packs, locations, index: buildIndex(locations) };
}

/** Carica solo i pacchetti curati (esperienza di base, senza città). */
export async function loadCurated(): Promise<HydratedLocation[]> {
  resetPackCache();
  const packs = await loadPacks(
    listPackDescriptors()
      .filter((pack) => pack.curated)
      .map((pack) => pack.id)
  );
  return packs.flatMap((pack) => pack.locations);
}

export function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}
