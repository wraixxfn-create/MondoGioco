import { expect, test } from "@playwright/test";

/**
 * Test end-to-end del multiplayer REALE.
 *
 * Richiede:
 *   - un progetto Supabase configurato in `.env.local` prima di avviare il dev server;
 *   - accesso anonimo abilitato (Authentication → Providers → Anonymous);
 *   - migrazioni 001-004 applicate.
 *
 * Senza configurazione i test vengono saltati esplicitamente (non simulati).
 */
const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

test.describe("Multiplayer online (richiede Supabase reale)", () => {
  test.skip(
    !configured,
    "Credenziali Supabase assenti: test online saltato (vedi docs/SUPABASE_SETUP.md)"
  );
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("due utenti reali giocano un round sincronizzato", async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    // Host: crea la stanza.
    await host.goto("/multiplayer");
    await host.getByRole("button", { name: "Crea Nuova Stanza" }).click({ timeout: 30_000 });
    await host.getByLabel("Nome Stanza").fill("E2E Online");
    await host.getByLabel("Round").selectOption("3");
    await host.getByRole("button", { name: "Crea Stanza", exact: true }).click();
    await expect(host.getByRole("heading", { name: "E2E Online" })).toBeVisible();

    const code = (
      await host.getByRole("button", { name: "Copia codice stanza" }).innerText()
    ).trim();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    // Ospite: entra tramite codice e si dichiara pronto.
    await guest.goto(`/multiplayer?room=${code}`);
    await expect(guest.getByRole("heading", { name: "E2E Online" })).toBeVisible({
      timeout: 30_000,
    });
    await guest.getByRole("button", { name: "Sono pronto" }).click();

    // Host: deve vedere il secondo giocatore connesso e poter avviare.
    await expect(host.getByText(/2\/\d+ connessi/)).toBeVisible({ timeout: 30_000 });
    await host.getByRole("button", { name: "Avvia Partita" }).click({ timeout: 30_000 });

    await expect(host.getByText(/Domanda 1 di/i)).toBeVisible({ timeout: 30_000 });
    await expect(guest.getByText(/Domanda 1 di/i)).toBeVisible({ timeout: 30_000 });

    // Completa tutti e tre i round: con due risposte il server rivela il round
    // e avanza automaticamente dopo il countdown di reveal.
    for (let roundIndex = 1; roundIndex <= 3; roundIndex += 1) {
      await expect(host.getByText(`Domanda ${roundIndex} di 3`)).toBeVisible({
        timeout: 30_000,
      });
      await expect(guest.getByText(`Domanda ${roundIndex} di 3`)).toBeVisible({
        timeout: 30_000,
      });
      await host.getByTestId("mp-answer-option").first().click();
      await guest.getByTestId("mp-answer-option").first().click();

      await expect(
        host.getByText(`Soluzione · round ${roundIndex} di 3`, { exact: false })
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        guest.getByText(`Soluzione · round ${roundIndex} di 3`, { exact: false })
      ).toBeVisible({ timeout: 30_000 });
    }

    // Entrambi i browser vedono la classifica finale server-side con i due membri.
    for (const player of [host, guest]) {
      const leaderboard = player.getByRole("heading", { name: "Classifica finale" });
      await expect(leaderboard).toBeVisible({ timeout: 30_000 });
      await expect(player.locator("ol li")).toHaveCount(2);
      await expect(player.getByText(/\(tu\)/)).toBeVisible();
    }

    await hostContext.close();
    await guestContext.close();
  });
});
