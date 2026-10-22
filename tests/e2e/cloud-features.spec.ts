import { test, expect } from "@playwright/test";

test.describe("Classifica, Profilo, Account e Multiplayer", () => {
  test("Classifica non inventa giocatori: fuori dal cloud mostra solo dati reali locali", async ({
    page,
  }) => {
    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { name: "Classifica" })).toBeVisible();

    // Mai giocatori di esempio presentati come reali.
    await expect(page.getByText("GeoMaster_MI")).toHaveCount(0);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      await expect(page.getByText(/Solo i tuoi dati su questo dispositivo/i)).toBeVisible();
      await expect(
        page.getByText(/nessun.*giocatore inventat|Nessuna partita registrata/i)
      ).toBeVisible();
    }

    await page.getByRole("button", { name: "Questa Settimana" }).click();
    await expect(page.getByRole("button", { name: "Questa Settimana" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.getByRole("button", { name: "Tutti i Tempi" }).click();

    // Classifica amici: senza account lo stato deve essere esplicito.
    await page.getByRole("button", { name: /Amici/i }).click();
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      await expect(page.getByText(/Classifica amici non disponibile/i)).toBeVisible();
    }
  });

  test("Profilo: rinomina, avatar, impostazioni persistenti, statistiche e obiettivi", async ({
    page,
  }) => {
    await page.goto("/profile");
    await expect(page.getByText("Punti Totali")).toBeVisible();
    await expect(page.getByText("Accuratezza")).toBeVisible();
    await expect(page.getByText("Punteggio medio")).toBeVisible();
    await expect(page.getByText("Prima Partita")).toBeVisible();
    await expect(page.getByText("Statistiche per modalità")).toBeVisible();
    await expect(page.getByText("Storico partite")).toBeVisible();

    const input = page.getByLabel("Nome in classifica e multiplayer");
    await input.fill("ViaggiatoreMilano");
    await page.getByRole("button", { name: "Salva nome" }).click();
    await expect(page.getByRole("heading", { name: "ViaggiatoreMilano" })).toBeVisible();

    // Avatar base selezionabile subito, quello da livello 10 resta bloccato.
    await page.getByRole("button", { name: /Avatar Bussola/i }).click();
    await expect(page.getByRole("button", { name: /Avatar Bussola.*selezionato/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Avatar Drago, bloccato/i })).toBeDisabled();

    // Impostazione riduzione animazioni: applicata subito e persistente.
    await page.getByLabel(/Riduci animazioni/i).check();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
    await page.reload();
    await expect(page.getByLabel(/Riduci animazioni/i)).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "true");
    await expect(page.getByRole("heading", { name: "ViaggiatoreMilano" })).toBeVisible();

    // La navigazione da tastiera ha un collegamento di salto al contenuto.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Salta al contenuto principale" })).toBeFocused();
  });

  test("Pagina account: login, registrazione e recupero password con stato esplicito", async ({
    page,
  }) => {
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Il tuo account" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Crea account" }).click();
    await expect(page.getByLabel("Nickname pubblico")).toBeVisible();

    await page.getByRole("button", { name: "Password dimenticata" }).click();
    await expect(page.getByLabel("Email dell'account")).toBeVisible();

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // Senza configurazione: avviso chiaro e invio disabilitato (mai finto).
      await expect(page.getByText(/Account cloud non disponibile/i).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Invia link di recupero" })).toBeDisabled();
    } else {
      await page.getByLabel("Email dell'account").fill("no");
      // Il browser blocca l'invio con email malformata: restiamo sulla pagina.
      await page.getByRole("button", { name: "Invia link di recupero" }).click();
      await expect(page).toHaveURL(/\/auth$/);
    }

    // Link di reset senza sessione di recovery: messaggio onesto, non un form finto.
    await page.goto("/auth/reset");
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      await expect(page.getByText(/Account cloud non disponibile/i)).toBeVisible({
        timeout: 10_000,
      });
    }
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
