import Link from "next/link";

export default function InvoiceUnfinishPage({ params }: { params: { token: string } }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
        <span className="material-symbols-outlined text-6xl text-amber-600">hourglass_top</span>
        <h1 className="text-2xl font-black mt-4">Pembayaran Belum Selesai</h1>
        <p className="text-slate-500 mt-2">Silakan lanjutkan pembayaran dari halaman invoice.</p>
        <Link href={`/i/${params.token}`} className="mt-6 inline-flex px-5 py-3 rounded-xl bg-primary text-white font-bold">Lihat Invoice</Link>
      </div>
    </main>
  );
}
