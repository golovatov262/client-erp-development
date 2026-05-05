import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DataTable, { Column } from "@/components/ui/data-table";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, { LoanApplication, Member, Organization } from "@/lib/api";
import LoanApplicationDialog from "./LoanApplicationDialog";
import LoanApplicationApproveDialog from "./LoanApplicationApproveDialog";

const fmt = (n?: number | null) => n == null ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
const statusLabels: Record<string, string> = {
  new: "Новая", in_review: "На рассмотрении", approved: "Одобрена", rejected: "Отклонена", archived: "Архив",
};
const statusVariant = (s: string): "default" | "destructive" | "secondary" | "warning" => {
  if (s === "approved") return "default";
  if (s === "rejected") return "destructive";
  if (s === "in_review") return "warning";
  return "secondary";
};

type Props = {
  members: Member[];
  orgs: Organization[];
  canEdit: boolean;
  openCreate: number;
  onConsumeOpenCreate: () => void;
  onLoanCreated: () => void;
};

const LoanApplicationsTab = ({ members, orgs, canEdit, openCreate, onConsumeOpenCreate, onLoanCreated }: Props) => {
  const [items, setItems] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [editItem, setEditItem] = useState<LoanApplication | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [approveItem, setApproveItem] = useState<LoanApplication | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api.loanApplications.list().then(setItems).finally(() => setLoading(false));
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
    const matchSearch = !q || (i.application_no || "").toLowerCase().includes(q) || (i.full_name || "").toLowerCase().includes(q) || (i.member_name || "").toLowerCase().includes(q) || (i.mobile_phone || "").includes(q);
    const matchStatus = filterStatus === "all" || i.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const columns: Column<LoanApplication>[] = [
    { key: "application_no", label: "№ заявки", className: "font-medium" },
    { key: "full_name", label: "Заёмщик", render: (i) => i.full_name || i.member_name || "—" },
    { key: "mobile_phone", label: "Телефон", render: (i) => i.mobile_phone || "—" },
    { key: "amount", label: "Сумма", render: (i) => fmt(i.amount) },
    { key: "term_months", label: "Срок", render: (i) => i.term_months ? `${i.term_months} мес.` : "—" },
    { key: "loan_program", label: "Программа", render: (i) => <span className="text-xs">{i.loan_program || "—"}</span> },
    { key: "status", label: "Статус", render: (i) => <Badge variant={statusVariant(i.status)} className="text-xs">{statusLabels[i.status] || i.status}</Badge> },
    { key: "created_at", label: "Создана", render: (i) => i.created_at ? new Date(i.created_at).toLocaleDateString("ru-RU") : "—" },
    { key: "id", label: "", render: (i) => (
      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
        <button className="p-1 rounded hover:bg-muted" title="Согласие на обработку ПД" onClick={() => api.export.download("loan_application", i.id, "docx")}><Icon name="FileText" size={14} className="text-blue-500" /></button>
        {canEdit && (i.status === "new" || i.status === "in_review") && (
          <>
            <button className="p-1 rounded hover:bg-muted" title="Одобрить" onClick={() => setApproveItem(i)}><Icon name="Check" size={14} className="text-green-600" /></button>
            <button className="p-1 rounded hover:bg-muted" title="Отклонить" onClick={() => handleReject(i)}><Icon name="X" size={14} className="text-red-500" /></button>
          </>
        )}
      </div>
    )},
  ];

  const handleReject = async (i: LoanApplication) => {
    const reason = prompt("Причина отклонения:");
    if (reason === null) return;
    try {
      await api.loanApplications.reject(i.id, reason);
      toast({ title: "Заявка отклонена" });
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const openDetail = (i: LoanApplication) => {
    setEditItem(i);
    setShowForm(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Поиск по заявке, ФИО, телефону..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="new">Новые</SelectItem>
            <SelectItem value="in_review">На рассмотрении</SelectItem>
            <SelectItem value="approved">Одобренные</SelectItem>
            <SelectItem value="rejected">Отклонённые</SelectItem>
            <SelectItem value="archived">Архив</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load}>
          <Icon name="RefreshCw" size={14} className="mr-1" /> Обновить
        </Button>
      </div>

      <DataTable columns={columns} data={filtered} loading={loading} onRowClick={openDetail} />

      <LoanApplicationDialog
        open={showForm}
        onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}
        item={editItem}
        members={members}
        orgs={orgs}
        canEdit={canEdit}
        onSaved={() => { setShowForm(false); setEditItem(null); load(); }}
        onLoanCreated={() => { onLoanCreated(); load(); }}
      />

      <LoanApplicationApproveDialog
        open={!!approveItem}
        onOpenChange={(v) => { if (!v) setApproveItem(null); }}
        item={approveItem}
        onApproved={() => { setApproveItem(null); load(); onLoanCreated(); }}
      />
    </div>
  );
};

export default LoanApplicationsTab;