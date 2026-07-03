import { useState, useEffect } from "react";
import PageHeader from "@/components/ui/page-header";
import DataTable, { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Icon from "@/components/ui/icon";
import MemberSearch from "@/components/ui/member-search";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import api, { toNum, ShareAccount, ShareAccountDetail, ShareTransaction, Member, Organization, humanizeError } from "@/lib/api";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " \u20BD";
const fmtDate = (d: string) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };
const ttLabels: Record<string, string> = { in: "Внесение", out: "Выплата" };

const columns: Column<ShareAccount>[] = [
  { key: "account_no", label: "Номер счёта", className: "font-medium" },
  { key: "member_name", label: "Пайщик" },
  { key: "org_name", label: "Организация", render: (i: ShareAccount) => <span className="text-xs text-muted-foreground">{i.org_short_name || i.org_name || "—"}</span> },
  { key: "balance", label: "Баланс", className: "font-semibold", render: (i: ShareAccount) => fmt(i.balance) },
  { key: "total_in", label: "Всего внесено", render: (i: ShareAccount) => fmt(i.total_in) },
  { key: "total_out", label: "Всего выплачено", render: (i: ShareAccount) => fmt(i.total_out) },
  { key: "status", label: "Статус", render: (i: ShareAccount) => <Badge variant="default" className="text-xs">{i.status === "active" ? "Активен" : i.status}</Badge> },
  { key: "id", label: "", render: (i: ShareAccount) => (
    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
      <button className="p-1 rounded hover:bg-muted" title="Excel" onClick={() => api.export.download("share", i.id, "xlsx")}><Icon name="FileSpreadsheet" size={14} className="text-green-600" /></button>
      <button className="p-1 rounded hover:bg-muted" title="PDF" onClick={() => api.export.download("share", i.id, "pdf")}><Icon name="FileText" size={14} className="text-red-500" /></button>
    </div>
  )},
];

