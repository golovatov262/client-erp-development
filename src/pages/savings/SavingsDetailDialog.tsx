import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import DataTable, { Column } from "@/components/ui/data-table";
import { SavingDetail, SavingTransaction, DailyAccrual, SavingsScheduleItem } from "@/lib/api";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
const fmtDate = (d: string) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };
const ttLabels: Record<string, string> = { opening: "Открытие", deposit: "Пополнение", withdrawal: "Частичное изъятие", partial_withdrawal: "Частичное изъятие", interest_payout: "Выплата %", interest_accrual: "Начисление %", term_change: "Изменение срока", rate_change: "Изменение ставки", early_close: "Досрочное закрытие", closing: "Закрытие" };
const monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

interface MonthGroup {
  key: string;
  label: string;
  total: number;
  count: number;
  items: DailyAccrual[];
}

interface SavingsDetailDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detail: SavingDetail | null;
  isAdmin: boolean;
  isManager: boolean;
  txFilterState: "all" | "transactions" | "accruals";
  setTxFilterState: (v: "all" | "transactions" | "accruals") => void;
  onDeposit: () => void;
  onInterest: () => void;
  onWithdrawal: () => void;
  onClose: () => void;
  onModifyTerm: () => void;
  onBackfill: () => void;
  onRateChange: () => void;
  onDeleteTx: (id: number) => void;
  onEditTx: (tx: SavingTransaction) => void;
  onDeleteContract: () => void;
  onDeleteAccrual: (id: number) => void;
  onClearAccruals: () => void;
  onEdit: () => void;
}

