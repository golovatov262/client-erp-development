import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { Column } from "@/components/ui/data-table";
import api, { Saving } from "@/lib/api";

export const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
export const fmtDate = (d: string) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };

const savingsColumns: Column<Saving>[] = [
  { key: "contract_no", label: "Договор", className: "font-medium" },
  { key: "member_name", label: "Пайщик" },
  { key: "org_name", label: "Организация", render: (i: Saving) => <span className="text-xs text-muted-foreground">{i.org_short_name || i.org_name || "—"}</span> },
  { key: "amount", label: "Сумма вклада", render: (i: Saving) => fmt(i.amount) },
  { key: "rate", label: "Ставка", render: (i: Saving) => i.rate + "%" },
  { key: "term_months", label: "Срок", render: (i: Saving) => i.term_months + " мес." },
  { key: "accrued_interest", label: "Начислено %", render: (i: Saving) => fmt(i.accrued_interest) },
  { key: "min_balance_pct", label: "Несниж.%", render: (i: Saving) => <span className="text-xs">{i.min_balance_pct > 0 ? i.min_balance_pct + "%" : "—"}</span> },
  { key: "payout_type", label: "Выплата", render: (i: Saving) => <span className="text-xs">{i.payout_type === "monthly" ? "Ежемесячно" : "В конце срока"}</span> },
  { key: "end_date", label: "Окончание", render: (i: Saving) => fmtDate(i.end_date) },
  { key: "status", label: "Статус", render: (i: Saving) => <Badge variant={i.status === "active" ? "default" : "secondary"} className="text-xs">{i.status === "active" ? "Активен" : i.status === "early_closed" ? "Досрочно" : "Закрыт"}</Badge> },
  { key: "id", label: "", render: (i: Saving) => (
    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
      <button className="p-1 rounded hover:bg-muted" title="Excel" onClick={() => api.export.download("saving", i.id, "xlsx")}><Icon name="FileSpreadsheet" size={14} className="text-green-600" /></button>
      <button className="p-1 rounded hover:bg-muted" title="PDF" onClick={() => api.export.download("saving", i.id, "pdf")}><Icon name="FileText" size={14} className="text-red-500" /></button>
    </div>
  )},
];

export default savingsColumns;
