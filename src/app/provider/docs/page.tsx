"use client";

import React, { useState } from "react";

type Tab = "overview" | "auth" | "inquiry" | "payment" | "webhook" | "errors" | "examples";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "info" },
  { id: "auth", label: "Autentikasi", icon: "lock" },
  { id: "inquiry", label: "Inquiry", icon: "search" },
  { id: "payment", label: "Payment", icon: "payment" },
  { id: "webhook", label: "Webhook", icon: "webhook" },
  { id: "errors", label: "Error Codes", icon: "error" },
  { id: "examples", label: "Contoh Kode", icon: "code" },
];

function CodeBlock({ title, lang, children }: { title?: string; lang?: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden my-3">
      {title && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <span className="text-xs font-semibold text-slate-500">{title}{lang ? ` · ${lang}` : ""}</span>
          <button onClick={copy} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors">
            <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <pre className="p-4 overflow-x-auto bg-slate-50 dark:bg-slate-900 text-sm leading-relaxed">
        <code className="text-slate-700 dark:text-slate-300 font-mono text-[13px]">{children.trim()}</code>
      </pre>
    </div>
  );
}

function Badge({ color, children }: { color: "green" | "blue" | "amber" | "red" | "slate"; children: React.ReactNode }) {
  const colors = {
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colors[color]}`}>{children}</span>;
}

function ParamRow({ name, type, required, desc }: { name: string; type: string; required?: boolean; desc: string }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <td className="px-4 py-2.5 font-mono text-sm text-primary font-medium">{name}</td>
      <td className="px-4 py-2.5 text-xs"><Badge color="slate">{type}</Badge></td>
      <td className="px-4 py-2.5 text-xs">{required ? <Badge color="red">Wajib</Badge> : <Badge color="slate">Opsional</Badge>}</td>
      <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400">{desc}</td>
    </tr>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-8 mb-3 flex items-center gap-2">{children}</h3>;
}

function Endpoint({ method, path }: { method: string; path: string }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 my-4 border border-slate-200 dark:border-slate-700">
      <Badge color={method === "POST" ? "green" : "blue"}>{method}</Badge>
      <code className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-200">{path}</code>
    </div>
  );
}

export default function ApiDocsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <span className="material-symbols-outlined text-2xl">menu_book</span>
          </div>
          Dokumentasi API PDAM
        </h1>
        <p className="text-sm text-slate-500 mt-2">Panduan integrasi untuk provider eksternal mengakses PDAM payment API</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 flex-wrap bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8">
        {activeTab === "overview" && <OverviewSection />}
        {activeTab === "auth" && <AuthSection />}
        {activeTab === "inquiry" && <InquirySection />}
        {activeTab === "payment" && <PaymentSection />}
        {activeTab === "webhook" && <WebhookSection />}
        {activeTab === "errors" && <ErrorsSection />}
        {activeTab === "examples" && <ExamplesSection />}
      </div>
    </div>
  );
}

/* ======================== SECTIONS ======================== */

function OverviewSection() {
  return (
    <div className="prose dark:prose-invert max-w-none prose-sm">
      <h2 className="text-xl font-bold">Overview</h2>
      <p>API ini memungkinkan provider eksternal untuk melakukan inquiry dan pembayaran tagihan PDAM secara terprogram.</p>

      <SectionTitle>Base URL</SectionTitle>
      <CodeBlock title="Production">{`https://your-domain.com/api/v1/pdam`}</CodeBlock>

      <SectionTitle>Endpoints</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Method</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Endpoint</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Deskripsi</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2.5"><Badge color="green">POST</Badge></td>
              <td className="px-4 py-2.5 font-mono text-sm">/api/v1/pdam/inquiry</td>
              <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">Cek tagihan pelanggan PDAM</td>
            </tr>
            <tr className="border-b border-slate-100 dark:border-slate-800">
              <td className="px-4 py-2.5"><Badge color="green">POST</Badge></td>
              <td className="px-4 py-2.5 font-mono text-sm">/api/v1/pdam/pay</td>
              <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">Bayar tagihan pelanggan PDAM</td>
            </tr>
          </tbody>
        </table>
      </div>

      <SectionTitle>Alur Integrasi</SectionTitle>
      <div className="grid gap-3">
        {[
          { step: 1, icon: "key", title: "Dapatkan Credentials", desc: "Admin akan membuat akun provider dan memberikan API Key + API Secret." },
          { step: 2, icon: "search", title: "Inquiry Tagihan", desc: "Kirim request inquiry dengan ID pelanggan untuk melihat detail tagihan." },
          { step: 3, icon: "payment", title: "Bayar Tagihan", desc: "Kirim request payment dengan amount yang sesuai dan idempotency key." },
          { step: 4, icon: "notifications", title: "Terima Webhook", desc: "Sistem akan mengirim callback ke webhook URL saat payment selesai (jika dikonfigurasi)." },
        ].map((item) => (
          <div key={item.step} className="flex items-start gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary text-sm font-bold shrink-0">{item.step}</div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-white text-sm">{item.title}</p>
              <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <SectionTitle>Rate Limiting</SectionTitle>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Setiap provider memiliki rate limit yang dikonfigurasi per-menit dan per-hari.
        Jika melebihi limit, API akan mengembalikan status <code className="text-primary font-mono text-xs">429 Too Many Requests</code> dengan header <code className="text-primary font-mono text-xs">Retry-After</code>.
      </p>

      <SectionTitle>Content Type</SectionTitle>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Semua request dan response menggunakan <code className="text-primary font-mono text-xs">application/json</code>.
      </p>
    </div>
  );
}

function AuthSection() {
  return (
    <div className="prose dark:prose-invert max-w-none prose-sm">
      <h2 className="text-xl font-bold">Autentikasi</h2>
      <p>Semua request ke API harus menyertakan header autentikasi berikut:</p>

      <SectionTitle>Required Headers</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Header</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Tipe</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Wajib</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Deskripsi</th>
            </tr>
          </thead>
          <tbody>
            <ParamRow name="X-API-Key" type="string" required desc="API Key yang diberikan saat registrasi provider" />
            <ParamRow name="X-Timestamp" type="integer" required desc="Unix timestamp (detik). Toleransi: ±5 menit" />
            <ParamRow name="X-Signature" type="string" required desc="HMAC-SHA256 signature (lihat cara generate di bawah)" />
            <ParamRow name="X-Idempotency-Key" type="string" required desc="Unique key per transaksi (8-100 karakter). Hanya untuk endpoint payment" />
            <ParamRow name="Content-Type" type="string" required desc="Harus: application/json" />
          </tbody>
        </table>
      </div>

      <SectionTitle>Cara Generate Signature</SectionTitle>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Signature dibuat menggunakan <strong>HMAC-SHA256</strong> dengan formula:
      </p>
      <CodeBlock title="Formula Signature">
{`signature = HMAC-SHA256(
  key   = API_SECRET,
  data  = API_KEY + TIMESTAMP + REQUEST_BODY
)`}
      </CodeBlock>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Dimana <code className="font-mono text-primary text-xs">REQUEST_BODY</code> adalah raw JSON body yang dikirim (persis sama, termasuk spasi).
      </p>

      <CodeBlock title="Contoh Generate Signature" lang="JavaScript">
{`const crypto = require('crypto');

const apiKey = 'your_api_key';
const apiSecret = 'your_api_secret';
const timestamp = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify({ cust_id: '123456' });

const payload = apiKey + timestamp + body;
const signature = crypto
  .createHmac('sha256', apiSecret)
  .update(payload)
  .digest('hex');

// Kirim headers:
// X-API-Key: your_api_key
// X-Timestamp: 1712500000
// X-Signature: a1b2c3d4e5...`}
      </CodeBlock>

      <CodeBlock title="Contoh Generate Signature" lang="Python">
{`import hmac, hashlib, json, time

api_key = 'your_api_key'
api_secret = 'your_api_secret'
timestamp = str(int(time.time()))
body = json.dumps({"cust_id": "123456"})

payload = api_key + timestamp + body
signature = hmac.new(
    api_secret.encode(),
    payload.encode(),
    hashlib.sha256
).hexdigest()`}
      </CodeBlock>

      <CodeBlock title="Contoh Generate Signature" lang="PHP">
{`<?php
$apiKey = 'your_api_key';
$apiSecret = 'your_api_secret';
$timestamp = (string)time();
$body = json_encode(['cust_id' => '123456']);

$payload = $apiKey . $timestamp . $body;
$signature = hash_hmac('sha256', $payload, $apiSecret);`}
      </CodeBlock>

      <SectionTitle>Timestamp Validation</SectionTitle>
      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-amber-600 text-lg mt-0.5">warning</span>
          <div className="text-sm text-amber-700 dark:text-amber-400">
            <p className="font-semibold">Penting</p>
            <p>Timestamp harus dalam rentang ±5 menit dari waktu server. Request dengan timestamp expired akan ditolak dengan error <code className="font-mono">TIMESTAMP_EXPIRED</code>.</p>
          </div>
        </div>
      </div>

      <SectionTitle>IP Whitelist</SectionTitle>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Jika admin mengkonfigurasi IP whitelist untuk provider Anda, hanya request dari IP yang terdaftar yang diperbolehkan.
        Request dari IP lain akan mendapat error <code className="font-mono text-primary text-xs">403 IP_NOT_ALLOWED</code>.
      </p>
    </div>
  );
}

function InquirySection() {
  return (
    <div className="prose dark:prose-invert max-w-none prose-sm">
      <h2 className="text-xl font-bold">Inquiry Tagihan</h2>
      <p>Cek detail tagihan PDAM berdasarkan ID pelanggan.</p>

      <Endpoint method="POST" path="/api/v1/pdam/inquiry" />

      <SectionTitle>Request Body</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-slate-50 dark:bg-slate-800">
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Parameter</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Tipe</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Wajib</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Deskripsi</th>
          </tr></thead>
          <tbody>
            <ParamRow name="cust_id" type="string" required desc="ID pelanggan PDAM (6-15 digit angka)" />
          </tbody>
        </table>
      </div>

      <CodeBlock title="Request Example">
{`POST /api/v1/pdam/inquiry
Content-Type: application/json
X-API-Key: YOUR_API_KEY
X-Timestamp: 1712500000
X-Signature: a1b2c3d4...

{
  "cust_id": "0401234567"
}`}
      </CodeBlock>

      <SectionTitle>Response Success (200)</SectionTitle>
      <CodeBlock title="Response">
{`{
  "success": true,
  "data": {
    "cust_id": "0401234567",
    "nama": "JOHN DOE",
    "alamat": "JL. MERDEKA NO. 10 RT.001",
    "golongan": "R1",
    "jumlah_tagihan": 2,
    "total_bayar": 150000,
    "admin_fee": 2500,
    "grand_total": 152500,
    "tagihan": [
      {
        "periode": "202603",
        "nama": "JOHN DOE",
        "alamat": "JL. MERDEKA NO. 10 RT.001",
        "golongan": "R1",
        "stand_lalu": "00150",
        "stand_ini": "00170",
        "pakai": "20",
        "harga": 55000,
        "denda": 0,
        "biaya_admin": 2500,
        "biaya_meter": 0,
        "biaya_tetap": 5000,
        "limbah": 2000,
        "retribusi": 0,
        "materai": 0,
        "diskon": 0,
        "subtotal": 64500,
        "total": 75000,
        "status": "1"
      },
      {
        "periode": "202604",
        "...": "..."
      }
    ]
  }
}`}
      </CodeBlock>

      <SectionTitle>Field Response Data</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-slate-50 dark:bg-slate-800">
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Field</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Tipe</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Deskripsi</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            <tr><td className="px-4 py-2 font-mono text-sm text-primary">cust_id</td><td className="px-4 py-2 text-xs"><Badge color="slate">string</Badge></td><td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">ID pelanggan</td></tr>
            <tr><td className="px-4 py-2 font-mono text-sm text-primary">nama</td><td className="px-4 py-2 text-xs"><Badge color="slate">string</Badge></td><td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Nama pelanggan</td></tr>
            <tr><td className="px-4 py-2 font-mono text-sm text-primary">alamat</td><td className="px-4 py-2 text-xs"><Badge color="slate">string</Badge></td><td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Alamat pelanggan</td></tr>
            <tr><td className="px-4 py-2 font-mono text-sm text-primary">jumlah_tagihan</td><td className="px-4 py-2 text-xs"><Badge color="slate">integer</Badge></td><td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Jumlah periode tagihan</td></tr>
            <tr><td className="px-4 py-2 font-mono text-sm text-primary">total_bayar</td><td className="px-4 py-2 text-xs"><Badge color="slate">number</Badge></td><td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Total tagihan (IDR)</td></tr>
            <tr><td className="px-4 py-2 font-mono text-sm text-primary">admin_fee</td><td className="px-4 py-2 text-xs"><Badge color="slate">number</Badge></td><td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Biaya admin per transaksi</td></tr>
            <tr><td className="px-4 py-2 font-mono text-sm text-primary">grand_total</td><td className="px-4 py-2 text-xs"><Badge color="slate">number</Badge></td><td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Total + admin fee (yang harus dibayar)</td></tr>
            <tr><td className="px-4 py-2 font-mono text-sm text-primary">tagihan</td><td className="px-4 py-2 text-xs"><Badge color="slate">array</Badge></td><td className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">Detail tagihan per periode</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentSection() {
  return (
    <div className="prose dark:prose-invert max-w-none prose-sm">
      <h2 className="text-xl font-bold">Payment Tagihan</h2>
      <p>Bayar tagihan PDAM pelanggan. Endpoint ini bersifat <strong>idempotent</strong> — request dengan idempotency key yang sama akan mengembalikan hasil yang sama tanpa memproses ulang.</p>

      <Endpoint method="POST" path="/api/v1/pdam/pay" />

      <SectionTitle>Request Body</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-slate-50 dark:bg-slate-800">
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Parameter</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Tipe</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Wajib</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Deskripsi</th>
          </tr></thead>
          <tbody>
            <ParamRow name="cust_id" type="string" required desc="ID pelanggan PDAM (6-15 digit angka)" />
            <ParamRow name="amount" type="number" desc="Jumlah yang akan dibayar (grand_total dari inquiry). Jika diisi, divalidasi dengan tagihan aktual" />
            <ParamRow name="provider_ref" type="string" desc="Reference ID dari sistem provider (untuk tracking internal provider)" />
          </tbody>
        </table>
      </div>

      <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 my-4">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-blue-600 text-lg mt-0.5">info</span>
          <div className="text-sm text-blue-700 dark:text-blue-400">
            <p className="font-semibold">Idempotency Key</p>
            <p>Header <code className="font-mono">X-Idempotency-Key</code> wajib untuk endpoint ini. Gunakan unique ID per transaksi (misalnya UUID). Jika request dengan key yang sama dikirim ulang, sistem akan mengembalikan hasil transaksi sebelumnya.</p>
          </div>
        </div>
      </div>

      <CodeBlock title="Request Example">
{`POST /api/v1/pdam/pay
Content-Type: application/json
X-API-Key: YOUR_API_KEY
X-Timestamp: 1712500000
X-Signature: a1b2c3d4...
X-Idempotency-Key: PAY-20260408-UUID-12345

{
  "cust_id": "0401234567",
  "amount": 152500,
  "provider_ref": "INV-2026-001"
}`}
      </CodeBlock>

      <SectionTitle>Response Success (200)</SectionTitle>
      <CodeBlock title="Response">
{`{
  "success": true,
  "data": {
    "transaction_code": "20260408143022-A1B2C3D4E5F6",
    "cust_id": "0401234567",
    "nama": "JOHN DOE",
    "alamat": "JL. MERDEKA NO. 10 RT.001",
    "jumlah_tagihan": 2,
    "amount": 150000,
    "admin_fee": 2500,
    "grand_total": 152500,
    "status": "SUCCESS",
    "paid_at": "2026-04-08T14:30:22.000Z",
    "bills": [
      { "periode": "202603", "subtotal": 64500, "total": 75000 },
      { "periode": "202604", "subtotal": 64500, "total": 75000 }
    ]
  },
  "duration_ms": 1250
}`}
      </CodeBlock>

      <SectionTitle>Response Idempotent (sudah diproses)</SectionTitle>
      <CodeBlock title="Response (request ulang dengan key sama)">
{`{
  "success": true,
  "idempotent": true,
  "data": { ... }
}`}
      </CodeBlock>

      <SectionTitle>Response Payment In Progress (409)</SectionTitle>
      <CodeBlock title="Response">
{`{
  "success": false,
  "error_code": "PAYMENT_IN_PROGRESS",
  "message": "Payment sedang diproses"
}`}
      </CodeBlock>

      <SectionTitle>Saldo Provider</SectionTitle>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Pembayaran akan dipotong dari saldo deposit provider. Jika saldo tidak mencukupi, API mengembalikan status <code className="font-mono text-primary text-xs">402</code> dengan error <code className="font-mono text-primary text-xs">INSUFFICIENT_BALANCE</code>.
      </p>
    </div>
  );
}

function WebhookSection() {
  return (
    <div className="prose dark:prose-invert max-w-none prose-sm">
      <h2 className="text-xl font-bold">Webhook Callback</h2>
      <p>Jika webhook URL dikonfigurasi, sistem akan mengirim notifikasi ke URL provider saat payment selesai (baik success maupun failed).</p>

      <SectionTitle>Webhook Headers</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-slate-50 dark:bg-slate-800">
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Header</th>
            <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Deskripsi</th>
          </tr></thead>
          <tbody>
            <tr className="border-b border-slate-100 dark:border-slate-800"><td className="px-4 py-2.5 font-mono text-sm text-primary">Content-Type</td><td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400">application/json</td></tr>
            <tr className="border-b border-slate-100 dark:border-slate-800"><td className="px-4 py-2.5 font-mono text-sm text-primary">X-Webhook-Signature</td><td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400">HMAC-SHA256(body, webhook_secret). Disertakan jika webhook secret dikonfigurasi</td></tr>
            <tr><td className="px-4 py-2.5 font-mono text-sm text-primary">X-Webhook-Timestamp</td><td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400">ISO 8601 timestamp saat webhook dikirim</td></tr>
          </tbody>
        </table>
      </div>

      <SectionTitle>Webhook Payload (Success)</SectionTitle>
      <CodeBlock title="POST ke webhook_url">
{`{
  "event": "payment.success",
  "idempotency_key": "PAY-20260408-UUID-12345",
  "provider_ref": "INV-2026-001",
  "transaction_code": "20260408143022-A1B2C3D4E5F6",
  "cust_id": "0401234567",
  "amount": 150000,
  "admin_fee": 2500,
  "total": 152500,
  "status": "SUCCESS",
  "timestamp": "2026-04-08T14:30:22.000Z"
}`}
      </CodeBlock>

      <SectionTitle>Webhook Payload (Failed)</SectionTitle>
      <CodeBlock title="POST ke webhook_url">
{`{
  "event": "payment.failed",
  "idempotency_key": "PAY-20260408-UUID-12345",
  "provider_ref": "INV-2026-001",
  "transaction_code": "20260408143022-A1B2C3D4E5F6",
  "cust_id": "0401234567",
  "amount": 150000,
  "admin_fee": 2500,
  "total": 152500,
  "status": "FAILED",
  "error_code": "PDAM_403",
  "error_message": "Payment gagal diproses oleh PDAM",
  "timestamp": "2026-04-08T14:30:25.000Z"
}`}
      </CodeBlock>

      <SectionTitle>Retry Policy</SectionTitle>
      <p className="text-sm text-slate-600 dark:text-slate-400">Webhook akan di-retry hingga <strong>3 kali</strong> dengan exponential backoff (1s, 2s, 4s). Webhook dianggap berhasil jika menerima response HTTP <code className="font-mono text-primary text-xs">2xx</code>.</p>

      <SectionTitle>Verifikasi Webhook</SectionTitle>
      <p className="text-sm text-slate-600 dark:text-slate-400">Untuk memastikan webhook benar dari sistem kami, verifikasi signature:</p>
      <CodeBlock title="Verifikasi Webhook" lang="JavaScript">
{`const crypto = require('crypto');

function verifyWebhook(body, signature, webhookSecret) {
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

// Di endpoint webhook Anda:
app.post('/webhook/pdam', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const rawBody = JSON.stringify(req.body);
  
  if (!verifyWebhook(rawBody, signature, WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Proses webhook...
  const { event, idempotency_key, status } = req.body;
  console.log(\`Payment \${idempotency_key}: \${status}\`);
  
  res.status(200).send('OK');
});`}
      </CodeBlock>
    </div>
  );
}

function ErrorsSection() {
  const errors = [
    { code: "MISSING_AUTH_HEADERS", http: 401, desc: "Header X-API-Key, X-Timestamp, atau X-Signature tidak ditemukan" },
    { code: "INVALID_TIMESTAMP", http: 401, desc: "Format X-Timestamp tidak valid (harus unix timestamp)" },
    { code: "TIMESTAMP_EXPIRED", http: 401, desc: "Timestamp sudah expired (toleransi ±5 menit)" },
    { code: "INVALID_API_KEY", http: 401, desc: "API Key tidak ditemukan atau tidak valid" },
    { code: "INVALID_SIGNATURE", http: 401, desc: "HMAC signature tidak cocok" },
    { code: "PROVIDER_INACTIVE", http: 403, desc: "Akun provider suspended atau nonaktif" },
    { code: "IP_NOT_ALLOWED", http: 403, desc: "Request dari IP yang tidak di-whitelist" },
    { code: "RATE_LIMITED", http: 429, desc: "Rate limit terlampaui (per-menit atau per-hari)" },
    { code: "INVALID_BODY", http: 400, desc: "Body bukan JSON yang valid" },
    { code: "INVALID_CUST_ID", http: 400, desc: "cust_id tidak valid (harus 6-15 digit)" },
    { code: "MISSING_IDEMPOTENCY_KEY", http: 400, desc: "Header X-Idempotency-Key tidak ada (wajib untuk payment)" },
    { code: "AMOUNT_MISMATCH", http: 400, desc: "Amount tidak cocok dengan tagihan aktual" },
    { code: "INSUFFICIENT_BALANCE", http: 402, desc: "Saldo deposit provider tidak mencukupi" },
    { code: "PAYMENT_IN_PROGRESS", http: 409, desc: "Payment dengan idempotency key ini sedang diproses" },
    { code: "PDAM_403", http: 422, desc: "Pelanggan tidak ditemukan atau tagihan tidak tersedia" },
    { code: "PDAM_404", http: 422, desc: "Client ID PDAM tidak valid" },
    { code: "PDAM_405", http: 422, desc: "Diblokir oleh PDAM" },
    { code: "PDAM_406", http: 422, desc: "Transaksi gagal diproses oleh PDAM" },
    { code: "NO_BILLS", http: 422, desc: "Tidak ada tagihan untuk pelanggan ini" },
    { code: "NETWORK_TIMEOUT", http: 504, desc: "Koneksi ke server PDAM timeout" },
    { code: "NETWORK_ERROR", http: 502, desc: "Gagal terhubung ke server PDAM" },
    { code: "INTERNAL_ERROR", http: 500, desc: "Internal server error" },
  ];

  return (
    <div className="prose dark:prose-invert max-w-none prose-sm">
      <h2 className="text-xl font-bold">Error Codes</h2>
      <p>Semua error response memiliki format seragam:</p>
      <CodeBlock title="Error Response Format">
{`{
  "success": false,
  "error_code": "ERROR_CODE",
  "message": "Deskripsi error dalam Bahasa Indonesia"
}`}
      </CodeBlock>

      <SectionTitle>Daftar Error Codes</SectionTitle>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Error Code</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">HTTP</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-500">Deskripsi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {errors.map((e) => (
              <tr key={e.code}>
                <td className="px-4 py-2.5 font-mono text-xs text-primary font-medium">{e.code}</td>
                <td className="px-4 py-2.5">
                  <Badge color={e.http < 400 ? "green" : e.http < 500 ? "amber" : "red"}>{e.http}</Badge>
                </td>
                <td className="px-4 py-2.5 text-sm text-slate-600 dark:text-slate-400">{e.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExamplesSection() {
  return (
    <div className="prose dark:prose-invert max-w-none prose-sm">
      <h2 className="text-xl font-bold">Contoh Kode Lengkap</h2>

      <SectionTitle>Node.js (axios)</SectionTitle>
      <CodeBlock title="Inquiry + Payment Flow" lang="JavaScript">
{`const axios = require('axios');
const crypto = require('crypto');

const API_KEY = 'your_api_key';
const API_SECRET = 'your_api_secret';
const BASE_URL = 'https://your-domain.com/api/v1/pdam';

function createHeaders(body, idempotencyKey = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = API_KEY + timestamp + body;
  const signature = crypto
    .createHmac('sha256', API_SECRET)
    .update(payload)
    .digest('hex');

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };

  if (idempotencyKey) {
    headers['X-Idempotency-Key'] = idempotencyKey;
  }

  return headers;
}

// ========== INQUIRY ==========
async function inquiry(custId) {
  const body = JSON.stringify({ cust_id: custId });
  const headers = createHeaders(body);

  const res = await axios.post(
    BASE_URL + '/inquiry',
    body,
    { headers }
  );

  console.log('Tagihan:', res.data.data);
  return res.data;
}

// ========== PAYMENT ==========
async function pay(custId, amount, providerRef) {
  const idempotencyKey = \`PAY-\${Date.now()}-\${crypto.randomUUID()}\`;
  const body = JSON.stringify({
    cust_id: custId,
    amount: amount,
    provider_ref: providerRef,
  });
  const headers = createHeaders(body, idempotencyKey);

  const res = await axios.post(
    BASE_URL + '/pay',
    body,
    { headers }
  );

  console.log('Payment result:', res.data);
  return res.data;
}

// ========== FULL FLOW ==========
async function main() {
  try {
    // 1. Inquiry
    const inq = await inquiry('0401234567');
    console.log(\`Tagihan: \${inq.data.jumlah_tagihan} bulan\`);
    console.log(\`Total: Rp \${inq.data.grand_total}\`);

    // 2. Payment
    const pay_result = await pay(
      '0401234567',
      inq.data.grand_total,
      'INV-2026-001'
    );
    console.log(\`Status: \${pay_result.data.status}\`);
    console.log(\`Kode: \${pay_result.data.transaction_code}\`);
  } catch (err) {
    if (err.response) {
      console.error('API Error:', err.response.data);
    } else {
      console.error('Network Error:', err.message);
    }
  }
}

main();`}
      </CodeBlock>

      <SectionTitle>Python (requests)</SectionTitle>
      <CodeBlock title="Inquiry + Payment Flow" lang="Python">
{`import requests
import hmac
import hashlib
import json
import time
import uuid

API_KEY = 'your_api_key'
API_SECRET = 'your_api_secret'
BASE_URL = 'https://your-domain.com/api/v1/pdam'

def create_headers(body: str, idempotency_key: str = None) -> dict:
    timestamp = str(int(time.time()))
    payload = API_KEY + timestamp + body
    signature = hmac.new(
        API_SECRET.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()

    headers = {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
    }
    if idempotency_key:
        headers['X-Idempotency-Key'] = idempotency_key
    return headers

# ========== INQUIRY ==========
def inquiry(cust_id: str) -> dict:
    body = json.dumps({"cust_id": cust_id})
    headers = create_headers(body)
    res = requests.post(f"{BASE_URL}/inquiry", data=body, headers=headers)
    res.raise_for_status()
    return res.json()

# ========== PAYMENT ==========
def pay(cust_id: str, amount: float, provider_ref: str = None) -> dict:
    idempotency_key = f"PAY-{int(time.time())}-{uuid.uuid4()}"
    body = json.dumps({
        "cust_id": cust_id,
        "amount": amount,
        "provider_ref": provider_ref,
    })
    headers = create_headers(body, idempotency_key)
    res = requests.post(f"{BASE_URL}/pay", data=body, headers=headers)
    res.raise_for_status()
    return res.json()

# ========== FULL FLOW ==========
if __name__ == '__main__':
    try:
        # 1. Inquiry
        inq = inquiry('0401234567')
        data = inq['data']
        print(f"Tagihan: {data['jumlah_tagihan']} bulan")
        print(f"Total: Rp {data['grand_total']:,.0f}")

        # 2. Payment
        result = pay('0401234567', data['grand_total'], 'INV-2026-001')
        print(f"Status: {result['data']['status']}")
        print(f"Kode: {result['data']['transaction_code']}")
    except requests.HTTPError as e:
        print(f"API Error: {e.response.json()}")
    except Exception as e:
        print(f"Error: {e}")`}
      </CodeBlock>

      <SectionTitle>PHP (cURL)</SectionTitle>
      <CodeBlock title="Inquiry + Payment Flow" lang="PHP">
{`<?php
$API_KEY = 'your_api_key';
$API_SECRET = 'your_api_secret';
$BASE_URL = 'https://your-domain.com/api/v1/pdam';

function createHeaders($body, $idempotencyKey = null) {
    global $API_KEY, $API_SECRET;
    $timestamp = (string)time();
    $payload = $API_KEY . $timestamp . $body;
    $signature = hash_hmac('sha256', $payload, $API_SECRET);

    $headers = [
        'Content-Type: application/json',
        'X-API-Key: ' . $API_KEY,
        'X-Timestamp: ' . $timestamp,
        'X-Signature: ' . $signature,
    ];
    if ($idempotencyKey) {
        $headers[] = 'X-Idempotency-Key: ' . $idempotencyKey;
    }
    return $headers;
}

function apiRequest($url, $body, $idempotencyKey = null) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt($ch, CURLOPT_HTTPHEADER, createHeaders($body, $idempotencyKey));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['status' => $httpCode, 'data' => json_decode($response, true)];
}

// ========== INQUIRY ==========
$body = json_encode(['cust_id' => '0401234567']);
$inq = apiRequest($BASE_URL . '/inquiry', $body);

if ($inq['data']['success']) {
    $data = $inq['data']['data'];
    echo "Tagihan: {$data['jumlah_tagihan']} bulan\\n";
    echo "Total: Rp " . number_format($data['grand_total']) . "\\n";

    // ========== PAYMENT ==========
    $idempotencyKey = 'PAY-' . time() . '-' . uniqid();
    $payBody = json_encode([
        'cust_id' => '0401234567',
        'amount' => $data['grand_total'],
        'provider_ref' => 'INV-2026-001',
    ]);
    $pay = apiRequest($BASE_URL . '/pay', $payBody, $idempotencyKey);
    
    if ($pay['data']['success']) {
        echo "Status: " . $pay['data']['data']['status'] . "\\n";
        echo "Kode: " . $pay['data']['data']['transaction_code'] . "\\n";
    } else {
        echo "Payment Error: " . $pay['data']['message'] . "\\n";
    }
} else {
    echo "Inquiry Error: " . $inq['data']['message'] . "\\n";
}
?>`}
      </CodeBlock>

      <SectionTitle>cURL</SectionTitle>
      <CodeBlock title="Inquiry via cURL" lang="Bash">
{`# Generate signature (bash)
API_KEY="your_api_key"
API_SECRET="your_api_secret"
TIMESTAMP=$(date +%s)
BODY='{"cust_id":"0401234567"}'

PAYLOAD="\${API_KEY}\${TIMESTAMP}\${BODY}"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$API_SECRET" | awk '{print $2}')

curl -X POST https://your-domain.com/api/v1/pdam/inquiry \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: $API_KEY" \\
  -H "X-Timestamp: $TIMESTAMP" \\
  -H "X-Signature: $SIGNATURE" \\
  -d "$BODY"`}
      </CodeBlock>
    </div>
  );
}
