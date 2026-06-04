import Link from "next/link";

export default function InvoiceFinishPage({ params }: { params: { token: string } }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        <span className="material-symbols-outlined text-6xl text-emerald-600">check_circle</span>
        <h1 className="text-2xl font-black mt-4">Pembayaran Diterima</h1>
        <p className="text-slate-500 mt-2">Status final akan diperbarui otomatis setelah notifikasi gateway diproses.</p>
        <Link href={`/i/${params.token}`} className="mt-6 inline-flex px-5 py-3 rounded-xl bg-primary text-white font-bold">Kembali ke Invoice</Link>
      </div>
    </main>
  );
}
