import { expect, test, type Page } from "@playwright/test";

/**
 * Kryterium akceptacji z zadania, przechodzone tak, jak zrobi to recenzent:
 * pobranie z KSeF, akceptacja z bufora, dokument w rejestrze, podgląd.
 *
 * Testy idą po treściach widocznych dla użytkownika, a nie po identyfikatorach
 * technicznych. Jest to nieco kruchsze, ale sprawdza to, co użytkownik naprawdę
 * widzi — test przechodzący przy niewidocznym przycisku byłby bezwartościowy.
 */

/** Liczba pozycji oczekujących w buforze, odczytana z plakietki w nawigacji. */
async function bufferBadge(page: Page): Promise<number> {
  const badge = page.getByRole("link", { name: /Bufor/ }).locator("span").last();
  const text = (await badge.textContent())?.trim() ?? "0";
  return Number.parseInt(text, 10) || 0;
}

test.describe("rejestr dokumentów", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/rejestr");
  });

  test("pokazuje ewidencję z podsumowaniem", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Rejestr dokumentów" })).toBeVisible();
    await expect(page.getByText("ZOBOWIĄZANIA DO ZAPŁATY")).toBeVisible();

    // Dane demonstracyjne mają 33 dokumenty w rejestrze.
    await expect(page.getByText(/1–\d+ z 33/)).toBeVisible();
  });

  test("tabela przewija się zamiast uciekać poza ekran", async ({ page }) => {
    // Regresja z czasu przepinania na API: opakowanie tabeli przerwało łańcuch
    // flexa i lista rozlewała się poza widok, bez paska przewijania.
    const scroller = page.locator("table").locator("..");
    const metrics = await scroller.evaluate((node) => ({
      scrollable: node.scrollHeight > node.clientHeight,
      visible: node.clientHeight,
    }));

    expect(metrics.scrollable).toBe(true);
    expect(metrics.visible).toBeGreaterThan(200);

    // Strona jako całość nie może przewijać się w pionie — przewija tabela.
    const bodyOverflow = await page.evaluate(() => document.body.scrollHeight - window.innerHeight);
    expect(bodyOverflow).toBeLessThanOrEqual(1);
  });

  test("filtr po kontrahencie zawęża listę", async ({ page }) => {
    const before = await page.locator("tbody tr").count();

    // Ta sama nazwa występuje w pasku filtrów i w nagłówku kolumny,
    // więc zawężamy do paska nad tabelą.
    await page.getByRole("button", { name: "Kontrahent" }).first().click();
    await page.getByRole("dialog").getByText("PakPol Opakowania sp. z o.o.").click();
    await page.keyboard.press("Escape");

    await expect(page.locator("tbody tr")).not.toHaveCount(before);

    // Każdy widoczny wiersz musi należeć do wybranego kontrahenta. Sprawdzamy
    // treść całego wiersza, a nie konkretnej komórki — kolejność kolumn jest
    // konfigurowalna przez użytkownika, więc indeks byłby kruchy.
    const rows = await page.locator("tbody tr").allTextContents();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toContain("PakPol");
  });

  test("wyszukiwarka znajduje dokument po numerze", async ({ page }) => {
    await page.getByLabel("Szukaj dokumentów").fill("PAK/0437/2026");
    await expect(page.getByText("PAK/0437/2026")).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });
});

