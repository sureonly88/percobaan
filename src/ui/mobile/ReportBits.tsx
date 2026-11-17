import Link from "next/link";
import { formatRp } from "@/lib/mobile/products";

const STATUS: Record<string, [string, string]> = {
  BARU: ["Baru", "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"],
  DIPROSES: ["Diproses", "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"],
  SELESAI: ["Selesai", "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"],
};

export function ReportStatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUS[status] || [status, "bg-slate-100 text-slate-600"];
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${cls}`}>{label}</span>;
}

export interface ReportListItem {
  id: number;
  customerName: string | null;
  customerId: string | null;
  categoryLabel: string;
  status: string;
  awaiting: string;
  reportedBy: string;
  assignedTo: string | null;
  loketCode: string | null;
  totalAmount: number;
  lastMessageAt: string;
}

/** Satu baris laporan; `highlight` = menunggu tanggapan pengguna yang melihat. */
export function ReportRow({ r, highlight, showReporter }: { r: ReportListItem; highlight: boolean; showReporter: boolean }) {
  return (
    <li>
      <Link href={`/m/masalah/${r.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800">
        <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${highlight ? "bg-red-600" : "bg-transparent"}`} aria-hidden />
        <div className="flex-1 min-w-0">
          <p className={`text-sm truncate ${highlight ? "font-bold" : "font-medium"}`}>{r.customerName || r.customerId || `Laporan #${r.id}`}</p>
          <p className="text-xs text-slate-500 truncate">{r.categoryLabel}</p>
          <p className="text-[11px] text-slate-400 truncate">
            #{r.id}
            {showReporter ? ` · ${r.reportedBy} · ${r.loketCode || "-"}` : ""}
            {r.assignedTo ? ` · ditangani ${r.assignedTo}` : ""} ·{" "}
            {new Date(r.lastMessageAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{formatRp(r.totalAmount)}</p>
          <span className="mt-1 inline-block"><ReportStatusBadge status={r.status} /></span>
        </div>
      </Link>
    </li>
  );
}
