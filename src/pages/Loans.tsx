import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/ui/page-header";
import DataTable, { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import api, { toNum, Loan, LoanDetail, LoanPayment, Member, ScheduleItem, Organization } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoansCreateDialog from "./loans/LoansCreateDialog";
import LoansDetailDialog from "./loans/LoansDetailDialog";
import LoansActionDialogs from "./loans/LoansActionDialogs";
import LoanReconciliationReport from "./loans/LoanReconciliationReport";
import LoanEditDialog from "./loans/LoanEditDialog";
import LoanApplicationsTab from "./loans/LoanApplicationsTab";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";

const statusLabel: Record<string, string> = { active: "Активен", overdue: "Просрочен", closed: "Закрыт", holiday: "Кредитные каникулы", pending: "Ожидается", paid: "Оплачен", partial: "Частично оплачен" };
const statusVariant = (s: string) => {
  if (s === "active" || s === "paid") return "default";
  if (s === "overdue") return "destructive";
  if (s === "partial") return "warning";
  return "secondary";
};

const columns: Column<Loan>[] = [
  { key: "contract_no", label: "Договор", className: "font-medium" },
  { key: "member_name", label: "Пайщик" },
  { key: "org_name", label: "Организация", render: (i: Loan) => <span className="text-xs text-muted-foreground">{i.org_short_name || i.org_name || "—"}</span> },
  { key: "amount", label: "Сумма", render: (i: Loan) => fmt(i.amount) },
  { key: "rate", label: "Ставка", render: (i: Loan) => i.rate + "%" },
  { key: "term_months", label: "Срок", render: (i: Loan) => i.term_months + " мес." },
  { key: "monthly_payment", label: "Платёж", render: (i: Loan) => fmt(i.monthly_payment) },
  { key: "balance", label: "Остаток", render: (i: Loan) => fmt(i.balance) },
  { key: "schedule_type", label: "График", render: (i: Loan) => <span className="text-xs">{i.schedule_type === "annuity" ? "Аннуитет" : "В конце срока"}</span> },
  { key: "status", label: "Статус", render: (i: Loan) => <Badge variant={statusVariant(i.status) as "default"|"destructive"|"secondary"|"warning"} className="text-xs">{statusLabel[i.status] || i.status}</Badge> },
  { key: "id", label: "", render: (i: Loan) => (
    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
      <button className="p-1 rounded hover:bg-muted" title="Excel" onClick={() => api.export.download("loan", i.id, "xlsx")}><Icon name="FileSpreadsheet" size={14} className="text-green-600" /></button>
      <button className="p-1 rounded hover:bg-muted" title="PDF" onClick={() => api.export.download("loan", i.id, "pdf")}><Icon name="FileText" size={14} className="text-red-500" /></button>
    </div>
  )},
];

const Loans = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterOrg, setFilterOrg] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState<LoanDetail | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showEarly, setShowEarly] = useState(false);
  const [showModify, setShowModify] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { isAdmin, isManager } = useAuth();

  const [form, setForm] = useState({ contract_no: "", member_id: "", amount: "", rate: "", term_months: "", schedule_type: "annuity", start_date: new Date().toISOString().slice(0, 10), org_id: "" });
  const [payForm, setPayForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10) });
  const [earlyForm, setEarlyForm] = useState({ amount: "", repayment_type: "reduce_term", date: new Date().toISOString().slice(0, 10) });
  const [earlyPreview, setEarlyPreview] = useState<ScheduleItem[] | null>(null);
  const [earlyMonthly, setEarlyMonthly] = useState(0);
  const [modifyForm, setModifyForm] = useState({ new_rate: "", new_term: "", new_amount: "", effective_date: new Date().toISOString().slice(0, 10) });
  const [modifyPreview, setModifyPreview] = useState<ScheduleItem[] | null>(null);
  const [modifyMonthly, setModifyMonthly] = useState(0);
  const [showEditPayment, setShowEditPayment] = useState(false);
  const [editPayForm, setEditPayForm] = useState({ payment_id: 0, payment_date: "", amount: "", principal_part: "", interest_part: "", penalty_part: "", manual_distribution: false });
  const [showOverpayChoice, setShowOverpayChoice] = useState(false);
  const [overpayOptions, setOverpayOptions] = useState<Record<string, { new_monthly: number; new_term: number; description: string }>>({});
  const [overpayInfo, setOverpayInfo] = useState({ overpay_amount: 0, current_payment: 0, total_amount: 0 });
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [showEditLoan, setShowEditLoan] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showHoliday, setShowHoliday] = useState(false);
  const [holidayForm, setHolidayForm] = useState({ holiday_start: new Date().toISOString().slice(0, 10), holiday_months: "3" });
  const [searchParams, setSearchParams] = useSearchParams();

  const load = () => {
    setLoading(true);
    Promise.all([api.loans.list(), api.members.list()]).then(([l, m]) => { setLoans(l); setMembers(m); }).finally(() => setLoading(false));
    api.organizations.list().then(setOrgs).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && !showDetail) {
      setSearchParams({}, { replace: true });
      api.loans.get(Number(openId)).then(d => { setDetail(d); setShowDetail(true); }).catch(() => {});
    }
  }, [searchParams]);

  const filtered = loans.filter(l => {
    const matchSearch = l.contract_no?.toLowerCase().includes(search.toLowerCase()) || l.member_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || l.status === filterStatus;
    const matchOrg = filterOrg === "all" || String(l.org_id) === filterOrg || (filterOrg === "none" && !l.org_id);
    return matchSearch && matchStatus && matchOrg;
  });

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.loans.create({
        contract_no: form.contract_no, member_id: Number(form.member_id),
        amount: toNum(form.amount), rate: toNum(form.rate), term_months: toNum(form.term_months),
        schedule_type: form.schedule_type, start_date: form.start_date,
        org_id: form.org_id ? Number(form.org_id) : undefined,
      });
      toast({ title: "Договор займа создан" });
      setShowForm(false);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (loan: Loan) => {
    const d = await api.loans.get(loan.id);
    setDetail(d);
    setShowDetail(true);
  };

  const handlePayment = async (strategy?: string) => {
    if (!detail || !payForm.amount) return;
    setSaving(true);
    try {
      const res = await api.loans.payment({
        loan_id: detail.id, payment_date: payForm.date,
        amount: toNum(payForm.amount), overpay_strategy: strategy,
      });
      if (res.needs_choice && res.options) {
        setOverpayOptions(res.options);
        setOverpayInfo({
          overpay_amount: res.overpay_amount || 0,
          current_payment: res.current_payment || 0,
          total_amount: res.total_amount || 0,
        });
        setShowPayment(false);
        setShowOverpayChoice(true);
        return;
      }
      const parts = [`Осн. долг: ${fmt(res.principal_part || 0)}`, `Проценты: ${fmt(res.interest_part || 0)}`];
      if ((res.penalty_part || 0) > 0) parts.push(`Штрафы: ${fmt(res.penalty_part || 0)}`);
      let title = "Платёж внесён";
      if (res.new_balance === 0) {
        title = "Займ полностью погашен";
      } else if (res.schedule_recalculated) {
        title = "Платёж внесён, график пересчитан";
        parts.push(`Новый платёж: ${fmt(res.new_monthly || 0)}`);
      }
      toast({ title, description: parts.join(" · ") });
      setShowPayment(false);
      setShowOverpayChoice(false);
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEarlyPreview = async () => {
    if (!detail || !earlyForm.amount) return;
    const newBalance = detail.balance - toNum(earlyForm.amount);
    if (newBalance <= 0) {
      setEarlyPreview(null);
      setEarlyMonthly(0);
      return;
    }
    const remainingPeriods = detail.schedule.filter(s => s.status === "pending").length;
    if (remainingPeriods === 0) return;
    const res = await api.loans.calcSchedule(
      newBalance,
      detail.rate,
      earlyForm.repayment_type === "reduce_term" ? Math.max(1, remainingPeriods - 1) : remainingPeriods,
      detail.schedule_type,
      new Date().toISOString().slice(0, 10)
    );
    setEarlyPreview(res.schedule);
    setEarlyMonthly(res.monthly_payment);
  };

  const handleEarlyRepay = async () => {
    if (!detail || !earlyForm.amount) return;
    setSaving(true);
    try {
      await api.loans.earlyRepayment({
        loan_id: detail.id, amount: toNum(earlyForm.amount),
        repayment_type: earlyForm.repayment_type, payment_date: earlyForm.date,
      });
      toast({ title: "Досрочное погашение выполнено" });
      setShowEarly(false);
      setEarlyPreview(null);
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleModifyPreview = async () => {
    if (!detail || (!modifyForm.new_rate && !modifyForm.new_term && !modifyForm.new_amount)) return;
    const newRate = modifyForm.new_rate ? toNum(modifyForm.new_rate) : detail.rate;
    const remainingPeriods = detail.schedule.filter(s => s.status === "pending").length;
    const newTerm = modifyForm.new_term ? toNum(modifyForm.new_term) : remainingPeriods;
    const extra = modifyForm.new_amount ? toNum(modifyForm.new_amount) - detail.amount : 0;
    const newBalance = detail.balance + (extra > 0 ? extra : 0);
    const effectiveDate = modifyForm.effective_date || new Date().toISOString().slice(0, 10);
    const res = await api.loans.calcSchedule(newBalance, newRate, newTerm, detail.schedule_type, effectiveDate);
    setModifyPreview(res.schedule);
    setModifyMonthly(res.monthly_payment);
  };

  const handleModify = async () => {
    if (!detail || (!modifyForm.new_rate && !modifyForm.new_term && !modifyForm.new_amount)) return;
    if (!modifyForm.effective_date) {
      toast({ title: "Укажите дату изменений", variant: "destructive" });
      return;
    }
    if (modifyForm.new_amount && toNum(modifyForm.new_amount) <= detail.amount) {
      toast({ title: "Новая сумма должна быть больше текущей (" + fmt(detail.amount) + ")", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.loans.modify({
        loan_id: detail.id,
        new_rate: modifyForm.new_rate ? toNum(modifyForm.new_rate) : undefined,
        new_term: modifyForm.new_term ? toNum(modifyForm.new_term) : undefined,
        new_amount: modifyForm.new_amount ? toNum(modifyForm.new_amount) : undefined,
        effective_date: modifyForm.effective_date,
      });
      toast({ title: "Условия изменены, график пересчитан" });
      setShowModify(false);
      setModifyPreview(null);
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEditPayment = async () => {
    if (!detail || !editPayForm.amount) return;
    setSaving(true);
    try {
      await api.loans.updatePayment({
        payment_id: editPayForm.payment_id,
        payment_date: editPayForm.payment_date,
        amount: toNum(editPayForm.amount),
        principal_part: editPayForm.principal_part ? toNum(editPayForm.principal_part) : undefined,
        interest_part: editPayForm.interest_part ? toNum(editPayForm.interest_part) : undefined,
        penalty_part: editPayForm.penalty_part ? toNum(editPayForm.penalty_part) : undefined,
        manual_distribution: editPayForm.manual_distribution,
      });
      toast({ title: "Платёж изменён" });
      setShowEditPayment(false);
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!detail || !confirm("Удалить платёж?")) return;
    try {
      await api.loans.deletePayment(paymentId);
      toast({ title: "Платёж удалён" });
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const openEditPayment = (p: LoanPayment) => {
    setEditPayForm({
      payment_id: p.id,
      payment_date: p.payment_date,
      amount: String(p.amount),
      principal_part: String(p.principal_part),
      interest_part: String(p.interest_part),
      penalty_part: String(p.penalty_part),
      manual_distribution: !!p.manual_distribution,
    });
    setShowEditPayment(true);
  };

  const handleDeleteContract = async () => {
    if (!detail || !confirm(`Удалить договор займа ${detail.contract_no}? Все связанные данные будут удалены.`)) return;
    try {
      await api.loans.deleteContract(detail.id);
      toast({ title: "Договор удалён" });
      setShowDetail(false);
      setDetail(null);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleRebuildSchedule = async () => {
    if (!detail) return;
    const termInput = prompt(`Пересоздать график с даты начала (${detail.start_date}).\nУкажите срок в месяцах:`, String(detail.term_months));
    if (!termInput) return;
    const term = parseInt(termInput);
    if (!term || term < 1) { toast({ title: "Некорректный срок", variant: "destructive" }); return; }
    try {
      const res = await api.loans.rebuildSchedule(detail.id, term);
      toast({ title: "График пересоздан", description: `Периодов: ${res.periods}, платёж: ${fmt(res.monthly_payment)}` });
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleCheckStatus = async () => {
    if (!detail) return;
    try {
      const data = await api.loans.checkStatus(detail.contract_no);
      console.log('=== ДИАГНОСТИКА СТАТУСОВ ===');
      console.log('Договор:', data.loan_number);
      console.log('Всего платежей по графику:', data.schedule.length);
      console.log('Статистика:', data.stats);
      console.log('Сумма paid_amount из графика:', data.total_paid_from_schedule, '₽');
      console.log('Сумма фактических платежей:', data.total_paid_from_payments, '₽');
      console.log('Последний оплаченный период:', data.last_paid_period);
      console.log('\nГрафик платежей:', data.schedule);
      console.log('\nФактические платежи:', data.payments);
      toast({ title: "Диагностика завершена", description: "Результаты в консоли (F12)" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleFixSchedule = async () => {
    if (!detail || !confirm('Исправить дубли и пересчитать баланс по договору?')) return;
    try {
      const res = await api.loans.fixSchedule(detail.id);
      toast({ title: "График исправлен", description: `Удалено дублей: ${res.removed_duplicates}, баланс: ${fmt(res.new_balance)}` });
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleRecalcStatuses = async () => {
    if (!detail || !confirm('Пересчитать статусы платежей на основе фактических платежей?')) return;
    try {
      await api.loans.recalcStatuses(detail.id);
      toast({ title: "Статусы пересчитаны" });
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleHoliday = async () => {
    if (!detail) return;
    const months = parseInt(holidayForm.holiday_months);
    if (!months || months < 1 || months > 12) {
      toast({ title: "Укажите количество месяцев от 1 до 12", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await api.loans.setHoliday({ loan_id: detail.id, holiday_start: holidayForm.holiday_start, holiday_months: months });
      toast({ title: "Кредитные каникулы установлены", description: `До ${res.holiday_end}, срок продлён до ${res.new_end_date}` });
      setShowHoliday(false);
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelHoliday = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.loans.cancelHoliday(detail.id);
      toast({ title: "Кредитные каникулы отменены" });
      setShowHoliday(false);
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleExportLoans = async () => {
    setExporting(true);
    try {
      await api.export.download("loans_list", undefined, "xlsx");
      toast({ title: "Список займов выгружен в Excel" });
    } catch {
      toast({ title: "Ошибка выгрузки", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const [tab, setTab] = useState<"loans" | "applications">("loans");
  const [openAppCreate, setOpenAppCreate] = useState(0);

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Займы"
        action={isAdmin || isManager ? (tab === "loans"
          ? { label: "Новый договор", onClick: () => setShowForm(true) }
          : { label: "Новая заявка", onClick: () => setOpenAppCreate(v => v + 1) }) : undefined}
      />

      <Tabs value={tab} onValueChange={v => setTab(v as "loans" | "applications")}>
        <TabsList>
          <TabsTrigger value="loans">Займы</TabsTrigger>
          <TabsTrigger value="applications">Заявки</TabsTrigger>
        </TabsList>

        <TabsContent value="loans" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input placeholder="Поиск по договору, пайщику..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="active">Активен</SelectItem>
                <SelectItem value="overdue">Просрочен</SelectItem>
                <SelectItem value="closed">Закрыт</SelectItem>
                <SelectItem value="paid">Оплачен</SelectItem>
                <SelectItem value="partial">Частично оплачен</SelectItem>
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
            <Button variant="outline" size="sm" onClick={handleExportLoans} disabled={exporting} className="gap-1.5">
              <Icon name={exporting ? "Loader2" : "FileSpreadsheet"} size={14} className={exporting ? "animate-spin" : "text-green-600"} />
              {exporting ? "Выгрузка..." : "Excel"}
            </Button>
          </div>

          <DataTable columns={columns} data={filtered} loading={loading} onRowClick={openDetail} />
        </TabsContent>

        <TabsContent value="applications">
          <LoanApplicationsTab
            members={members}
            orgs={orgs}
            canEdit={isAdmin || isManager}
            openCreate={openAppCreate}
            onConsumeOpenCreate={() => setOpenAppCreate(0)}
            onLoanCreated={load}
          />
        </TabsContent>
      </Tabs>

      <LoansCreateDialog
        open={showForm}
        onOpenChange={setShowForm}
        form={form}
        setForm={setForm}
        members={members}
        orgs={orgs}
        saving={saving}
        onCreate={handleCreate}
      />

      <LoansDetailDialog
        open={showDetail}
        onCheckStatus={handleCheckStatus}
        onRecalcStatuses={handleRecalcStatuses}
        onOpenChange={setShowDetail}
        detail={detail}
        isAdmin={isAdmin}
        isManager={isManager}
        orgs={orgs}
        onPayment={() => setShowPayment(true)}
        onEarlyRepay={() => setShowEarly(true)}
        onModify={() => setShowModify(true)}
        onEditPayment={openEditPayment}
        onDeletePayment={handleDeletePayment}
        onDeleteContract={handleDeleteContract}
        onRebuildSchedule={handleRebuildSchedule}
        onReconciliation={() => setShowReconciliation(true)}
        onFixSchedule={handleFixSchedule}
        onEditLoan={() => setShowEditLoan(true)}
        onHoliday={() => {
          setHolidayForm({ holiday_start: new Date().toISOString().slice(0, 10), holiday_months: detail?.holiday_months ? String(detail.holiday_months) : "3" });
          setShowHoliday(true);
        }}
      />

      {detail && (
        <LoanReconciliationReport
          open={showReconciliation}
          onOpenChange={setShowReconciliation}
          loanId={detail.id}
          contractNo={detail.contract_no}
        />
      )}

      {detail && (
        <LoanEditDialog
          open={showEditLoan}
          onOpenChange={setShowEditLoan}
          detail={detail}
          members={members}
          orgs={orgs}
          saving={saving}
          setSaving={setSaving}
          toast={toast}
          onSaved={async () => {
            const d = await api.loans.get(detail.id);
            setDetail(d);
            load();
          }}
        />
      )}

      <LoansActionDialogs
        detail={detail}
        saving={saving}
        showPayment={showPayment}
        setShowPayment={setShowPayment}
        payForm={payForm}
        setPayForm={setPayForm}
        handlePayment={handlePayment}
        showEarly={showEarly}
        setShowEarly={setShowEarly}
        earlyForm={earlyForm}
        setEarlyForm={setEarlyForm}
        earlyPreview={earlyPreview}
        earlyMonthly={earlyMonthly}
        handleEarlyPreview={handleEarlyPreview}
        handleEarlyRepay={handleEarlyRepay}
        showModify={showModify}
        setShowModify={setShowModify}
        modifyForm={modifyForm}
        setModifyForm={setModifyForm}
        modifyPreview={modifyPreview}
        modifyMonthly={modifyMonthly}
        handleModifyPreview={handleModifyPreview}
        handleModify={handleModify}
        showEditPayment={showEditPayment}
        setShowEditPayment={setShowEditPayment}
        editPayForm={editPayForm}
        setEditPayForm={setEditPayForm}
        handleEditPayment={handleEditPayment}
        showOverpayChoice={showOverpayChoice}
        setShowOverpayChoice={setShowOverpayChoice}
        overpayOptions={overpayOptions}
        overpayInfo={overpayInfo}
      />

      <Dialog open={showHoliday} onOpenChange={setShowHoliday}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="Umbrella" size={18} />
              Кредитные каникулы
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              В период каникул проценты и платежи не начисляются. После окончания каникул срок займа продлевается на указанное количество месяцев с начислением процентов.
            </p>
            <div className="space-y-2">
              <Label>Дата начала каникул</Label>
              <Input type="date" value={holidayForm.holiday_start} onChange={e => setHolidayForm(f => ({ ...f, holiday_start: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Количество месяцев (1–12)</Label>
              <Select value={holidayForm.holiday_months} onValueChange={v => setHolidayForm(f => ({ ...f, holiday_months: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <SelectItem key={m} value={String(m)}>{m} {m === 1 ? "месяц" : m < 5 ? "месяца" : "месяцев"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {detail?.holiday_start && (
              <div className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded">
                Текущие каникулы: {detail.holiday_start} — {detail.holiday_end} ({detail.holiday_months} мес.)
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {detail?.holiday_start && (
              <Button variant="outline" onClick={handleCancelHoliday} disabled={saving} className="text-red-600 border-red-200 hover:bg-red-50">
                Отменить каникулы
              </Button>
            )}
            <Button onClick={handleHoliday} disabled={saving}>
              {saving ? "Сохранение..." : "Установить каникулы"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Loans;