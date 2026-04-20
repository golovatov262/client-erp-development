import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DataTable, { Column } from "@/components/ui/data-table";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, { SavingApplication, Member, Organization } from "@/lib/api";
import SavingApplicationDialog from "./SavingApplicationDialog";

const fmt = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";

const statusLabels: Record<string, string> = {
  new: "Новая", in_review: "На рассмотрении", concluded: "Договор заключён", annulled: "Аннулирована",
};
const statusVariant = (s: string): "default" | "destructive" | "secondary" | "warning" => {
  if (s === "concluded") return "default";
  if (s === "annulled") return "destructive";
  if (s === "in_review") return "warning";
  return "secondary";
};

type Props = {
  members: Member[];
  orgs: Organization[];
  canEdit: boolean;
  openCreate: number;
  onConsumeOpenCreate: () => void;
  onSavingCreated: () => void;
};

const SavingApplicationsTab = ({ members, orgs, canEdit, openCreate, onConsumeOpenCreate, onSavingCreated }: Props) => {
  const [items, setItems] = useState<SavingApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editItem, setEditItem] = useState<SavingApplication | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api.savingApplications.list().then(setItems).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (openCreate) {
      setEditItem(null);
      setShowForm(true);
      onConsumeOpenCreate();
    }
  }, [openCreate, onConsumeOpenCreate]);

  const filtered = items.filter(i => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || (i.application_no || "").toLowerCase().includes(q)
      || (i.last_name || "").toLowerCase().includes(q)
      || (i.first_name || "").toLowerCase().includes(q)
      || (i.member_name || "").toLowerCase().includes(q)
      || (i.phone || "").includes(q);
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const handleAnnul = async (i: SavingApplication) => {
    const reason = prompt("Причина аннулирования:");
    if (reason === null) return;
    try {
      await api.savingApplications.annul(i.id, reason);
      toast({ title: "Заявка аннулирована" });
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleConclude = async (i: SavingApplication) => {
    if (!confirm(`Заключить договор сбережений по заявке ${i.application_no}?`)) return;
    try {
      const res = await api.savingApplications.conclude(i.id);
      toast({ title: "Договор заключён", description: `Создан договор сбережений ${res.contract_no}` });
      load();
      onSavingCreated();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const columns: Column<SavingApplication>[] = [
    { key: "application_no", label: "№ заявки", className: "font-medium" },
    { key: "last_name", label: "Вкладчик", render: i => i.member_name || [i.last_name, i.first_name, i.middle_name].filter(Boolean).join(" ") || "—" },
    { key: "phone", label: "Телефон", render: i => i.phone || "—" },
    { key: "amount", label: "Сумма", render: i => fmt(i.amount) },
    { key: "term_months", label: "Срок", render: i => i.term_months ? `${i.term_months} мес.` : "—" },
    { key: "rate", label: "Ставка", render: i => i.rate ? `${i.rate}%` : "—" },
    { key: "payout_type", label: "Выплата %", render: i => i.payout_type === "monthly" ? "Ежемесячно" : i.payout_type === "end_of_term" ? "В конце срока" : "—" },
    { key: "curator_name", label: "Куратор", render: i => <span className="text-xs text-muted-foreground">{(i as SavingApplication & { curator_name?: string }).curator_name || "—"}</span> },
    { key: "status", label: "Статус", render: i => <Badge variant={statusVariant(i.status)} className="text-xs">{statusLabels[i.status] || i.status}</Badge> },
    { key: "created_at", label: "Создана", render: i => i.created_at ? new Date(i.created_at).toLocaleDateString("ru-RU") : "—" },
    { key: "id", label: "", render: i => (
      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
        <button className="p-1 rounded hover:bg-muted" title="Согласие на обработку ПД" onClick={() => api.export.download("saving_application", i.id, "docx")}>
          <Icon name="FileText" size={14} className="text-blue-500" />
        </button>
        {canEdit && i.status !== "concluded" && i.status !== "annulled" && (
          <>
            <button className="p-1 rounded hover:bg-muted" title="Заключить договор" onClick={() => handleConclude(i)}>
              <Icon name="CheckCircle" size={14} className="text-green-600" />
            </button>
            <button className="p-1 rounded hover:bg-muted" title="Аннулировать" onClick={() => handleAnnul(i)}>
              <Icon name="XCircle" size={14} className="text-red-500" />
            </button>
          </>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Поиск по заявке, ФИО, телефону..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="new">Новые</SelectItem>
            <SelectItem value="in_review">На рассмотрении</SelectItem>
            <SelectItem value="concluded">Договор заключён</SelectItem>
            <SelectItem value="annulled">Аннулированные</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load}>
          <Icon name="RefreshCw" size={14} className="mr-1" /> Обновить
        </Button>
      </div>

      <DataTable columns={columns} data={filtered} loading={loading} onRowClick={i => { setEditItem(i); setShowForm(true); }} />

      <SavingApplicationDialog
        open={showForm}
        onOpenChange={v => { setShowForm(v); if (!v) setEditItem(null); }}
        item={editItem}
        members={members}
        orgs={orgs}
        canEdit={canEdit}
        onSaved={() => { setShowForm(false); setEditItem(null); load(); }}
        onSavingCreated={() => { load(); onSavingCreated(); }}
      />
    </div>
  );
};

export default SavingApplicationsTab;