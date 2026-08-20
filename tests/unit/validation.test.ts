import { describe, expect, it } from "vitest";
import {
  documentDedupKey,
  stripSeparators,
  validateAmountConsistency,
  validateBankAccount,
  validateNip,
} from "@/lib/domain/validation";

describe("NIP", () => {
  it("przyjmuje numer z poprawną sumą kontrolną", () => {
    // NIP-y podmiotów z naszej piaskownicy KSeF.
    for (const nip of ["6919478855", "2650866478", "9430928608", "4291146318"]) {
      expect(validateNip(nip).valid, nip).toBe(true);
    }
  });

  it("akceptuje zapis z separatorami", () => {
    expect(validateNip("691-947-88-55").valid).toBe(true);
    expect(validateNip("691 947 88 55").valid).toBe(true);
  });

  it("odrzuca numer o błędnej sumie kontrolnej", () => {
    expect(validateNip("1234567890").valid).toBe(false);
  });

  it("odrzuca numer o złej długości", () => {
    expect(validateNip("691947885").valid).toBe(false);
    expect(validateNip("69194788550").valid).toBe(false);
  });

  it("odrzuca numer, dla którego reszta z dzielenia wynosi 10", () => {
    // Suma kontrolna 10 nie ma reprezentacji jednocyfrowej, więc taki NIP
    // nie może istnieć — to przypadek brzegowy algorytmu, nie literówka.
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    let found: string | null = null;
    for (let candidate = 1_000_000_00; candidate < 1_000_100_00 && !found; candidate += 1) {
      const digits = String(candidate).padStart(9, "0").split("").map(Number);
      const checksum = weights.reduce((sum, weight, index) => sum + weight * digits[index], 0) % 11;
      if (checksum === 10) found = `${digits.join("")}0`;
    }
    expect(found).not.toBeNull();
    expect(validateNip(found!).valid).toBe(false);
  });
});

describe("rachunek bankowy", () => {
  it("przyjmuje poprawny NRB i ten sam numer w zapisie IBAN", () => {
    const nrb = "59890435956424360128023751";
    expect(validateBankAccount(nrb).valid).toBe(true);
    expect(validateBankAccount(`PL${nrb}`).valid).toBe(true);
    expect(validateBankAccount("PL59 8904 3595 6424 3601 2802 3751").valid).toBe(true);
  });

  it("odrzuca numer z przekłamaną cyfrą", () => {
    // Podmiana jednej cyfry musi zostać wyłapana przez sumę kontrolną mod 97 —
    // to jest cały powód, dla którego ta suma istnieje.
    expect(validateBankAccount("59890435956424360128023752").valid).toBe(false);
  });

  it("odrzuca numer o złej długości", () => {
    expect(validateBankAccount("5989043595642436012802375").valid).toBe(false);
  });
});

describe("spójność kwot", () => {
  it("przyjmuje netto + VAT równe brutto", () => {
    expect(validateAmountConsistency(37800, 3024, 40824).valid).toBe(true);
  });

  it("odrzuca kwoty, które się nie sumują", () => {
    expect(validateAmountConsistency(100, 23, 999).valid).toBe(false);
  });

  it("toleruje zaokrąglenie do grosza", () => {
    // Sumowanie pozycji potrafi dać różnicę pojedynczego grosza; odrzucanie
    // takiej faktury byłoby wadą, nie funkcją.
    expect(validateAmountConsistency(100.005, 23, 123.0).valid).toBe(true);
  });
});

describe("klucz deduplikacji", () => {
  it("nie zależy od wielkości liter ani od separatorów w NIP", () => {
    expect(documentDedupKey("pak/0181/2026", "265-086-64-78")).toBe(
      documentDedupKey("PAK/0181/2026", "2650866478"),
    );
  });

  it("rozróżnia ten sam numer u różnych kontrahentów", () => {
    expect(documentDedupKey("FV/1/2026", "2650866478")).not.toBe(documentDedupKey("FV/1/2026", "9430928608"));
  });
});

describe("stripSeparators", () => {
  it("usuwa spacje i myślniki", () => {
    expect(stripSeparators("691-947 88 55")).toBe("6919478855");
  });

  it("zachowuje prefiks kraju w IBAN", () => {
    // Ta sama funkcja normalizuje NIP i numer konta, więc nie może wycinać
    // liter — „PL" jest częścią numeru rachunku.
    expect(stripSeparators("PL59 8904 3595")).toBe("PL5989043595");
  });
});
