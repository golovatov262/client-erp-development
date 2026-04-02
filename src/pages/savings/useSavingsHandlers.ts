import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import api, { toNum, Saving, SavingDetail, SavingTransaction, Member, Organization } from "@/lib/api";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";

export default function useSavingsHandlers() {
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
  const [showClose, setShowClose] = useState(false);
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
  const [exporting, setExporting] = useState(false);
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

  const handleWithdrawal = async () => {
    if (!detail || !withdrawalForm.amount) return;
    setSaving(true);
    try {
      await api.savings.transaction({
        saving_id: detail.id, amount: toNum(withdrawalForm.amount),
        transaction_type: "withdrawal", transaction_date: withdrawalForm.date,
      });
      toast({ title: "Снятие проведено", description: fmt(toNum(withdrawalForm.amount)) });
      setShowWithdrawal(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEarlyClose = async () => {
    if (!detail || !confirm("Досрочно закрыть договор сбережений?")) return;
    setSaving(true);
    try {
      await api.savings.close({ saving_id: detail.id });
      toast({ title: "Договор досрочно закрыт" });
      setShowClose(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleCloseByTerm = async () => {
    if (!detail || !confirm("Закрыть договор по истечении срока?")) return;
    setSaving(true);
    try {
      await api.savings.closeByTerm({ saving_id: detail.id });
      toast({ title: "Договор закрыт по сроку" });
      setShowClose(false);
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
      await api.savings.modifyTerm({
        saving_id: detail.id,
        new_term: Number(modifyTermForm.new_term),
        effective_date: modifyTermForm.effective_date,
      });
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
      toast({ title: "Начисления пересчитаны", description: `Добавлено: ${res.days_added}, исправлено: ${res.days_fixed}` });
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

  const handleExportSavings = async () => {
    setExporting(true);
    try {
      await api.export.download("savings_list", undefined, "xlsx");
      toast({ title: "Список сбережений выгружен в Excel" });
    } catch {
      toast({ title: "Ошибка выгрузки", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return {
    items, members, orgs, loading, search, setSearch,
    filterStatus, setFilterStatus, filterOrg, setFilterOrg,
    showForm, setShowForm, saving, form, setForm,
    isAdmin, isManager, filtered,
    handleCreate, openDetail,
    showDetail, setShowDetail, detail, txFilterState, setTxFilterState,
    showDeposit, setShowDeposit, depositForm, setDepositForm, handleDeposit,
    showInterest, setShowInterest, interestForm, setInterestForm, handleInterestPayout,
    showWithdrawal, setShowWithdrawal, withdrawalForm, setWithdrawalForm, handleWithdrawal,
    showClose, setShowClose, handleEarlyClose, handleCloseByTerm,
    showModifyTerm, setShowModifyTerm, modifyTermForm, setModifyTermForm, handleModifyTerm,
    showBackfill, setShowBackfill, backfillForm, setBackfillForm, handleBackfill,
    showRateChange, setShowRateChange, rateChangeForm, setRateChangeForm, handleRateChange,
    showEditTx, setShowEditTx, editTxForm, setEditTxForm, handleEditTx, openEditTx,
    handleDeleteTx, handleDeleteAccrual, handleClearAccruals,
    handleDeleteContract, openEditSaving,
    showEdit, setShowEdit, editForm, setEditForm, handleEditSaving,
    exporting, handleExportSavings, handleRecalcAll,
  };
}