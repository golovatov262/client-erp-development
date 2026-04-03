import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Icon from "@/components/ui/icon";
import PageHeader from "@/components/ui/page-header";
import { useToast } from "@/hooks/use-toast";
import api, { bankApi, BankConnection, BankStatement, BankTransaction, BankImapStatus, BankSyncLogEntry, Organization } from "@/lib/api";

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const fmtDateTime = (d: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const fmtMoney = (v: number) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

const matchStatusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  applied: { label: "Разнесён", variant: "default" },
  matched: { label: "Найден", variant: "secondary" },
  not_found: { label: "Не найден", variant: "destructive" },
  no_contract: { label: "Без договора", variant: "outline" },
  error: { label: "Ошибка", variant: "destructive" },
  pending: { label: "Ожидает", variant: "secondary" },
};

const syncStatusMap: Record<string, { label: string; color: string }> = {
  ok: { label: "Синхронизирован", color: "text-green-600" },
  error: { label: "Ошибка", color: "text-red-600" },
  never: { label: "Не запускался", color: "text-muted-foreground" },
};

const BankStatements = () => {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [statementsTotal, setStatementsTotal] = useState(0);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [showAddConn, setShowAddConn] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [addForm, setAddForm] = useState({ org_id: "", account_number: "" });
  const [selectedStmt, setSelectedStmt] = useState<number | undefined>();
  const [matchFilter, setMatchFilter] = useState<string>("");
  const [imapStatus, setImapStatus] = useState<BankImapStatus | null>(null);
  const [syncLog, setSyncLog] = useState<BankSyncLogEntry[]>([]);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [conns, stmts] = await Promise.all([
        bankApi.connections(),
        bankApi.statements(undefined, 30, 0),
      ]);
      setConnections(conns);
      setStatements(stmts.items);
      setStatementsTotal(stmts.total);
      bankApi.status().then(setImapStatus).catch(() => {});
      bankApi.syncLog(20).then(setSyncLog).catch(() => {});
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const loadTransactions = async (stmtId?: number, filter?: string) => {
    try {
      const txns = await bankApi.transactions(stmtId, filter || undefined);
      setTransactions(txns);
    } catch (e) {
      toast({ title: "Ошибка загрузки транзакций", description: String(e), variant: "destructive" });
    }
  };

  const handleFetchFromEmail = async () => {
    setFetching(true);
    try {
      const result = await bankApi.fetchFromEmail();
      if (result.error) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      } else if (result.emails_found === 0) {
        toast({ title: "Писем с выписками не найдено", description: result.message || "Проверьте почтовый ящик" });
      } else {
        const loaded = result.results?.filter(r => !r.skipped && !r.error) || [];
        const skipped = result.results?.filter(r => r.skipped) || [];
        const totalOps = loaded.reduce((s, r) => s + (r.total || 0), 0);
        const totalMatched = loaded.reduce((s, r) => s + (r.matched || 0), 0);
        let desc = `Загружено ${totalOps} операций, разнесено ${totalMatched}`;
        if (skipped.length > 0) desc += `. Пропущено ${skipped.length} (уже загружены)`;
        if (result.errors?.length > 0) {
          toast({ title: "Есть ошибки", description: result.errors.join("; "), variant: "destructive" });
        } else {
          toast({ title: `Обработано ${result.emails_found} писем`, description: desc });
        }
      }
      loadData();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setFetching(false);
  };

  const handleAddConnection = async () => {
    if (!addForm.org_id || !addForm.account_number) return;
    try {
      await bankApi.saveConnection({ org_id: Number(addForm.org_id), account_number: addForm.account_number });
      toast({ title: "Подключение добавлено" });
      setShowAddConn(false);
      setAddForm({ org_id: "", account_number: "" });
      loadData();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleToggleConnection = async (connId: number, isActive: boolean) => {
    try {
      await bankApi.toggleConnection(connId, isActive);
      loadData();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <PageHeader title="Банк" subtitle="Банковские выписки" icon="Building2" />
        <div className="flex justify-center py-12">
          <Icon name="Loader2" className="animate-spin" size={32} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Банк" subtitle="Выписки из почты (формат 1С)" icon="Building2" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          <TabsTrigger value="statements">Выписки ({statementsTotal})</TabsTrigger>
          <TabsTrigger value="transactions">Операции</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Источник выписок</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Icon name="Mail" size={20} className="text-blue-600" />
                  <div>
                    <p className="font-medium">{imapStatus?.imap_user || "—"}</p>
                    <p className="text-xs text-muted-foreground">{imapStatus?.imap_host || "—"}</p>
                  </div>
                </div>
                <Badge variant={imapStatus?.imap_configured ? "default" : "destructive"} className="mt-2">
                  {imapStatus?.imap_configured ? "Настроен" : "Не настроен"}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Расписание</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Icon name="Clock" size={20} className="text-green-600" />
                  <div>
                    <p className="font-medium">Ежедневно 08:30 МСК</p>
                    <p className="text-xs text-muted-foreground">Автоматическая загрузка</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Выписок загружено</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{statementsTotal}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Расчётные счета</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { api.organizations.list().then(setOrgs); setShowAddConn(true); }}>
                    <Icon name="Plus" size={16} className="mr-1" /> Добавить счёт
                  </Button>
                  <Button size="sm" onClick={handleFetchFromEmail} disabled={fetching}>
                    {fetching ? <Icon name="Loader2" size={16} className="mr-1 animate-spin" /> : <Icon name="Mail" size={16} className="mr-1" />}
                    Загрузить из почты
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {connections.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Нет подключённых счетов</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Организация</TableHead>
                      <TableHead>Расч. счёт</TableHead>
                      <TableHead>Последняя синхр.</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Активен</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connections.map(c => {
                      const sync = syncStatusMap[c.last_sync_status] || syncStatusMap.never;
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.org_name}</TableCell>
                          <TableCell className="font-mono text-sm">{c.account_number}</TableCell>
                          <TableCell>{fmtDateTime(c.last_sync_at)}</TableCell>
                          <TableCell>
                            <span className={sync.color}>{sync.label}</span>
                            {c.last_sync_error && (
                              <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={c.last_sync_error}>{c.last_sync_error}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <Switch checked={c.is_active} onCheckedChange={(v) => handleToggleConnection(c.id, v)} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Журнал загрузок</CardTitle>
            </CardHeader>
            <CardContent>
              {syncLog.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Загрузок пока не было</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата/время</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-center">Писем</TableHead>
                      <TableHead className="text-center">Выписок</TableHead>
                      <TableHead className="text-center">Операций</TableHead>
                      <TableHead className="text-center">Разнесено</TableHead>
                      <TableHead>Длительность</TableHead>
                      <TableHead>Ошибки</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syncLog.map(log => {
                      const duration = log.started_at && log.finished_at
                        ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                        : null;
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap">{fmtDateTime(log.started_at)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              <Icon name={log.source === "cron" ? "Clock" : "MousePointerClick"} size={12} className="mr-1" />
                              {log.source === "cron" ? "Авто" : "Вручную"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {log.status === "ok" && <Badge variant="default">Успешно</Badge>}
                            {log.status === "error" && <Badge variant="destructive">Ошибка</Badge>}
                            {log.status === "running" && <Badge variant="secondary"><Icon name="Loader2" size={12} className="mr-1 animate-spin" />В процессе</Badge>}
                          </TableCell>
                          <TableCell className="text-center">{log.emails_found || 0}</TableCell>
                          <TableCell className="text-center">{log.statements_loaded || 0}</TableCell>
                          <TableCell className="text-center">{log.transactions_total || 0}</TableCell>
                          <TableCell className="text-center font-medium text-green-600">{log.transactions_matched || 0}</TableCell>
                          <TableCell className="text-muted-foreground">{duration !== null ? `${duration} сек` : "—"}</TableCell>
                          <TableCell className="max-w-[250px]">
                            {log.errors ? (
                              <span className="text-xs text-red-500 truncate block" title={log.errors}>{log.errors}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statements" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Загруженные выписки</CardTitle>
                <Button size="sm" onClick={handleFetchFromEmail} disabled={fetching}>
                  {fetching ? <Icon name="Loader2" size={16} className="mr-1 animate-spin" /> : <Icon name="Mail" size={16} className="mr-1" />}
                  Загрузить из почты
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {statements.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">Нет загруженных выписок</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Организация</TableHead>
                      <TableHead className="text-right">Входящий</TableHead>
                      <TableHead className="text-right">Исходящий</TableHead>
                      <TableHead className="text-right">Дебет</TableHead>
                      <TableHead className="text-right">Кредит</TableHead>
                      <TableHead className="text-center">Операции</TableHead>
                      <TableHead className="text-center">Разнесено</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statements.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{fmtDate(s.statement_date)}</TableCell>
                        <TableCell>{s.org_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtMoney(s.opening_balance)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmtMoney(s.closing_balance)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600">{fmtMoney(s.debit_turnover)}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-green-600">{fmtMoney(s.credit_turnover)}</TableCell>
                        <TableCell className="text-center">{s.transaction_count}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-green-600">{s.matched_count}</span>
                          {s.unmatched_count > 0 && <span className="text-red-500 ml-1">/ {s.unmatched_count}</span>}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setSelectedStmt(s.id);
                            setMatchFilter("");
                            loadTransactions(s.id);
                            setActiveTab("transactions");
                          }}>
                            <Icon name="Eye" size={16} />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg">Операции</CardTitle>
                <div className="flex gap-2 items-center">
                  <Select value={matchFilter} onValueChange={(v) => { setMatchFilter(v); loadTransactions(selectedStmt, v === "all" ? "" : v); }}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Все статусы" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все статусы</SelectItem>
                      <SelectItem value="applied">Разнесённые</SelectItem>
                      <SelectItem value="matched">Найденные</SelectItem>
                      <SelectItem value="not_found">Не найденные</SelectItem>
                      <SelectItem value="no_contract">Без договора</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedStmt && (
                    <Button variant="outline" size="sm" onClick={() => { setSelectedStmt(undefined); loadTransactions(undefined, matchFilter === "all" ? "" : matchFilter); }}>
                      Все выписки
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-2">Нет операций</p>
                  {!selectedStmt && <p className="text-sm text-muted-foreground">Выберите выписку или загрузите новые из почты</p>}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>№ док.</TableHead>
                        <TableHead className="text-right">Сумма</TableHead>
                        <TableHead>Направление</TableHead>
                        <TableHead>Плательщик / Получатель</TableHead>
                        <TableHead>Назначение</TableHead>
                        <TableHead>Договор</TableHead>
                        <TableHead>Статус</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map(t => {
                        const ms = matchStatusMap[t.match_status] || matchStatusMap.pending;
                        const isCredit = t.direction === "CREDIT";
                        return (
                          <TableRow key={t.id}>
                            <TableCell className="whitespace-nowrap">{fmtDate(t.document_date)}</TableCell>
                            <TableCell className="font-mono text-sm">{t.document_number}</TableCell>
                            <TableCell className={`text-right font-mono text-sm ${isCredit ? "text-green-600" : "text-red-600"}`}>
                              {isCredit ? "+" : "-"}{fmtMoney(t.amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={isCredit ? "default" : "secondary"}>
                                {isCredit ? "Приход" : "Расход"}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate" title={isCredit ? t.payer_name : t.payee_name}>
                              {isCredit ? t.payer_name : t.payee_name}
                            </TableCell>
                            <TableCell className="max-w-[300px] truncate" title={t.payment_purpose || ""}>
                              {t.payment_purpose}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{t.matched_contract_no || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={ms.variant}>{ms.label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showAddConn} onOpenChange={setShowAddConn}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить расчётный счёт</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Организация</Label>
              <Select value={addForm.org_id} onValueChange={(v) => setAddForm({ ...addForm, org_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {orgs.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.short_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Номер расчётного счёта</Label>
              <Input value={addForm.account_number} onChange={e => setAddForm({ ...addForm, account_number: e.target.value })} placeholder="40702810..." maxLength={20} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddConn(false)}>Отмена</Button>
            <Button onClick={handleAddConnection}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BankStatements;