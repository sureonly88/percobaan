// Parser angka PDAM tanpa dependensi server — aman dipakai di komponen client.

/**
 * Parse angka dari response PDAM API.
 * PDAM menggunakan "." sebagai pemisah ribuan (format Indonesia).
 * Contoh: "15.181" = 15181, "1.234.567" = 1234567
 * Desimal menggunakan ",": "388,47" = 388.47
 * Angka tanpa format: "39229" = 39229
 */
export function parsePdamNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return value;

  const str = String(value).trim();
  if (str === "") return 0;

  // Pattern: dot as thousands separator (e.g. "15.181", "1.234.567")
  // Matches: 1-3 digits, then groups of .XXX (exactly 3 digits), optionally followed by ,XX (decimal)
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(str)) {
    // Remove dots (thousands), replace comma with dot (decimal)
    const normalized = str.replace(/\./g, "").replace(",", ".");
    return Number(normalized) || 0;
  }

  // Pattern: comma as decimal separator without thousands dot (e.g. "388,47")
  if (/^\d+(,\d+)$/.test(str)) {
    return Number(str.replace(",", ".")) || 0;
  }

  // Standard number (e.g. "39229", "388.47", "0")
  return Number(str) || 0;
}

