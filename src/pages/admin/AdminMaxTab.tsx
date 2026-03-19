import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, {
  NotificationChannel,
  TelegramSubscriber,
  NotificationHistoryItem,
  NotificationLogEntry,
  NotificationStats,
} from "@/lib/api";

const fmtDate = (d: string) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  draft: { label: "Черновик", variant: "secondary" },
  sending: { label: "Отправляется", variant: "secondary" },
  sent: { label: "Отправлено", variant: "default" },
  error: { label: "Ошибка", variant: "destructive" },
};

const AdminMaxTab = () => {
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<NotificationChannel | null>(null);
  const [subscribers, setSubscribers] = useState<TelegramSubscriber[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [messages, setMessages] = useState<NotificationHistoryItem[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [activeTab, setActiveTab] = useState("send");
  const [form, setForm] = useState({ title: "", body: "", target: "all" });
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<NotificationLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [testChatId, setTestChatId] = useState("");
  const [testing, setTesting] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [autoSettings, setAutoSettings] = useState<Record<string, string>>({});
  const [savingAuto, setSavingAuto] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [channels, subs, st, hist, maxSettings] = await Promise.all([
        api.notifications.channels(),
        api.notifications.maxSubscribers(),
        api.notifications.stats(),
        api.notifications.history("max", 50, 0),
        api.notifications.getMaxSettings(),
      ]);
      const maxChannel = channels.find(c => c.channel === "max");
      setChannel(maxChannel || null);
      setSubscribers(subs);
      setStats(st);
      setMessages(hist.items);
      setMessagesTotal(hist.total);
      setAutoSettings(maxSettings);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    }
    setLoading(false);
  };

  const loadWebhookInfo = async () => {
    try {
      const info = await api.notifications.maxWebhookInfo();
      setWebhookUrl(info.url || "");
    } catch { /* skip */ }
  };

  useEffect(() => { loadData(); loadWebhookInfo(); }, []);

  const handleSend = async () => {
    if (!form.body.trim()) {
      toast({ title: "Введите текст сообщения", variant: "destructive" });
      return;
    }
    if (form.target === "selected" && selectedUsers.length === 0) {
      toast({ title: "Выберите получателей", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await api.notifications.sendMax({
        title: form.title.trim(),
        body: form.body.trim(),
        target: form.target,
        target_user_ids: form.target === "selected" ? selectedUsers : undefined,
      });
      toast({ title: `Отправлено: ${res.sent}, ошибок: ${res.failed}` });
      setForm({ title: "", body: "", target: "all" });
      setSelectedUsers([]);
      loadData();
    } catch (e) {
      toast({ title: "Ошибка отправки", description: String(e), variant: "destructive" });
    }
    setSending(false);
  };

  const openLog = async (id: number) => {
    setLogLoading(true);
    setShowLog(true);
    try {
      const entries = await api.notifications.historyLog(id);
      setLogEntries(entries);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setLogLoading(false);
  };

  const toggleEnabled = async () => {
    try {
      await api.notifications.saveChannel("max", !channel?.enabled);
      loadData();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleTest = async () => {
    if (!testChatId.trim()) {
      toast({ title: "Введите Chat ID", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      await api.notifications.testMax(testChatId.trim());
      toast({ title: "Тестовое сообщение отправлено" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setTesting(false);
  };

  const toggleUser = (userId: number) => {
    setSelectedUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const handleSaveAutoSettings = async () => {
    setSavingAuto(true);
    try {
      await api.notifications.saveMaxSettings(autoSettings);
      toast({ title: "Настройки автоуведомлений сохранены" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setSavingAuto(false);
  };

  const toggleAutoDay = (field: string, day: string) => {
    const current = (autoSettings[field] || "").split(",").map(d => d.trim()).filter(Boolean);
    const updated = current.includes(day) ? current.filter(d => d !== day) : [...current, day].sort((a, b) => Number(b) - Number(a));
    setAutoSettings(prev => ({ ...prev, [field]: updated.join(",") }));
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center">
              <Icon name="Users" size={20} className="text-violet-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.max_subscribers || 0}</div>
              <div className="text-xs text-muted-foreground">Подписчиков</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Icon name="MessageCircle" size={20} className="text-purple-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.max_messages || 0}</div>
              <div className="text-xs text-muted-foreground">Рассылок</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: channel?.enabled ? "#f0fdf4" : "#fef2f2" }}>
              <Icon name={channel?.enabled ? "CheckCircle" : "XCircle"} size={20} className={channel?.enabled ? "text-green-500" : "text-red-500"} />
            </div>
            <div>
              <div className="text-sm font-medium">{channel?.enabled ? "Включён" : "Отключён"}</div>
              <div className="text-xs text-muted-foreground">Статус канала</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="send">Отправить</TabsTrigger>
          <TabsTrigger value="history">История ({messagesTotal})</TabsTrigger>
          <TabsTrigger value="subscribers">Подписчики ({subscribers.length})</TabsTrigger>
          <TabsTrigger value="auto">Авто</TabsTrigger>
          <TabsTrigger value="templates">Шаблоны</TabsTrigger>
          <TabsTrigger value="settings">Настройки</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="MessageCircle" size={18} />
                Новая рассылка в MAX
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Заголовок (необязательно)</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Будет выделен жирным" maxLength={100} />
              </div>
              <div>
                <Label>Текст сообщения</Label>
                <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Текст для отправки в MAX..." rows={4} maxLength={4000} />
              </div>
              <div>
                <Label>Получатели</Label>
                <Select value={form.target} onValueChange={v => setForm({ ...form, target: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все подписчики ({subscribers.length})</SelectItem>
                    <SelectItem value="selected">Выбранные</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.target === "selected" && (
                <div className="border rounded-lg max-h-48 overflow-y-auto">
                  {subscribers.map(s => (
                    <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                      <Checkbox checked={selectedUsers.includes(s.user_id)} onCheckedChange={() => toggleUser(s.user_id)} />
                      <span className="text-sm">{s.name || s.first_name || s.username}</span>
                      {s.username && <span className="text-xs text-muted-foreground">@{s.username}</span>}
                    </label>
                  ))}
                  {subscribers.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">Нет подписчиков</div>}
                </div>
              )}
              <Button onClick={handleSend} disabled={sending || !form.body.trim()}>
                {sending ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="MessageCircle" size={16} className="mr-2" />}
                Отправить
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {messages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Нет отправленных сообщений</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Заголовок</TableHead>
                      <TableHead>Текст</TableHead>
                      <TableHead className="text-center">Отпр.</TableHead>
                      <TableHead className="text-center">Ошиб.</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map(m => {
                      const st = statusMap[m.status] || { label: m.status, variant: "secondary" as const };
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.created_at)}</TableCell>
                          <TableCell className="text-sm max-w-[150px] truncate">{m.title || "—"}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{m.body}</TableCell>
                          <TableCell className="text-center text-sm">{m.sent_count}</TableCell>
                          <TableCell className="text-center text-sm">{m.failed_count}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => openLog(m.id)}>
                              <Icon name="FileText" size={14} />
                            </Button>
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

        <TabsContent value="subscribers" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {subscribers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Нет подписчиков</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Имя</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Chat ID</TableHead>
                      <TableHead>Пайщик</TableHead>
                      <TableHead>Подписка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{s.first_name || "—"}</TableCell>
                        <TableCell className="text-sm">{s.username ? `@${s.username}` : "—"}</TableCell>
                        <TableCell className="text-sm font-mono">{s.chat_id}</TableCell>
                        <TableCell className="text-sm">{s.name || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(s.subscribed_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auto" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Icon name="CalendarClock" size={18} />
                    Напоминания о платежах по займам
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-normal text-muted-foreground">{autoSettings.enabled === "true" ? "Вкл" : "Выкл"}</span>
                    <Switch checked={autoSettings.enabled === "true"} onCheckedChange={v => setAutoSettings(prev => ({ ...prev, enabled: v ? "true" : "false" }))} />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm">За сколько дней напоминать</Label>
                  <p className="text-xs text-muted-foreground mb-2">Пайщик получит сообщение в MAX за выбранное количество дней до даты платежа</p>
                  <div className="flex flex-wrap gap-2">
                    {["7", "5", "3", "2", "1", "0"].map(d => {
                      const active = (autoSettings.reminder_days || "").split(",").map(s => s.trim()).includes(d);
                      return (
                        <Button key={d} variant={active ? "default" : "outline"} size="sm" onClick={() => toggleAutoDay("reminder_days", d)} className="min-w-[70px]">
                          {d === "0" ? "В день" : `${d} дн.`}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    <Label className="text-sm">Уведомления о просрочке</Label>
                    <p className="text-xs text-muted-foreground">Отправлять сообщение, если платёж просрочен</p>
                  </div>
                  <Switch checked={autoSettings.overdue_notify === "true"} onCheckedChange={v => setAutoSettings(prev => ({ ...prev, overdue_notify: v ? "true" : "false" }))} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Icon name="PiggyBank" size={18} />
                    Напоминания об окончании сбережений
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-normal text-muted-foreground">{autoSettings.savings_enabled === "true" ? "Вкл" : "Выкл"}</span>
                    <Switch checked={autoSettings.savings_enabled === "true"} onCheckedChange={v => setAutoSettings(prev => ({ ...prev, savings_enabled: v ? "true" : "false" }))} />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div>
                  <Label className="text-sm">За сколько дней напоминать</Label>
                  <p className="text-xs text-muted-foreground mb-2">Пайщик получит сообщение о приближении даты закрытия сберегательного договора</p>
                  <div className="flex flex-wrap gap-2">
                    {["30", "15", "7", "3", "1", "0"].map(d => {
                      const active = (autoSettings.savings_reminder_days || "").split(",").map(s => s.trim()).includes(d);
                      return (
                        <Button key={d} variant={active ? "default" : "outline"} size="sm" onClick={() => toggleAutoDay("savings_reminder_days", d)} className="min-w-[70px]">
                          {d === "0" ? "В день" : `${d} дн.`}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSaveAutoSettings} disabled={savingAuto}>
              {savingAuto && <Icon name="Loader2" size={16} className="animate-spin mr-2" />}
              Сохранить настройки
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-sm text-muted-foreground">
                Используйте переменные: <code className="bg-muted px-1 rounded text-xs">{"{contract_no}"}</code> — номер договора, <code className="bg-muted px-1 rounded text-xs">{"{amount}"}</code> — сумма, <code className="bg-muted px-1 rounded text-xs">{"{days}"}</code> — кол-во дней (для шаблона «за N дней»). Поддерживается HTML: <code className="bg-muted px-1 rounded text-xs">{"<b>жирный</b>"}</code>
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="CalendarClock" size={18} />
                  Напоминание о платеже — в день платежа
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_payment_today || "Сегодня дата платежа по займу <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб."} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_payment_today: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="CalendarClock" size={18} />
                  Напоминание о платеже — за 1 день
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_payment_tomorrow || "До даты платежа по займу <b>{contract_no}</b> остался <b>1 день</b>.\nСумма: <b>{amount}</b> руб."} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_payment_tomorrow: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="CalendarClock" size={18} />
                  Напоминание о платеже — за N дней
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_payment_days || "До даты платежа по займу <b>{contract_no}</b> осталось <b>{days} дн.</b>\nСумма: <b>{amount}</b> руб."} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_payment_days: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="AlertTriangle" size={18} className="text-red-500" />
                  Уведомление о просрочке
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_overdue || "Платёж по займу <b>{contract_no}</b> просрочен.\nСумма: <b>{amount}</b> руб.\n\nВо избежание пени оплатите как можно скорее."} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_overdue: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="PiggyBank" size={18} />
                  Сбережения — в день окончания
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_savings_today || "Сегодня истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб."} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_savings_today: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="PiggyBank" size={18} />
                  Сбережения — за 1 день
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_savings_tomorrow || "Завтра истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб."} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_savings_tomorrow: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="PiggyBank" size={18} />
                  Сбережения — за N дней
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_savings_days || "Через <b>{days} дн.</b> истекает срок договора сбережений <b>{contract_no}</b>.\nСумма: <b>{amount}</b> руб."} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_savings_days: e.target.value }))} />
              </CardContent>
            </Card>

            <Button onClick={handleSaveAutoSettings} disabled={savingAuto}>
              {savingAuto && <Icon name="Loader2" size={16} className="animate-spin mr-2" />}
              Сохранить шаблоны
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Icon name="Settings" size={18} />
                  Настройки MAX
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-normal text-muted-foreground">{channel?.enabled ? "Вкл" : "Выкл"}</span>
                  <Switch checked={channel?.enabled || false} onCheckedChange={toggleEnabled} />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-violet-50 border border-violet-100 rounded-lg text-sm text-violet-700">
                Токен MAX-бота задаётся через секрет <code className="font-mono bg-violet-100 px-1 rounded">MAX_BOT_TOKEN</code> в настройках проекта.
              </div>
              <div className="border-t pt-4">
                <Label>Webhook для бота</Label>
                <p className="text-xs text-muted-foreground mb-2">Webhook нужен, чтобы бот принимал команды от пайщиков (привязка MAX)</p>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={webhookUrl ? "default" : "secondary"}>
                    {webhookUrl ? "Активен" : "Не установлен"}
                  </Badge>
                </div>
                {webhookUrl && <p className="text-xs text-muted-foreground font-mono mb-2 break-all">{webhookUrl}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={async () => {
                    setWebhookLoading(true);
                    try {
                      const res = await api.notifications.setMaxWebhook();
                      toast({ title: "Webhook установлен", description: res.webhook_url });
                      loadWebhookInfo();
                    } catch (e) { toast({ title: "Ошибка", description: String(e), variant: "destructive" }); }
                    setWebhookLoading(false);
                  }} disabled={webhookLoading}>
                    {webhookLoading ? <Icon name="Loader2" size={14} className="animate-spin mr-1" /> : <Icon name="Link" size={14} className="mr-1" />}
                    {webhookUrl ? "Обновить" : "Установить"}
                  </Button>
                  {webhookUrl && (
                    <Button variant="outline" size="sm" onClick={async () => {
                      try {
                        await api.notifications.deleteMaxWebhook();
                        setWebhookUrl("");
                        toast({ title: "Webhook удалён" });
                      } catch (e) { toast({ title: "Ошибка", description: String(e), variant: "destructive" }); }
                    }}>
                      <Icon name="Unlink" size={14} className="mr-1" />
                      Удалить
                    </Button>
                  )}
                </div>
              </div>
              <div className="border-t pt-4">
                <Label>Тест отправки</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={testChatId} onChange={e => setTestChatId(e.target.value)} placeholder="Chat ID" className="max-w-[200px]" />
                  <Button variant="outline" onClick={handleTest} disabled={testing}>
                    {testing ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="MessageCircle" size={16} className="mr-2" />}
                    Тест
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Лог отправки</DialogTitle></DialogHeader>
          {logLoading ? (
            <div className="flex justify-center py-8"><Icon name="Loader2" size={24} className="animate-spin" /></div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Пайщик</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Ошибка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logEntries.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{l.user_name || `ID ${l.user_id}`}</TableCell>
                      <TableCell>
                        <Badge variant={l.status === "sent" ? "default" : "destructive"}>
                          {l.status === "sent" ? "OK" : "Ошибка"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{l.error_text || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMaxTab;