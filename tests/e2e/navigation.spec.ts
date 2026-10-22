import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("mostra il titolo principale", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Esplora il mondo/i })).toBeVisible();
  });

  test("invia gli header HTTP di sicurezza essenziali", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response?.headers() ?? {};
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
  });

  test("ha link di navigazione funzionanti", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Navigazione principale" });
    await expect(nav.getByRole("link", { name: /Gioca/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Allenamento/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Multiplayer/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /Classifiche/i })).toBeVisible();
  });

  test("naviga alla pagina Gioca", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /Inizia a Giocare/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/play/);
  });
});

test.describe("Pagina Gioca", () => {
  test("mostra la scelta della modalità", async ({ page }) => {
    await page.goto("/play");
    await expect(page.getByRole("heading", { name: /Trova il luogo sul globo/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Inizia la partita/i })).toBeVisible();
  });

  test("mostra le modalità di gioco principali", async ({ page }) => {
    await page.goto("/play");
    const modes = page.getByRole("radiogroup", { name: /Modalità di gioco/i });
    await expect(modes.getByRole("radio", { name: /Allenamento/i })).toBeVisible();
    await expect(modes.getByRole("radio", { name: /Sfida a round/i })).toBeVisible();
    await expect(modes.getByRole("radio", { name: /Contro il tempo/i })).toBeVisible();
  });
});

test.describe("Pagina Allenamento", () => {
  test("mostra la lista dei paesi", async ({ page }) => {
    await page.goto("/training");
    await expect(page.getByRole("heading", { name: /Allenamento/i })).toBeVisible();
    // Almeno un paese dovrebbe essere visibile
    await expect(page.getByText(/Italia/).first()).toBeVisible();
  });

  test("il filtro per continente funziona", async ({ page }) => {
    await page.goto("/training");
    await page.getByRole("button", { name: "Europa", exact: true }).click();
    await expect(page.getByText(/Italia/).first()).toBeVisible();
    await page.getByRole("button", { name: "Oceania", exact: true }).click();
    await expect(page.getByText(/Australia/).first()).toBeVisible();
  });
});

test.describe("Responsive Design", () => {
  test("mobile: il menu di navigazione è apribile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    // Il pulsante menu dovrebbe essere visibile su mobile
    const menuButton = page.getByRole("button", { name: /Apri menu/i });
    await expect(menuButton).toBeVisible();
    await menuButton.click();
    await expect(
      page.getByRole("navigation", { name: "Navigazione principale mobile" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Chiudi menu/i })).toBeVisible();
  });
});
