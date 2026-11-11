import Link from "next/link";
import { MobileHeader } from "@/ui/mobile/MobileShell";
import { MOBILE_PRODUCTS } from "@/lib/mobile/products";

export default function MobileBayarPage() {
  return (
    <div>
      <MobileHeader title="Bayar" subtitle="Pilih jenis pembayaran" />
      <ul className="p-4 grid grid-cols-1 gap-2">
        {MOBILE_PRODUCTS.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/m/bayar/${p.slug}`}
              className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-900 px-4 h-16 active:bg-slate-50 dark:active:bg-slate-800"
            >
              <span className={`h-10 w-10 rounded-xl flex items-center justify-center ${p.tone}`}>
                <span className="material-symbols-outlined">{p.icon}</span>
              </span>
              <span className="flex-1 font-medium">{p.label}</span>
              <span className="material-symbols-outlined text-slate-400">chevron_right</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