const groupAccrualsByMonth = (accruals: DailyAccrual[]): MonthGroup[] => {
  const map = new Map<string, DailyAccrual[]>();
  for (const a of accruals) {
    const key = a.accrual_date.slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  const groups: MonthGroup[] = [];
  for (const [key, items] of map) {
    const [y, m] = key.split("-");
    groups.push({
      key,
      label: `${monthNames[parseInt(m, 10) - 1]} ${y}`,
      total: items.reduce((s, a) => s + a.daily_amount, 0),
      count: items.length,
      items: items.sort((a, b) => a.accrual_date.localeCompare(b.accrual_date)),
    });
  }
  return groups.sort((a, b) => b.key.localeCompare(a.key));
};

const SavingsDetailDialog = (props: SavingsDetailDialogProps) => {
  const { open, onOpenChange, detail, isAdmin, isManager, txFilterState, setTxFilterState } = props;
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  const monthGroups = useMemo(() => detail ? groupAccrualsByMonth(detail.daily_accruals || []) : [], [detail]);

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const expandAll = () => setExpandedMonths(new Set(monthGroups.map(g => g.key)));
  const collapseAll = () => setExpandedMonths(new Set());

  if (!detail) return null;

  const txCols: Column<SavingTransaction>[] = [
    { key: "transaction_date", label: "Дата", render: (t: SavingTransaction) => fmtDate(t.transaction_date) },
    { key: "transaction_type", label: "Тип", render: (t: SavingTransaction) => <span className="text-xs">{ttLabels[t.transaction_type] || t.transaction_type}</span> },
    { key: "amount", label: "Сумма", render: (t: SavingTransaction) => <span className={t.transaction_type === "withdrawal" || t.transaction_type === "partial_withdrawal" ? "text-red-600" : ""}>{fmt(t.amount)}</span> },
    { key: "description", label: "Примечание", render: (t: SavingTransaction) => <span className="text-xs text-muted-foreground">{t.description || "—"}</span> },
    { key: "id", label: "", render: (t: SavingTransaction) => (isAdmin || isManager) && t.transaction_type !== "opening" && t.transaction_type !== "closing" ? (
      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
        <button onClick={() => props.onEditTx(t)} className="p-1 rounded hover:bg-muted"><Icon name="Pencil" size={14} /></button>
        {isAdmin && <button onClick={() => props.onDeleteTx(t.id)} className="p-1 rounded hover:bg-muted text-red-600"><Icon name="Trash2" size={14} /></button>}
      </div>
    ) : null }
  ];

  const schCols: Column<SavingsScheduleItem>[] = [
    { key: "period_no", label: "№" },
    { key: "period_end", label: "Дата", render: (s: SavingsScheduleItem) => fmtDate(s.period_end) },
    { key: "interest_amount", label: "Проценты", render: (s: SavingsScheduleItem) => fmt(s.interest_amount) },
    { key: "cumulative_interest", label: "Накоплено", render: (s: SavingsScheduleItem) => fmt(s.cumulative_interest) },
    { key: "balance_after", label: "Остаток", render: (s: SavingsScheduleItem) => fmt(s.balance_after) },
    { key: "status", label: "Статус", render: (s: SavingsScheduleItem) => <Badge variant={s.status === "paid" ? "default" : s.status === "accrued" ? "secondary" : "outline"} className="text-xs">{s.status === "paid" ? "Оплачено" : s.status === "accrued" ? "Начислено" : "Ожидание"}</Badge> },
  ];

  const filteredTx = txFilterState === "transactions" ? detail.transactions.filter(t => t.transaction_type !== "interest_accrual") : detail.transactions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-start justify-between">
          <div>
            <DialogTitle>{detail.contract_no}</DialogTitle>
            <div className="text-sm text-muted-foreground mt-1">{detail.member_name}</div>
          </div>
          <Badge variant={detail.status === "active" ? "default" : "secondary"}>{detail.status === "active" ? "Активен" : detail.status === "early_closed" ? "Досрочно" : "Закрыт"}</Badge>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Сумма вклада</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(detail.amount)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Текущий остаток</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(detail.current_balance)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Начислено %</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{fmt(detail.accrued_interest)}</div></CardContent></Card>
        </div>

        <div className="grid md:grid-cols-4 gap-2 text-sm">
          <div><span className="text-muted-foreground">Ставка:</span> <span className="font-medium">{detail.rate}%</span></div>
          <div><span className="text-muted-foreground">Срок:</span> <span className="font-medium">{detail.term_months} мес.</span></div>
          <div><span className="text-muted-foreground">Начало:</span> <span className="font-medium">{fmtDate(detail.start_date)}</span></div>
          <div><span className="text-muted-foreground">Окончание:</span> <span className="font-medium">{fmtDate(detail.end_date)}</span></div>
        </div>

        {(isAdmin || isManager) && (
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={props.onEdit}><Icon name="Pencil" size={14} className="mr-1" />Редактировать</Button>
              {detail.status === "active" && (<>
                <Button size="sm" onClick={props.onDeposit}><Icon name="Plus" size={14} className="mr-1" />Пополнение</Button>
                <Button size="sm" onClick={props.onInterest} disabled={detail.accrued_interest <= 0}><Icon name="DollarSign" size={14} className="mr-1" />Выплатить %</Button>
                <Button size="sm" onClick={props.onWithdrawal}><Icon name="Minus" size={14} className="mr-1" />Изъятие</Button>
                <Button size="sm" onClick={props.onModifyTerm}><Icon name="Calendar" size={14} className="mr-1" />Изменить срок</Button>
                <Button size="sm" onClick={props.onRateChange}><Icon name="Percent" size={14} className="mr-1" />Изменить ставку</Button>
                <Button size="sm" onClick={props.onBackfill}><Icon name="RefreshCw" size={14} className="mr-1" />Доначислить %</Button>
                <Button size="sm" variant="destructive" onClick={props.onClose}><Icon name="XCircle" size={14} className="mr-1" />Закрытие договора</Button>
              </>)}
            </div>
            {isAdmin && <Button size="sm" variant="destructive" onClick={props.onDeleteContract}><Icon name="Trash2" size={14} className="mr-1" />Удалить договор</Button>}
          </div>
        )}

        <Tabs defaultValue="transactions">
          <TabsList>
            <TabsTrigger value="transactions">Операции</TabsTrigger>
            <TabsTrigger value="schedule">График</TabsTrigger>
          </TabsList>

          <TabsContent value="transactions">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button size="sm" variant={txFilterState === "all" ? "default" : "outline"} onClick={() => setTxFilterState("all")}>Все</Button>
                <Button size="sm" variant={txFilterState === "transactions" ? "default" : "outline"} onClick={() => setTxFilterState("transactions")}>Транзакции</Button>
                <Button size="sm" variant={txFilterState === "accruals" ? "default" : "outline"} onClick={() => setTxFilterState("accruals")}>Начисления ({detail.daily_accruals?.length ?? 0})</Button>
              </div>
              {isAdmin && txFilterState === "accruals" && (detail.daily_accruals?.length ?? 0) > 0 && (
                <Button size="sm" variant="destructive" onClick={props.onClearAccruals}>
                  <Icon name="Trash2" size={14} className="mr-1" />Очистить все начисления
                </Button>
              )}
            </div>
            {txFilterState === "accruals" ? (
              <Card className="overflow-hidden">
                {monthGroups.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">Нет данных</div>
                ) : (
                  <div>
                    <div className="flex gap-2 p-2 border-b bg-muted/20">
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={expandAll}>
                        <Icon name="ChevronsDown" size={12} className="mr-1" />Развернуть все
                      </Button>
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={collapseAll}>
                        <Icon name="ChevronsUp" size={12} className="mr-1" />Свернуть все
                      </Button>
                    </div>
                    {monthGroups.map(group => {
                      const isOpen = expandedMonths.has(group.key);
                      return (
                        <div key={group.key}>
                          <button
                            onClick={() => toggleMonth(group.key)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors border-b text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={16} className="text-muted-foreground" />
                              <span className="font-medium">{group.label}</span>
                              <span className="text-xs text-muted-foreground">({group.count} дн.)</span>
                            </div>
                            <span className="font-semibold text-green-600">{fmt(group.total)}</span>
                          </button>
                          {isOpen && (
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Дата</TableHead>
                                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Баланс</TableHead>
                                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Ставка</TableHead>
                                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Сумма</TableHead>
                                  {isAdmin && <TableHead className="text-xs font-semibold uppercase tracking-wider"></TableHead>}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {group.items.map(a => (
                                  <TableRow key={a.id} className="transition-colors">
                                    <TableCell>{fmtDate(a.accrual_date)}</TableCell>
                                    <TableCell>{fmt(a.balance)}</TableCell>
                                    <TableCell>{a.rate}%</TableCell>
                                    <TableCell>{fmt(a.daily_amount)}</TableCell>
                                    {isAdmin && (
                                      <TableCell>
                                        <button onClick={(e) => { e.stopPropagation(); props.onDeleteAccrual(a.id); }} className="p-1 rounded hover:bg-muted text-red-600">
                                          <Icon name="Trash2" size={14} />
                                        </button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            ) : (
              <DataTable columns={txCols} data={filteredTx} />
            )}
          </TabsContent>

          <TabsContent value="schedule">
            <DataTable columns={schCols} data={detail.schedule || []} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SavingsDetailDialog;