import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/ui/page-header";
import DataTable, { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import api, { toNum, Loan, LoanDetail, LoanPayment, Member, Organization, humanizeError } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import LoansCreateDialog from "./loans/LoansCreateDialog";
import LoansDetailDialog from "./loans/LoansDetailDialog";
import LoansActionDialogs from "./loans/LoansActionDialogs";
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
  { key: "collateral_count", label: "Залог", render: (i: Loan) => i.collateral_count
    ? <Badge variant="default" className="text-xs">Залог</Badge>
    : <Badge variant="secondary" className="text-xs">Без залога</Badge> },
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
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { isAdmin, isManager } = useAuth();

  const [form, setForm] = useState({ contract_no: "", member_id: "", amount: "", rate: "", term_months: "", schedule_type: "annuity", start_date: new Date().toISOString().slice(0, 10), org_id: "" });
  const [payForm, setPayForm] = useState({ amount: "", date: new Date().toISOString().slice(0, 10), manual: false, principal: "", interest: "", penalty: "" });
  const [earlyForm, setEarlyForm] = useState({ amount: "", repayment_type: "reduce_term", date: new Date().toISOString().slice(0, 10) });
  const [showEditPayment, setShowEditPayment] = useState(false);
  const [editPayForm, setEditPayForm] = useState({ payment_id: 0, payment_date: "", amount: "", principal_part: "", interest_part: "", penalty_part: "", manual_distribution: true });
  const [exporting, setExporting] = useState(false);
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
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (loan: Loan) => {
    const d = await api.loans.get(loan.id);
    setDetail(d);
    setShowDetail(true);
  };

  const handlePayment = async () => {
    if (!detail || !payForm.amount) return;
    setSaving(true);
    try {
      const res = await api.loans.payment({
        loan_id: detail.id, payment_date: payForm.date,
        amount: toNum(payForm.amount),
        ...(payForm.manual ? { forced_distribution: {
          principal: toNum(payForm.principal || "0"),
          interest: toNum(payForm.interest || "0"),
          penalty: toNum(payForm.penalty || "0"),
        }} : {}),
      });
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
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEarlyRepay = async () => {
    if (!detail || !earlyForm.amount) return;
    setSaving(true);
    try {
      const res = await api.loans.earlyRepayment({
        loan_id: detail.id, amount: toNum(earlyForm.amount),
        repayment_type: earlyForm.repayment_type, payment_date: earlyForm.date,
      });
      const parts = [`Проценты: ${fmt(res.interest_part || 0)}`, `Основной долг: ${fmt(res.principal_part || 0)}`];
      if (res.new_monthly) parts.push(`Новый платёж: ${fmt(res.new_monthly)}`);
      if (res.new_term) parts.push(`Новый срок: ${res.new_term} мес.`);
      toast({ title: "Досрочное погашение выполнено", description: parts.join(" · ") });
      setShowEarly(false);
      const d = await api.loans.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEditPayment = (payment: LoanPayment) => {
    setEditPayForm({
      payment_id: payment.id, payment_date: payment.payment_date, amount: String(payment.amount),
      principal_part: String(payment.principal_part), interest_part: String(payment.interest_part),
      penalty_part: String(payment.penalty_part), manual_distribution: true,
    });
    setShowEditPayment(true);
  };

  const handleEditPayment = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.loans.updatePayment({
        payment_id: editPayForm.payment_id, payment_date: editPayForm.payment_date,
        amount: toNum(editPayForm.amount), principal_part: toNum(editPayForm.principal_part),
        interest_part: toNum(editPayForm.interest_part), penalty_part: toNum(editPayForm.penalty_part),
        manual_distribution: true,
      });
      toast({ title: "Платёж изменён" });
      setShowEditPayment(false);
      const updated = await api.loans.get(detail.id);
      setDetail(updated);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
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
        onOpenChange={setShowDetail}
        detail={detail}
        isAdmin={isAdmin}
        isManager={isManager}
        orgs={orgs}
        onPayment={() => setShowPayment(true)}
        onEarlyRepay={() => setShowEarly(true)}
        onEditPayment={openEditPayment}
      />

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
        handleEarlyRepay={handleEarlyRepay}
        showEditPayment={showEditPayment}
        setShowEditPayment={setShowEditPayment}
        editPayForm={editPayForm}
        setEditPayForm={setEditPayForm}
        handleEditPayment={handleEditPayment}
      />
    </div>
  );
};

export default Loans;
