/**
 * Chart of Accounts — kode akun yang dipakai di posting rules.
 * Harus konsisten dengan seed di database/migrations/20260525_general_ledger.sql
 */

export const ACCOUNT = {
  KAS_LOKET: "1101",
  SALDO_PROVIDER: "1102",
  PIUTANG_SETTLEMENT: "1201",
  HUTANG_SETTLEMENT: "2101",
  TITIPAN_PELANGGAN: "2102",
  HUTANG_KOMISI_KASIR: "2201",
  HUTANG_KOMISI_LOKET: "2202",
  MODAL_DISETOR: "3101",
  LABA_DITAHAN: "3201",
  PENDAPATAN_ADMIN: "4101",
  PENDAPATAN_MARGIN: "4102",
  PENDAPATAN_LAIN: "4901",
  BEBAN_PROVIDER: "5101",
  BEBAN_OPERASIONAL: "5201",
  BEBAN_KOMISI_KASIR: "5301",
  BEBAN_KOMISI_LOKET: "5302",
  BEBAN_PENYESUAIAN: "5901",
} as const;

export type AccountCode = (typeof ACCOUNT)[keyof typeof ACCOUNT];

export const ACCOUNT_TYPES = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "INCOME",
  "EXPENSE",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const NORMAL_BALANCE: Record<AccountType, "DEBIT" | "CREDIT"> = {
  ASSET: "DEBIT",
  EXPENSE: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  INCOME: "CREDIT",
};
