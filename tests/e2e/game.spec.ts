import { test, expect } from "@playwright/test";

/**
 * Flusso completo del gioco geografico sul globo.
 * La risposta viene data tramite l'inserimento manuale delle
 * coordinate (percorso accessibile e deterministico), poi si
 * verifica il reveal con distanza/punteggio e il riepilogo finale.
 */
test.describe("Gioco geografico — flusso completo", () => {
  test("menu → partita in allenamento → round → riepilogo", async ({ page }) => {
    await page.goto("/play");

    // Menu modalità
    await expect(
      page.getByRole("heading", { name: /Trova il luogo sul globo/i })
    ).toBeVisible();
    await expect(page.getByText(/Come si calcolano i punti/i)).toBeVisible();

    // Allenamento libero (nessun timer: test deterministico)
    await page.getByText("Allenamento libero").click();
    await page.getByRole("button", { name: /Inizia la partita/i }).click();

    // Globo e obiettivo visibili
    await expect(page.getByTestId("globe-container")).toBeVisible();
    await expect(page.getByText(/Trova:/)).toBeVisible();
    await expect(page.getByText(/Round 1/)).toBeVisible();

    // Pulsante di conferma disabilitato finché non c'è una puntina
    const confirm = page.getByRole("button", { name: /Conferma la risposta/i });
    await expect(confirm).toBeDisabled();

    // Posiziono la puntina su Roma e Parigi con le coordinate manuali
    await page
      .getByRole("button", { name: /inserisci latitudine e longitudine/i })
      .click();
    await page.getByLabel("Latitudine").fill("41,90");
    await page.getByLabel("Longitudine").fill("12,50");
    await page.getByRole("button", { name: /Posiziona la puntina/i }).click();
    await expect(confirm).toBeEnabled();

    // Confermo: deve comparire il risultato con distanza e punti
    await confirm.click();
    await expect(page.getByText(/Risultato del round/i)).toBeVisible();
    await expect(page.getByText("Distanza")).toBeVisible();
    await expect(page.getByText(/La destinazione era/i)).toBeVisible();

    // Round successivo
    await page.getByRole("button", { name: /Prossimo round/i }).click();
    await expect(page.getByText(/Round 2/)).toBeVisible();
    await expect(page.getByText(/Trova:/)).toBeVisible();

    // Termino e verifico il riepilogo finale
    await page.getByRole("button", { name: /Termina/i }).click();
    await expect(
      page.getByRole("heading", { name: /Partita terminata/i })
    ).toBeVisible();
    await expect(page.getByText(/Dettaglio dei round/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Gioca ancora/i })
    ).toBeVisible();
  });

  test("coordinate manuali non valide mostrano un errore", async ({ page }) => {
    await page.goto("/play");
    await page.getByText("Allenamento libero").click();
    await page.getByRole("button", { name: /Inizia la partita/i }).click();
    await page
      .getByRole("button", { name: /inserisci latitudine e longitudine/i })
      .click();
    await page.getByLabel("Latitudine").fill("999");
    await page.getByLabel("Longitudine").fill("0");
    await page.getByRole("button", { name: /Posiziona la puntina/i }).click();
    await expect(page.getByRole("alert")).toContainText(/non valide/i);
  });

  test("modalità sfida mostra il timer del round", async ({ page }) => {
    await page.goto("/play");
    await page.getByText("Sfida a round").click();
    await page.getByRole("button", { name: /Inizia la partita/i }).click();
    await expect(page.getByText(/Round 1 di 5/)).toBeVisible();
    // Il timer circolare parte da 60 secondi
    await expect(page.getByText("60").first()).toBeVisible();
  });
});

test.describe("Viewport mobile", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("il gioco è usabile su smartphone senza overflow orizzontale", async ({
    page,
  }) => {
    await page.goto("/play");
    await page.getByText("Allenamento libero").tap();
    await page.getByRole("button", { name: /Inizia la partita/i }).tap();

    await expect(page.getByTestId("globe-container")).toBeVisible();
    await expect(page.getByText(/Trova:/)).toBeVisible();

    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return el.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(1);

    // I pulsanti zoom touch sono presenti e tappabili
    await expect(
      page.getByRole("button", { name: /Avvicina/i })
    ).toBeVisible();
  });
});