test.describe("pełna ścieżka: KSeF → bufor → rejestr → podgląd", () => {
  test("pobranie z KSeF zasila bufor, akceptacja przenosi do rejestru", async ({ page }) => {
    await page.goto("/bufor");
    const bufferBefore = await bufferBadge(page);

    // --- pobranie -----------------------------------------------------------
    await page.getByRole("button", { name: "Pobierz z KSeF" }).first().click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByText("Pobierz faktury z KSeF")).toBeVisible();

    await modal.getByLabel("Data od").fill("2026-07-01");
    await modal.getByLabel("Data do").fill("2026-08-31");
    await modal.getByRole("button", { name: /^Pobierz/ }).click();

    // Podsumowanie potwierdza, ile faktur wróciło i ile trafiło do bufora.
    await expect(modal.getByTestId("ksef-fetched")).toBeVisible({ timeout: 20_000 });
    expect(Number(await modal.getByTestId("ksef-fetched").textContent())).toBeGreaterThan(0);
    expect(Number(await modal.getByTestId("ksef-imported").textContent())).toBeGreaterThan(0);

    await modal.getByRole("button", { name: "Zamknij" }).first().click();

    const bufferAfter = await bufferBadge(page);
    expect(bufferAfter).toBeGreaterThan(bufferBefore);

    // --- akceptacja ---------------------------------------------------------
    const firstRow = page.locator("tbody tr").first();
    const documentNumber = (await firstRow.locator("td").nth(1).textContent())?.trim() ?? "";
    expect(documentNumber).not.toBe("");

    await firstRow.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Akceptuj/ }).first().click();

    // --- dokument jest w rejestrze -----------------------------------------
    await page.goto("/rejestr");
    await page.getByLabel("Szukaj dokumentów").fill(documentNumber);
    await expect(page.getByText(documentNumber, { exact: false }).first()).toBeVisible();

    // --- podgląd ------------------------------------------------------------
    await page.locator("tbody tr").first().click();
    const preview = page.getByRole("dialog");
    await expect(preview).toBeVisible();

    // Wymaganie mówi wprost: czytelna prezentacja danych, nie surowy XML.
    await expect(preview.getByText(documentNumber, { exact: false }).first()).toBeVisible();
    await expect(preview.getByText(/Sprzedawca|Nabywca/).first()).toBeVisible();
    await expect(preview.locator("text=<?xml")).toHaveCount(0);
  });

  test("powtórzone pobranie tego samego zakresu zgłasza duplikaty", async ({ page }) => {
    // Odporność na duplikaty widziana oczami użytkownika: drugie pobranie
    // niczego nie dokłada i mówi o tym wprost.
    await page.goto("/bufor");

    for (const attempt of [1, 2]) {
      await page.getByRole("button", { name: "Pobierz z KSeF" }).first().click();
      const modal = page.getByRole("dialog");
      await modal.getByLabel("Data od").fill("2026-07-01");
      await modal.getByLabel("Data do").fill("2026-08-31");
      await modal.getByRole("button", { name: /^Pobierz/ }).click();
      await expect(modal.getByTestId("ksef-duplicates")).toBeVisible({ timeout: 20_000 });

      if (attempt === 2) {
        // Drugie pobranie tego samego zakresu nie może dołożyć ani jednego
        // dokumentu — wszystko musi zostać rozpoznane jako duplikat.
        expect(Number(await modal.getByTestId("ksef-duplicates").textContent())).toBeGreaterThan(0);
        expect(Number(await modal.getByTestId("ksef-imported").textContent())).toBe(0);
      }
      await modal.getByRole("button", { name: "Zamknij" }).first().click();
    }
  });
});

test.describe("kategoryzacja", () => {
  test("drzewo kategorii pokazuje podkategorie i kwoty", async ({ page }) => {
    await page.goto("/kategorie");

    await expect(page.getByRole("heading", { name: "Kategorie" })).toBeVisible();

    // Nazwy kategorii powtarzają się w drzewie i na listach reguł, więc
    // szukamy ich w panelu drzewa, a nie na całej stronie.
    // Pierwsza lista na stronie to nawigacja boczna, więc zawężamy do treści.
    const tree = page.locator("main ul").first();
    await expect(tree.getByText("Logistyka", { exact: true })).toBeVisible();
    await expect(tree.getByText("Transport chłodniczy", { exact: true })).toBeVisible();
  });

  test("reguła kontrahent → kategoria jest widoczna w ustawieniach", async ({ page }) => {
    await page.goto("/kategorie");
    await expect(page.getByRole("heading", { name: "Reguły automatyczne" })).toBeVisible();
    await expect(page.getByText("PakPol Opakowania sp. z o.o.").first()).toBeVisible();
  });
});
