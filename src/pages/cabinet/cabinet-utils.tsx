export const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " \u20BD";
export const fmtDate = (d: string) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };

export const statusLabel: Record<string, string> = { active: "Активен", overdue: "Просрочен", closed: "Закрыт", pending: "Ожидается", paid: "Оплачен", partial: "Частично" };
export const statusVariant = (s: string) => s === "active" || s === "paid" ? "default" : s === "overdue" ? "destructive" : "secondary";

export const MobileRow = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className="flex justify-between items-baseline py-1.5 border-b border-muted/40 last:border-0">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-sm font-medium text-right ${className || ""}`}>{value}</span>
  </div>
);
