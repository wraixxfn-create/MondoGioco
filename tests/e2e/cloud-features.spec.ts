import { test, expect } from "@playwright/test";

test.describe("Classifica, Profilo e Multiplayer", () => {
  test("Classifica mostra i giocatori e i filtri temporali senza avvisi di configurazione", async ({
    page,
  }) => {
    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { name: "Classifica" })).toBeVisible();
    await expect(page.getByText("GeoMaster_MI").first()).toBeVisible();
    await expect(page.getByText(/Configura Supabase/i)).toHaveCount(0);

    await page.getByRole("button", { name: "Questa Settimana" }).click();
    await page.getByRole("button", { name: "Tutti i Tempi" }).click();
    await expect(page.getByText("Marco Polo").first()).toBeVisible();
  });

  test("Profilo permette di rinominare il giocatore e mostra statistiche e obiettivi", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page.getByText("Punti Totali")).toBeVisible();
    await expect(page.getByText("Prima Partita")).toBeVisible();
    await expect(page.getByText(/Configura Supabase/i)).toHaveCount(0);

    const input = page.getByLabel("Nome in classifica e multiplayer");
    await input.fill("ViaggiatoreMilano");
    await page.getByRole("button", { name: "Salva nome" }).click();
    await expect(page.getByRole("heading", { name: "ViaggiatoreMilano" })).toBeVisible();
  });

  test("Multiplayer crea una stanza reale e avvia una partita quiz", async ({ page }) => {
    await page.goto("/multiplayer");
    await expect(page.getByRole("heading", { name: "Multiplayer" })).toBeVisible();

    await page.getByRole("button", { name: "Crea Nuova Stanza" }).click();
    await page.getByLabel("Nome Stanza").fill("Partita Rapida");
    await page.getByRole("button", { name: "Crea Stanza", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Partita Rapida" })).toBeVisible();
    await page.getByRole("button", { name: /Avvia Partita/i }).click();

    await expect(page.getByText(/Domanda 1 di 5/i)).toBeVisible();
    await expect(page.getByText(/Qual è la capitale di/i)).toBeVisible();
  });
});