const Shares = () => {
  const [accounts, setAccounts] = useState<ShareAccount[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showOp, setShowOp] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const [showDetail, setShowDetail] = useState(false);
  const [detail, setDetail] = useState<ShareAccountDetail | null>(null);
  const [showEditTx, setShowEditTx] = useState(false);
  const [editTxForm, setEditTxForm] = useState({ transaction_id: 0, amount: "", transaction_date: "", description: "" });

  const [createForm, setCreateForm] = useState({ member_id: "", amount: "", org_id: "" });
  const [opForm, setOpForm] = useState({ account_id: "", type: "in", amount: "", date: new Date().toISOString().slice(0, 10), description: "" });

  const load = () => {
    setLoading(true);
    Promise.all([api.shares.list(), api.members.list()]).then(([s, m]) => { setAccounts(s); setMembers(m); }).finally(() => setLoading(false));
    api.organizations.list().then(setOrgs).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const filtered = accounts.filter(a => a.account_no?.toLowerCase().includes(search.toLowerCase()) || a.member_name?.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.shares.create({ member_id: Number(createForm.member_id), amount: toNum(createForm.amount), org_id: createForm.org_id ? Number(createForm.org_id) : undefined });
      toast({ title: "Паевой счёт открыт" });
      setShowForm(false);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleOp = async () => {
    setSaving(true);
    try {
      await api.shares.transaction({
        account_id: Number(opForm.account_id), amount: toNum(opForm.amount),
        transaction_type: opForm.type, transaction_date: opForm.date, description: opForm.description,
      });
      toast({ title: opForm.type === "in" ? "Взнос внесён" : "Выплата проведена" });
      setShowOp(false);
      if (detail && Number(opForm.account_id) === detail.id) {
        const d = await api.shares.get(detail.id);
        setDetail(d);
      }
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (acc: ShareAccount) => {
    const d = await api.shares.get(acc.id);
    setDetail(d);
    setShowDetail(true);
  };

  const refreshDetail = async () => {
    if (!detail) return;
    const d = await api.shares.get(detail.id);
    setDetail(d);
    load();
  };

  const openEditTx = (tx: ShareTransaction) => {
    setEditTxForm({
      transaction_id: tx.id,
      amount: String(tx.amount),
      transaction_date: tx.transaction_date,
      description: tx.description || "",
    });
    setShowEditTx(true);
  };

  const handleUpdateTx = async () => {
    setSaving(true);
    try {
      await api.shares.updateTransaction({
        transaction_id: editTxForm.transaction_id,
        amount: toNum(editTxForm.amount),
        transaction_date: editTxForm.transaction_date,
        description: editTxForm.description,
      });
      toast({ title: "Операция обновлена" });
      setShowEditTx(false);
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTx = async (tx: ShareTransaction) => {
    if (!confirm(`Удалить операцию "${ttLabels[tx.transaction_type] || tx.transaction_type}" на сумму ${fmt(tx.amount)}?`)) return;
    try {
      await api.shares.deleteTransaction(tx.id);
      toast({ title: "Операция удалена" });
      await refreshDetail();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    }
  };

  const handleDeleteAccount = async () => {
    if (!detail || !confirm(`УДАЛИТЬ паевой счёт ${detail.account_no} со всеми операциями? Это действие необратимо!`)) return;
    setSaving(true);
    try {
      await api.shares.deleteAccount(detail.id);
      toast({ title: "Счёт удалён" });
      setShowDetail(false);
      setDetail(null);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllTransactions = async () => {
    if (!detail || !confirm(`Удалить ВСЕ операции по счёту ${detail.account_no} и обнулить баланс? Это действие необратимо!`)) return;
    setSaving(true);
    try {
      await api.shares.deleteAllTransactions(detail.id);
      toast({ title: "Все операции удалены, баланс обнулён" });
      const d = await api.shares.get(detail.id);
      setDetail(d);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Icon name="Loader2" size={32} className="animate-spin text-primary" /></div>;

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader title="Паевые счета" description={`${accounts.length} счетов`} actionLabel="Открыть счёт" actionIcon="Plus" onAction={() => { setCreateForm({ member_id: "", amount: "", org_id: "" }); setShowForm(true); }} />

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4"><div className="text-xs text-muted-foreground mb-1">Паевой фонд</div><div className="text-xl font-bold">{fmt(totalBalance)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground mb-1">Всего счетов</div><div className="text-xl font-bold">{accounts.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground mb-1">Средний взнос</div><div className="text-xl font-bold">{accounts.length ? fmt(totalBalance / accounts.length) : "0 \u20BD"}</div></Card>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Поиск по номеру, пайщику..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" className="gap-2" onClick={() => { setOpForm({ account_id: "", type: "in", amount: "", date: new Date().toISOString().slice(0, 10), description: "" }); setShowOp(true); }}>
          <Icon name="ArrowUpDown" size={16} />Операция
        </Button>
      </div>

      <DataTable columns={columns} data={filtered} onRowClick={openDetail} emptyMessage="Счета не найдены. Откройте первый паевой счёт." />

      {/* Create dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Открыть паевой счёт</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Организация *</Label>
              <Select value={String(createForm.org_id || "")} onValueChange={v => setCreateForm(p => ({ ...p, org_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
                <SelectContent>
                  {orgs.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.short_name || o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Пайщик *</Label>
              <MemberSearch members={members} value={createForm.member_id} onChange={(id) => setCreateForm(p => ({ ...p, member_id: id }))} />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Сумма паевого взноса, \u20BD</Label><Input type="number" value={createForm.amount} onChange={e => setCreateForm(p => ({ ...p, amount: e.target.value }))} /></div>
            <p className="text-xs text-muted-foreground">Номер счёта будет сформирован автоматически</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Отмена</Button>
              <Button onClick={handleCreate} disabled={saving || !createForm.member_id} className="gap-2">
                {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Save" size={16} />}
                Открыть счёт
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Operation dialog */}
      <Dialog open={showOp} onOpenChange={setShowOp}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Операция по паевому счёту</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Паевой счёт *</Label>
              <Select value={opForm.account_id} onValueChange={v => setOpForm(p => ({ ...p, account_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Выберите счёт" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.account_no} — {a.member_name} ({fmt(a.balance)})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Тип операции</Label>
              <Select value={opForm.type} onValueChange={v => setOpForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Внесение взноса</SelectItem>
                  <SelectItem value="out">Выплата взноса</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Сумма, \u20BD *</Label><Input type="number" value={opForm.amount} onChange={e => setOpForm(p => ({ ...p, amount: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Дата операции</Label><Input type="date" value={opForm.date} onChange={e => setOpForm(p => ({ ...p, date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Описание</Label><Input value={opForm.description} onChange={e => setOpForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowOp(false)}>Отмена</Button>
              <Button onClick={handleOp} disabled={saving || !opForm.account_id || !opForm.amount} className="gap-2">
                {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Check" size={16} />}
                Провести
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Паевой счёт {detail?.account_no}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div><div className="text-xs text-muted-foreground">Пайщик</div><div className="text-sm font-medium">{detail.member_name}</div></div>
                <div><div className="text-xs text-muted-foreground">Баланс</div><div className="text-sm font-bold text-primary">{fmt(detail.balance)}</div></div>
                <div><div className="text-xs text-muted-foreground">Внесено</div><div className="text-sm">{fmt(detail.total_in)}</div></div>
                <div><div className="text-xs text-muted-foreground">Выплачено</div><div className="text-sm">{fmt(detail.total_out)}</div></div>
              </div>

              <Tabs defaultValue="transactions">
                <TabsList>
                  <TabsTrigger value="transactions">Операции ({detail.transactions.length})</TabsTrigger>
                  <TabsTrigger value="actions">Действия</TabsTrigger>
                </TabsList>

                <TabsContent value="transactions" className="mt-4">
                  {detail.transactions.length === 0 ? (
                    <Card className="p-6 text-center text-muted-foreground text-sm">Операций пока нет</Card>
                  ) : (
                    <Card><CardContent className="pt-4">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left py-2 px-2">Дата</th><th className="text-right py-2 px-2">Сумма</th>
                          <th className="text-left py-2 px-2">Тип</th><th className="text-left py-2 px-2">Описание</th>
                          <th className="text-center py-2 px-2 w-20"></th>
                        </tr></thead>
                        <tbody>{detail.transactions.map(tx => (
                          <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 px-2">{fmtDate(tx.transaction_date)}</td>
                            <td className="py-2 px-2 text-right font-medium">{fmt(tx.amount)}</td>
                            <td className="py-2 px-2">
                              <Badge variant={tx.transaction_type === "in" ? "default" : "secondary"} className="text-xs">
                                {ttLabels[tx.transaction_type] || tx.transaction_type}
                              </Badge>
                            </td>
                            <td className="py-2 px-2 text-xs text-muted-foreground">{tx.description}</td>
                            <td className="py-2 px-2 text-center">
                              <div className="flex gap-1 justify-center">
                                <button className="p-1 rounded hover:bg-muted" title="Редактировать" onClick={() => openEditTx(tx)}><Icon name="Pencil" size={14} className="text-muted-foreground" /></button>
                                <button className="p-1 rounded hover:bg-destructive/10" title="Удалить" onClick={() => handleDeleteTx(tx)}><Icon name="Trash2" size={14} className="text-destructive/70" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </CardContent></Card>
                  )}
                </TabsContent>

                <TabsContent value="actions" className="mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-1" onClick={() => { setOpForm({ account_id: String(detail.id), type: "in", amount: "", date: new Date().toISOString().slice(0, 10), description: "" }); setShowOp(true); }}>
                      <div className="flex items-center gap-2"><Icon name="PlusCircle" size={16} /><span className="font-medium text-sm">Внести взнос</span></div>
                      <span className="text-xs text-muted-foreground">Пополнить паевой счёт</span>
                    </Button>
                    <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-1" onClick={() => { setOpForm({ account_id: String(detail.id), type: "out", amount: "", date: new Date().toISOString().slice(0, 10), description: "" }); setShowOp(true); }}>
                      <div className="flex items-center gap-2"><Icon name="MinusCircle" size={16} /><span className="font-medium text-sm">Выплатить взнос</span></div>
                      <span className="text-xs text-muted-foreground">Вывести средства с паевого счёта</span>
                    </Button>
                    <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-1" onClick={() => { api.export.download("share", detail.id, "xlsx"); toast({ title: "Формируется Excel-выписка..." }); }}>
                      <div className="flex items-center gap-2"><Icon name="FileSpreadsheet" size={16} /><span className="font-medium text-sm">Выписка Excel</span></div>
                    </Button>
                    <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-1" onClick={() => { api.export.download("share", detail.id, "pdf"); toast({ title: "Формируется PDF-выписка..." }); }}>
                      <div className="flex items-center gap-2"><Icon name="FileText" size={16} /><span className="font-medium text-sm">Выписка PDF</span></div>
                    </Button>
                    {isAdmin && detail.transactions.length > 0 && (
                      <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-1 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={handleDeleteAllTransactions} disabled={saving}>
                        <div className="flex items-center gap-2"><Icon name="Eraser" size={16} /><span className="font-medium text-sm">Удалить все операции</span></div>
                        <span className="text-xs text-muted-foreground">Обнулить баланс и удалить историю</span>
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="outline" className="h-auto p-4 flex flex-col items-start gap-1 border-destructive/50 text-destructive hover:bg-destructive/5" onClick={handleDeleteAccount} disabled={saving}>
                        <div className="flex items-center gap-2"><Icon name="Trash2" size={16} /><span className="font-medium text-sm">Удалить счёт</span></div>
                        <span className="text-xs text-muted-foreground">Полностью удалить счёт со всеми данными</span>
                      </Button>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit transaction dialog */}
      <Dialog open={showEditTx} onOpenChange={setShowEditTx}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Редактирование операции</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label className="text-xs">Дата операции</Label><Input type="date" value={editTxForm.transaction_date} onChange={e => setEditTxForm(p => ({ ...p, transaction_date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Сумма, \u20BD</Label><Input type="number" step="0.01" value={editTxForm.amount} onChange={e => setEditTxForm(p => ({ ...p, amount: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Описание</Label><Input value={editTxForm.description} onChange={e => setEditTxForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowEditTx(false)}>Отмена</Button>
              <Button onClick={handleUpdateTx} disabled={saving || !editTxForm.amount} className="gap-2">
                {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Save" size={16} />}
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Shares;