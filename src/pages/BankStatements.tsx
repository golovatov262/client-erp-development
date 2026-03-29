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
import api, { bankApi, BankConnection, BankStatement, BankTransaction, Organization } from "@/lib/api";
import funcUrls from "../../backend/func2url.json";

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
  const [fetchDate, setFetchDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  });
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [authConnectionId, setAuthConnectionId] = useState<number>(0);
  const [authCode, setAuthCode] = useState("");
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

  const handleFetch = async (connectionId?: number) => {
    setFetching(true);
    try {
      if (connectionId) {
        const result = await bankApi.fetch(connectionId, fetchDate);
        if (result.error) {
          toast({ title: "Ошибка загрузки", description: result.error, variant: "destructive" });
        } else if (result.skipped) {
          toast({ title: "Выписка уже загружена", description: result.reason });
        } else {
          toast({ title: `Загружено: ${result.total} операций, разнесено: ${result.matched}` });
        }
      } else {
        const results = await bankApi.fetchAll(fetchDate);
        const totalOps = results.reduce((s, r) => s + (r.total || 0), 0);
        const totalMatched = results.reduce((s, r) => s + (r.matched || 0), 0);
        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
          toast({ title: "Есть ошибки", description: errors.map(e => e.error).join("; "), variant: "destructive" });
        } else {
          toast({ title: `Загружено ${totalOps} операций, разнесено ${totalMatched}` });
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

  const handleChangeSecret = async (connId: number) => {
    const newSecret = prompt("Введите НОВЫЙ client_secret (мин. 8 символов).\n\nСбер требует сменить начальный secret перед использованием OAuth.\nПридумайте надёжный пароль (буквы, цифры, спецсимволы):");
    if (!newSecret || newSecret.length < 8) {
      if (newSecret !== null) toast({ title: "Ошибка", description: "Secret должен быть не менее 8 символов", variant: "destructive" });
      return;
    }
    const cronSberUrl = (funcUrls as Record<string, string>)["cron-sber"];
    try {
      const res = await fetch(cronSberUrl + "?action=change_secret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connId, new_secret: newSecret }),
      });
      const data = await res.json();
      if (data.error) {
        toast({ title: "Ошибка смены secret", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Secret сменён!", description: "Обновите секрет SBER_CLIENT_SECRET в настройках проекта на: " + newSecret });
        loadData();
      }
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const [exchanging, setExchanging] = useState(false);
  const [exchangeAttempt, setExchangeAttempt] = useState(0);
  const [exchangeMax, setExchangeMax] = useState(0);

  const doExchangeOnce = async (cronSberUrl: string, connId: number): Promise<{success: boolean; error?: string; stop?: boolean}> => {
    try {
      const res = await fetch(cronSberUrl + "?action=exchange_code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connId }),
      });
      const data = await res.json();
      if (data.success) return { success: true };
      const debugInfo = data.debug ? "\n\nDebug: " + JSON.stringify(data.debug, null, 2) : "";
      if (data.error && !data.error.includes("не отвечает")) return { success: false, error: data.error + debugInfo, stop: true };
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  };

  const handleExchangeCode = async (connId: number) => {
    const cronSberUrl = (funcUrls as Record<string, string>)["cron-sber"];
    if (!cronSberUrl) return;
    setExchanging(true);
    const maxAttempts = 6;
    setExchangeMax(maxAttempts);
    for (let i = 1; i <= maxAttempts; i++) {
      setExchangeAttempt(i);
      const result = await doExchangeOnce(cronSberUrl, connId);
      if (result.success) {
        toast({ title: "Токен получен!" });
        loadData();
        setExchanging(false);
        setExchangeAttempt(0);
        return;
      }
      if (result.stop) {
        toast({ title: "Ошибка обмена", description: result.error, variant: "destructive" });
        setExchanging(false);
        setExchangeAttempt(0);
        return;
      }
      if (i < maxAttempts) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    toast({ title: "Сбер не ответил", description: "Сервер Сбера не отвечает после 6 попыток. Попробуйте позже.", variant: "destructive" });
    setExchanging(false);
    setExchangeAttempt(0);
  };

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'sber_auth_callback') {
        if (e.data.exchange_result === 'success') {
          toast({ title: "Авторизация успешна" });
          setShowAuthDialog(false);
          loadData();
        } else if (e.data.exchange_result === 'timeout') {
          toast({ title: "Код сохранён", description: "Сервер Сбера не ответил. Нажмите «Обменять код» для повторной попытки." });
          setShowAuthDialog(false);
          loadData();
        } else if (e.data.code) {
          setAuthCode(e.data.code);
          loadData();
        }
      }
      if (e.data?.type === 'sber_auth_error') {
        toast({ title: "Ошибка авторизации", description: e.data.description || e.data.error, variant: "destructive" });
        setShowAuthDialog(false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const openAuthDialog = async (connId: number) => {
    setAuthConnectionId(connId);
    setAuthCode("");
    try {
      const { auth_url } = await bankApi.authUrl(connId, "");
      window.open(auth_url, "_blank", "width=600,height=700");
      setShowAuthDialog(true);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleAuthCallback = async () => {
    if (!authCode) return;
    try {
      await bankApi.authCallback(authConnectionId, authCode, "");
      toast({ title: "Авторизация успешна" });
      setShowAuthDialog(false);
      loadData();
    } catch (e) {
      toast({ title: "Ошибка авторизации", description: String(e), variant: "destructive" });
    }
  };

  const openAddConnection = async () => {
    try {
      const o = await api.organizations.list();
      setOrgs(o);
    } catch (e) { void e; }
    setShowAddConn(true);
  };

  const uploadCert = async (orgId: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pem,.p12,.pfx";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      let password = "";
      if (file.name.endsWith(".p12") || file.name.endsWith(".pfx")) {
        const pwd = prompt("Введите пароль от сертификата (.p12):");
        if (pwd === null) return;
        password = pwd;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const cronSberUrl = (funcUrls as Record<string, string>)["cron-sber"];
        if (!cronSberUrl) { toast({ title: "Ошибка", description: "URL cron-sber не найден", variant: "destructive" }); return; }
        const res = await fetch(cronSberUrl + "?action=upload_cert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org_id: orgId, cert_data: base64, password }),
        });
        const data = await res.json();
        if (data.error) {
          toast({ title: "Ошибка загрузки", description: data.error, variant: "destructive" });
        } else {
          const fmt = data.format === "converted_from_p12" ? " (сконвертирован из .p12)" : "";
          toast({ title: "Сертификат загружен", description: `${data.uploaded} (${data.size} байт)${fmt}` });
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const uploadCaChain = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pem,.crt,.cer";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        const cronSberUrl = (funcUrls as Record<string, string>)["cron-sber"];
        if (!cronSberUrl) { toast({ title: "Ошибка", description: "URL cron-sber не найден", variant: "destructive" }); return; }
        const res = await fetch(cronSberUrl + "?action=upload_ca_chain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cert_data: base64 }),
        });
        const data = await res.json();
        if (data.error) {
          toast({ title: "Ошибка загрузки", description: data.error, variant: "destructive" });
        } else {
          toast({ title: "CA-цепочка загружена", description: `${data.uploaded} (${data.size} байт)` });
        }
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const totalMatched = statements.reduce((s, st) => s + st.matched_count, 0);
  const totalUnmatched = statements.reduce((s, st) => s + st.unmatched_count, 0);

  if (loading) return (
    <div className="p-6 flex items-center justify-center py-12">
      <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <PageHeader title="Банковские выписки" subtitle="Автоматическая загрузка из СберБизнес и разнесение платежей" />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Icon name="Building2" size={20} className="text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{connections.filter(c => c.is_active).length}</div>
              <div className="text-xs text-muted-foreground">Подключений</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Icon name="FileText" size={20} className="text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{statementsTotal}</div>
              <div className="text-xs text-muted-foreground">Выписок</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Icon name="CheckCircle2" size={20} className="text-emerald-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalMatched}</div>
              <div className="text-xs text-muted-foreground">Разнесено</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
              <Icon name="AlertCircle" size={20} className="text-orange-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{totalUnmatched}</div>
              <div className="text-xs text-muted-foreground">Не разнесено</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Подключения</TabsTrigger>
          <TabsTrigger value="statements">Выписки ({statementsTotal})</TabsTrigger>
          <TabsTrigger value="transactions">Операции</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={openAddConnection}>
              <Icon name="Plus" size={16} className="mr-2" />Добавить подключение
            </Button>
            <Button variant="outline" onClick={() => uploadCert(2)}>
              <Icon name="Shield" size={16} className="mr-2" />Сертификат Эксперт Финанс
            </Button>
            <Button variant="outline" onClick={() => uploadCert(3)}>
              <Icon name="Shield" size={16} className="mr-2" />Сертификат Фин Формула
            </Button>
            <Button variant="outline" onClick={uploadCaChain}>
              <Icon name="Link" size={16} className="mr-2" />CA-цепочка Сбера
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Input type="date" value={fetchDate} onChange={e => setFetchDate(e.target.value)} className="w-44" />
              <Button onClick={() => handleFetch()} disabled={fetching || connections.filter(c => c.is_active).length === 0} variant="outline">
                {fetching ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Download" size={16} className="mr-2" />}
                Загрузить все выписки
              </Button>
            </div>
          </div>

          {connections.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Icon name="Building2" size={48} className="mx-auto mb-4 opacity-30" />
                <p>Нет подключений к банку</p>
                <p className="text-sm mt-1">Добавьте подключение к расчётному счёту в СберБизнесе</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {connections.map(conn => {
                const syncInfo = syncStatusMap[conn.last_sync_status] || syncStatusMap.never;
                return (
                  <Card key={conn.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="font-medium">{conn.org_name}</div>
                          <div className="text-sm text-muted-foreground font-mono">р/с {conn.account_number}</div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className={syncInfo.color}>
                              <Icon name={conn.last_sync_status === "ok" ? "CheckCircle2" : conn.last_sync_status === "error" ? "XCircle" : "Clock"} size={12} className="inline mr-1" />
                              {syncInfo.label}
                            </span>
                            {conn.last_sync_at && <span className="text-muted-foreground">Последняя загрузка: {fmtDateTime(conn.last_sync_at)}</span>}
                          </div>
                          {conn.last_sync_error && <div className="text-xs text-red-500">{conn.last_sync_error}</div>}
                          <div className="text-xs">
                            {conn.has_token ? (
                              <span className="text-green-600"><Icon name="Key" size={12} className="inline mr-1" />Токен активен (до {fmtDateTime(conn.token_expires_at)})</span>
                            ) : conn.has_code ? (
                              <span className="text-blue-600"><Icon name="Code" size={12} className="inline mr-1" />Код получен — нажмите «Обменять код»</span>
                            ) : (
                              <span className="text-orange-600"><Icon name="KeyRound" size={12} className="inline mr-1" />Требуется авторизация</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={conn.is_active} onCheckedChange={v => handleToggleConnection(conn.id, v)} />
                          {!conn.has_token && conn.has_code && (
                            <Button size="sm" onClick={() => handleExchangeCode(conn.id)} disabled={exchanging}>
                              {exchanging ? <Icon name="Loader2" size={14} className="animate-spin mr-1" /> : <Icon name="RefreshCw" size={14} className="mr-1" />}
                              {exchanging && exchangeAttempt > 0 ? `Попытка ${exchangeAttempt}/${exchangeMax}...` : "Обменять код"}
                            </Button>
                          )}
                          {!conn.has_token && (
                            <Button size="sm" variant="outline" onClick={() => handleChangeSecret(conn.id)}>
                              <Icon name="KeyRound" size={14} className="mr-1" />Сменить secret
                            </Button>
                          )}
                          {!conn.has_token && (
                            <Button size="sm" variant="outline" onClick={() => openAuthDialog(conn.id)}>
                              <Icon name="LogIn" size={14} className="mr-1" />Авторизовать
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => handleFetch(conn.id)} disabled={fetching || !conn.has_token}>
                            <Icon name="Download" size={14} className="mr-1" />Загрузить
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="statements" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {statements.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Выписок пока нет</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Организация</TableHead>
                      <TableHead className="text-right">Начало дня</TableHead>
                      <TableHead className="text-right">Конец дня</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Приход</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Расход</TableHead>
                      <TableHead className="text-center">Операций</TableHead>
                      <TableHead className="text-center">Разнесено</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statements.map(st => (
                      <TableRow key={st.id}>
                        <TableCell className="font-medium whitespace-nowrap">{fmtDate(st.statement_date)}</TableCell>
                        <TableCell className="text-sm">{st.org_name}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{fmtMoney(st.opening_balance)}</TableCell>
                        <TableCell className="text-right text-sm font-mono">{fmtMoney(st.closing_balance)}</TableCell>
                        <TableCell className="text-right text-sm font-mono text-green-600 hidden sm:table-cell">+{fmtMoney(st.credit_turnover)}</TableCell>
                        <TableCell className="text-right text-sm font-mono text-red-500 hidden sm:table-cell">-{fmtMoney(st.debit_turnover)}</TableCell>
                        <TableCell className="text-center">{st.transaction_count}</TableCell>
                        <TableCell className="text-center">
                          <span className="text-green-600">{st.matched_count}</span>
                          {st.unmatched_count > 0 && <span className="text-orange-500 ml-1">/ {st.unmatched_count}</span>}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                            setSelectedStmt(st.id);
                            setMatchFilter("");
                            loadTransactions(st.id);
                            setActiveTab("transactions");
                          }}>
                            <Icon name="Eye" size={14} />
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

        <TabsContent value="transactions" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={matchFilter} onValueChange={v => { setMatchFilter(v); loadTransactions(selectedStmt, v === "all" ? "" : v); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Все статусы" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="applied">Разнесённые</SelectItem>
                <SelectItem value="matched">Найденные</SelectItem>
                <SelectItem value="not_found">Не найдено</SelectItem>
                <SelectItem value="no_contract">Без договора</SelectItem>
                <SelectItem value="error">С ошибкой</SelectItem>
              </SelectContent>
            </Select>
            {selectedStmt && (
              <Button variant="outline" size="sm" onClick={() => { setSelectedStmt(undefined); loadTransactions(undefined, matchFilter === "all" ? "" : matchFilter); }}>
                <Icon name="X" size={14} className="mr-1" />Сбросить фильтр выписки
              </Button>
            )}
            <span className="text-sm text-muted-foreground ml-auto">{transactions.length} операций</span>
          </div>

          <Card>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  {selectedStmt ? "В выписке нет операций" : "Выберите выписку или загрузите операции"}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Дата</TableHead>
                        <TableHead>Сумма</TableHead>
                        <TableHead className="hidden md:table-cell">Плательщик</TableHead>
                        <TableHead>Назначение</TableHead>
                        <TableHead>Договор</TableHead>
                        <TableHead>Статус</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map(txn => {
                        const ms = matchStatusMap[txn.match_status] || matchStatusMap.pending;
                        return (
                          <TableRow key={txn.id}>
                            <TableCell className="text-xs whitespace-nowrap">{fmtDate(txn.document_date || txn.operation_date)}</TableCell>
                            <TableCell className={`font-mono text-sm whitespace-nowrap ${txn.direction === "CREDIT" ? "text-green-600" : "text-red-500"}`}>
                              {txn.direction === "CREDIT" ? "+" : "-"}{fmtMoney(txn.amount)}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs max-w-[200px] truncate">{txn.payer_name || "—"}</TableCell>
                            <TableCell className="text-xs max-w-[250px] truncate" title={txn.payment_purpose}>{txn.payment_purpose || "—"}</TableCell>
                            <TableCell className="text-xs font-mono">{txn.matched_contract_no || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={ms.variant} className="text-xs">{ms.label}</Badge>
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
          <DialogHeader><DialogTitle>Добавить подключение к банку</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Организация</Label>
              <Select value={addForm.org_id} onValueChange={v => {
                setAddForm({ ...addForm, org_id: v });
                const org = orgs.find(o => String(o.id) === v);
                if (org?.rs) setAddForm(prev => ({ ...prev, org_id: v, account_number: org.rs || "" }));
              }}>
                <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
                <SelectContent>
                  {orgs.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.short_name || o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Расчётный счёт</Label>
              <Input value={addForm.account_number} onChange={e => setAddForm({ ...addForm, account_number: e.target.value })} placeholder="40701810252090000322" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddConn(false)}>Отмена</Button>
            <Button onClick={handleAddConnection} disabled={!addForm.org_id || !addForm.account_number}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Авторизация в СберБизнес</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Откроется окно авторизации СберБизнес ID. После входа скопируйте код авторизации из адресной строки (параметр <code className="bg-muted px-1 rounded">code</code>) и вставьте его сюда.
            </p>
            <div>
              <Label>Код авторизации</Label>
              <Input value={authCode} onChange={e => setAuthCode(e.target.value)} placeholder="Вставьте code из URL..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuthDialog(false)}>Отмена</Button>
            <Button onClick={handleAuthCallback} disabled={!authCode}>Подтвердить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BankStatements;