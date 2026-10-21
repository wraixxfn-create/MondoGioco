import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("mostra il titolo principale", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Esplora il Mondo/i })).toBeVisible();
  });

  test("ha link di navigazione funzionanti", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Gioca/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Allenamento/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Multiplayer/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Classifiche/i })).toBeVisible();
  });

  test("naviga alla pagina Gioca", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Inizia a Giocare/i }).first().click();
    await expect(page).toHaveURL(/\/play/);
  });
});

test.describe("Pagina Gioca", () => {
  test("mostra la scelta della modalità", async ({ page }) => {
    await page.goto("/play");
    await expect(
      page.getByRole("heading", { name: /Trova il luogo sul globo/i })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Inizia la partita/i })
    ).toBeVisible();
  });

  test("mostra le tre modalità di gioco", async ({ page }) => {
    await page.goto("/play");
    await expect(page.getByText(/Allenamento libero/)).toBeVisible();
    await expect(page.getByText(/Sfida a round/)).toBeVisible();
    await expect(page.getByText(/Contro il tempo/)).toBeVisible();
  });
});

test.describe("Pagina Allenamento", () => {
  test("mostra la lista dei paesi", async ({ page }) => {
    await page.goto("/training");
    await expect(page.getByRole("heading", { name: /Allenamento/i })).toBeVisible();
    // Almeno un paese dovrebbe essere visibile
    await expect(page.getByText(/Italia/)).toBeVisible();
  });

  test("il filtro per continente funziona", async ({ page }) => {
    await page.goto("/training");
    await page.getByRole("button", { name: /Europa/ }).click();
    await expect(page.getByText(/Italia/)).toBeVisible();
  });
});

test.describe("Responsive Design", () => {
  test("mobile: menu hamburger è visibile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    // Il pulsante menu dovrebbe essere visibile su mobile
    const menuButton = page.getByRole("button", { name: /Toggle menu/i });
    await expect(menuButton).toBeVisible();
  });
});
