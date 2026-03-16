import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/ui/page-header";
import DataTable, { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import api, { toNum, Saving, SavingDetail, SavingTransaction, Member, Organization } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SavingsCreateDialog from "./savings/SavingsCreateDialog";
import SavingsDetailDialog from "./savings/SavingsDetailDialog";
import SavingsActionDialogs from "./savings/SavingsActionDialogs";
import SavingsEditDialog from "./savings/SavingsEditDialog";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
const fmtDate = (d: string) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };

const columns: Column<Saving>[] = [
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

const Savings = () => {
  const [items, setItems] = useState<Saving[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOrg, setFilterOrg] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { isAdmin, isManager } = useAuth();

  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState<SavingDetail | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), is_cash: false });
  const [showInterest, setShowInterest] = useState(false);
  const [interestForm, setInterestForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10) });
  const [showEarlyClose, setShowEarlyClose] = useState(false);
  const [showEditTx, setShowEditTx] = useState(false);
  const [editTxForm, setEditTxForm] = useState({ transaction_id: 0, amount: "", transaction_date: "", description: "" });

  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10) });
  const [showModifyTerm, setShowModifyTerm] = useState(false);
  const [modifyTermForm, setModifyTermForm] = useState({ new_term: "", effective_date: new Date().toISOString().slice(0, 10) });
  const [txFilterState, setTxFilterState] = useState<"all" | "transactions" | "accruals">("all");
  const [showBackfill, setShowBackfill] = useState(false);
  const [backfillForm, setBackfillForm] = useState({ date_from: "", date_to: new Date().toISOString().slice(0, 10), mode: "add_missing" });
  const [showRateChange, setShowRateChange] = useState(false);
  const [rateChangeForm, setRateChangeForm] = useState({ new_rate: "", effective_date: new Date().toISOString().slice(0, 10), reason: "" });

  const [form, setForm] = useState({ contract_no: "", member_id: "", amount: "", rate: "", term_months: "", payout_type: "monthly", start_date: new Date().toISOString().slice(0, 10), min_balance_pct: "", org_id: "" });
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({ contract_no: "", member_id: "", amount: "", rate: "", term_months: "", payout_type: "monthly", start_date: "", min_balance_pct: "", org_id: "" });
  const [searchParams, setSearchParams] = useSearchParams();

  const load = () => {
    setLoading(true);
    Promise.all([api.savings.list(), api.members.list()]).then(([s, m]) => { setItems(s); setMembers(m); }).finally(() => setLoading(false));
    api.organizations.list().then(setOrgs).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && !showDetail) {
      setSearchParams({}, { replace: true });
      api.savings.get(Number(openId)).then(d => { setDetail(d); setShowDetail(true); }).catch(() => {});
    }
  }, [searchParams]);

  const filtered = items.filter(s => {
    const matchSearch = s.contract_no?.toLowerCase().includes(search.toLowerCase()) || s.member_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || s.status === filterStatus;
    const matchOrg = filterOrg === "all" || String(s.org_id) === filterOrg || (filterOrg === "none" && !s.org_id);
    return matchSearch && matchStatus && matchOrg;
  });

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.savings.create({
        contract_no: form.contract_no, member_id: Number(form.member_id),
        amount: toNum(form.amount), rate: toNum(form.rate), term_months: toNum(form.term_months),
        payout_type: form.payout_type, start_date: form.start_date,
        min_balance_pct: form.min_balance_pct ? toNum(form.min_balance_pct) : 0,
        org_id: form.org_id ? Number(form.org_id) : undefined,
      });
      toast({ title: "Договор сбережений создан" });
      setShowForm(false);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (s: Saving) => {
    const d = await api.savings.get(s.id);
    setDetail(d);
    setShowDetail(true);
  };

  const refreshDetail = async () => {
    if (!detail) return;
    const d = await api.savings.get(detail.id);
    setDetail(d);
    load();
  };

  const handleDeposit = async () => {
    if (!detail || !depositForm.amount) return;
    setSaving(true);
    try {
      await api.savings.transaction({
        saving_id: detail.id, amount: toNum(depositForm.amount),
        transaction_type: "deposit", transaction_date: depositForm.date, is_cash: depositForm.is_cash,
      });
      toast({ title: "Пополнение проведено", description: fmt(toNum(depositForm.amount)) });
      setShowDeposit(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleInterestPayout = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const res = await api.savings.interestPayout({
        saving_id: detail.id,
        amount: interestForm.amount ? toNum(interestForm.amount) : undefined,
        transaction_date: interestForm.date,
      });
      toast({ title: "Проценты выплачены", description: fmt(res.amount) });
      setShowInterest(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEarlyClose = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.savings.earlyClose({ saving_id: detail.id });
      toast({ title: "Вклад досрочно закрыт" });
      setShowEarlyClose(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!detail || !withdrawalForm.amount) return;
    setSaving(true);
    try {
      await api.savings.transaction({
        saving_id: detail.id, amount: toNum(withdrawalForm.amount),
        transaction_type: "partial_withdrawal", transaction_date: withdrawalForm.date,
      });
      toast({ title: "Изъятие проведено", description: fmt(toNum(withdrawalForm.amount)) });
      setShowWithdrawal(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleModifyTerm = async () => {
    if (!detail || !modifyTermForm.new_term) return;
    setSaving(true);
    try {
      await api.savings.modifyTerm({ saving_id: detail.id, new_term: toNum(modifyTermForm.new_term), effective_date: modifyTermForm.effective_date });
      toast({ title: "Срок изменён" });
      setShowModifyTerm(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleBackfill = async () => {
    if (!detail || !backfillForm.date_from || !backfillForm.date_to) return;
    setSaving(true);
    try {
      const res = await api.savings.backfillAccrue({
        saving_id: detail.id,
        date_from: backfillForm.date_from,
        date_to: backfillForm.date_to,
        mode: backfillForm.mode,
      });
      const parts: string[] = [];
      if (res.days_added > 0) parts.push(`Добавлено: ${res.days_added} дн. на ${fmt(res.total_added)}`);
      if (res.days_fixed > 0) parts.push(`Исправлено: ${res.days_fixed} дн., корректировка ${fmt(res.total_fixed_diff)}`);
      if (parts.length === 0) parts.push("Нет изменений — все начисления актуальны");
      toast({ title: "Готово", description: parts.join(" / ") });
      setShowBackfill(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccrual = async (accrualId: number) => {
    if (!detail) return;
    try {
      await api.savings.deleteAccrual(accrualId);
      toast({ title: "Начисление удалено" });
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleClearAccruals = async () => {
    if (!detail || !confirm("Удалить все начисления по этому договору? Сумма начисленных процентов обнулится.")) return;
    setSaving(true);
    try {
      const res = await api.savings.clearDailyAccruals(detail.id);
      toast({ title: "Начисления очищены", description: `Удалено: ${fmt(res.cleared_amount)}` });
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRateChange = async () => {
    if (!detail || !rateChangeForm.new_rate) return;
    setSaving(true);
    try {
      await api.savings.changeRate({
        saving_id: detail.id, new_rate: toNum(rateChangeForm.new_rate),
        effective_date: rateChangeForm.effective_date, reason: rateChangeForm.reason,
      });
      toast({ title: "Ставка изменена" });
      setShowRateChange(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTx = async (txId: number) => {
    if (!detail || !confirm("Удалить транзакцию?")) return;
    try {
      await api.savings.deleteTransaction(txId);
      toast({ title: "Транзакция удалена" });
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleEditTx = async () => {
    if (!detail || !editTxForm.amount) return;
    setSaving(true);
    try {
      await api.savings.updateTransaction({
        transaction_id: editTxForm.transaction_id,
        amount: toNum(editTxForm.amount), transaction_date: editTxForm.transaction_date,
        description: editTxForm.description,
      });
      toast({ title: "Транзакция изменена" });
      setShowEditTx(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEditTx = (tx: SavingTransaction) => {
    setEditTxForm({ transaction_id: tx.id, amount: String(tx.amount), transaction_date: tx.transaction_date, description: tx.description || "" });
    setShowEditTx(true);
  };

  const handleRecalcAll = async () => {
    if (!confirm("Пересчитать графики для всех активных договоров сбережений?")) return;
    setSaving(true);
    try {
      const res = await api.savings.recalcAllActive();
      toast({ title: "Пересчёт выполнен", description: `Обработано: ${res.recalculated} из ${res.total}` });
      if (res.errors && res.errors.length > 0) {
        console.error("Ошибки при пересчёте:", res.errors);
      }
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEditSaving = () => {
    if (!detail) return;
    setEditForm({
      contract_no: detail.contract_no,
      member_id: String(detail.member_id),
      amount: String(detail.amount),
      rate: String(detail.rate),
      term_months: String(detail.term_months),
      payout_type: detail.payout_type,
      start_date: detail.start_date,
      min_balance_pct: String(detail.min_balance_pct || 0),
      org_id: detail.org_id ? String(detail.org_id) : "",
    });
    setShowEdit(true);
  };

  const handleEditSaving = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.savings.update({
        saving_id: detail.id,
        contract_no: editForm.contract_no,
        member_id: Number(editForm.member_id),
        amount: toNum(editForm.amount),
        rate: toNum(editForm.rate),
        term_months: toNum(editForm.term_months),
        payout_type: editForm.payout_type,
        start_date: editForm.start_date,
        min_balance_pct: editForm.min_balance_pct ? toNum(editForm.min_balance_pct) : 0,
        org_id: editForm.org_id ? Number(editForm.org_id) : null,
      });
      toast({ title: "Договор обновлён", description: "График пересчитан" });
      setShowEdit(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContract = async () => {
    if (!detail || !confirm(`Удалить договор сбережений ${detail.contract_no}? Все связанные данные будут удалены.`)) return;
    try {
      await api.savings.deleteContract(detail.id);
      toast({ title: "Договор удалён" });
      setShowDetail(false);
      setDetail(null);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Сбережения"
        action={isAdmin || isManager ? { label: "Новый договор", onClick: () => setShowForm(true) } : undefined}
      >
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Поиск по договору, пайщику..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Статус" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="active">Активен</SelectItem>
              <SelectItem value="early_closed">Досрочно закрыт</SelectItem>
              <SelectItem value="closed">Закрыт</SelectItem>
            </SelectContent>
          </Select>
          {orgs.length > 0 && (
            <Select value={filterOrg} onValueChange={setFilterOrg}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Организация" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все организации</SelectItem>
                {orgs.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.short_name || o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {(filterStatus !== "all" || filterOrg !== "all") && (
            <button onClick={() => { setFilterStatus("all"); setFilterOrg("all"); }} className="px-3 py-1 text-sm border rounded hover:bg-muted text-muted-foreground">
              Сбросить
            </button>
          )}
          {isAdmin && (
            <button onClick={handleRecalcAll} disabled={saving} className="px-3 py-1 text-sm border rounded hover:bg-muted" title="Пересчитать все графики">
              <Icon name="RefreshCw" size={16} />
            </button>
          )}
        </div>
      </PageHeader>

      <DataTable columns={columns} data={filtered} loading={loading} onRowClick={openDetail} />

      <SavingsCreateDialog
        open={showForm}
        onOpenChange={setShowForm}
        form={form}
        setForm={setForm}
        members={members}
        orgs={orgs}
        saving={saving}
        onCreate={handleCreate}
      />

      <SavingsDetailDialog
        open={showDetail}
        onOpenChange={setShowDetail}
        detail={detail}
        isAdmin={isAdmin}
        isManager={isManager}
        txFilterState={txFilterState}
        setTxFilterState={setTxFilterState}
        onDeposit={() => setShowDeposit(true)}
        onInterest={() => setShowInterest(true)}
        onWithdrawal={() => setShowWithdrawal(true)}
        onEarlyClose={() => setShowEarlyClose(true)}
        onModifyTerm={() => setShowModifyTerm(true)}
        onBackfill={() => setShowBackfill(true)}
        onRateChange={() => setShowRateChange(true)}
        onDeleteTx={handleDeleteTx}
        onEditTx={openEditTx}
        onDeleteContract={handleDeleteContract}
        onDeleteAccrual={handleDeleteAccrual}
        onClearAccruals={handleClearAccruals}
        onEdit={openEditSaving}
      />

      <SavingsEditDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        form={editForm}
        setForm={setEditForm}
        members={members}
        orgs={orgs}
        saving={saving}
        onSave={handleEditSaving}
      />

      <SavingsActionDialogs
        detail={detail}
        saving={saving}
        showDeposit={showDeposit}
        setShowDeposit={setShowDeposit}
        depositForm={depositForm}
        setDepositForm={setDepositForm}
        handleDeposit={handleDeposit}
        showInterest={showInterest}
        setShowInterest={setShowInterest}
        interestForm={interestForm}
        setInterestForm={setInterestForm}
        handleInterestPayout={handleInterestPayout}
        showWithdrawal={showWithdrawal}
        setShowWithdrawal={setShowWithdrawal}
        withdrawalForm={withdrawalForm}
        setWithdrawalForm={setWithdrawalForm}
        handleWithdrawal={handleWithdrawal}
        showEarlyClose={showEarlyClose}
        setShowEarlyClose={setShowEarlyClose}
        handleEarlyClose={handleEarlyClose}
        showModifyTerm={showModifyTerm}
        setShowModifyTerm={setShowModifyTerm}
        modifyTermForm={modifyTermForm}
        setModifyTermForm={setModifyTermForm}
        handleModifyTerm={handleModifyTerm}
        showBackfill={showBackfill}
        setShowBackfill={setShowBackfill}
        backfillForm={backfillForm}
        setBackfillForm={setBackfillForm}
        handleBackfill={handleBackfill}
        showRateChange={showRateChange}
        setShowRateChange={setShowRateChange}
        rateChangeForm={rateChangeForm}
        setRateChangeForm={setRateChangeForm}
        handleRateChange={handleRateChange}
        showEditTx={showEditTx}
        setShowEditTx={setShowEditTx}
        editTxForm={editTxForm}
        setEditTxForm={setEditTxForm}
        handleEditTx={handleEditTx}
      />
    </div>
  );
};

export default Savings;