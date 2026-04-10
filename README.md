# Portal Utilitas — Pembayaran PLN

Aplikasi web pembayaran utilitas berbasis **Next.js 14** (App Router) + **Tailwind CSS**, dibangun dari template Stitch "Pembayaran PLN".

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Jalankan development server
npm run dev        # → http://localhost:3000

# 3. Build production
npm run build

# 4. Jalankan production server
npm start
```

## Halaman

| Route          | Deskripsi                                                     |
| -------------- | ------------------------------------------------------------- |
| `/`            | **Dashboard** — tabel daftar pelanggan + modal detail tagihan |
| `/pembayaran`  | **Pembayaran PLN** — form cek tagihan, data billing, proses pembayaran (setia dengan template Stitch) |

## Struktur File

```
src/
├── app/
│   ├── globals.css            # Tailwind directives + base styles
│   ├── layout.tsx             # Root layout (Navbar, background decoration)
│   ├── page.tsx               # Dashboard (table + modal)
│   └── pembayaran/
│       └── page.tsx           # Halaman Pembayaran PLN
├── ui/                        # Design System
│   ├── Badge.tsx              # Label/tag kecil (yellow, primary, success, dll)
│   ├── Breadcrumb.tsx         # Navigasi breadcrumb
│   ├── Button.tsx             # Tombol (primary, outline, success, pill)
│   ├── Card.tsx               # Kartu dengan CardHeader + CardBody
│   ├── Input.tsx              # Input dengan icon/prefix
│   ├── Modal.tsx              # Dialog modal overlay
│   ├── Navbar.tsx             # Header navigasi utama
│   ├── Sidebar.tsx            # Sidebar kategori layanan
│   └── index.ts               # Barrel export
├── data/
│   └── mock.ts                # Data mock pelanggan + helper format
└── types/
    └── index.ts               # TypeScript interfaces
```

## Design Tokens (dari Template Stitch)

| Token             | Value       |
| ----------------- | ----------- |
| `primary`         | `#137fec`   |
| `background-light`| `#f6f7f8`   |
| `background-dark` | `#101922`   |
| `pln-yellow`      | `#FFD500`   |
| `pln-blue`        | `#00549B`   |
| Font              | Public Sans |
| Icons             | Material Symbols Outlined |
