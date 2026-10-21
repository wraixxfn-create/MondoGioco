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

  test("Multiplayer mostra lo stato reale di configurazione senza simulare partite", async ({
    page,
  }) => {
    await page.goto("/multiplayer");
    await expect(page.getByRole("heading", { name: "Multiplayer" })).toBeVisible();

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // Senza credenziali NON deve esistere una finta stanza locale.
      await expect(page.getByText("Multiplayer non configurato")).toBeVisible();
      await expect(page.getByRole("button", { name: "Crea Nuova Stanza" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Unisciti a Stanza" })).toBeDisabled();
    } else {
      await expect(page.getByRole("button", { name: "Crea Nuova Stanza" })).toBeEnabled({
        timeout: 20_000,
      });
    }
  });
});
