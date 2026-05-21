import { useState, useEffect, useMemo } from "react";
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
  SmsRecipient,
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

const recipientName = (r: SmsRecipient) => {
  if (r.member_type === "UL") return r.company_name || "—";
  const fio = [r.last_name, r.first_name, r.middle_name].filter(Boolean).join(" ");
  return fio || "—";
};

const AdminSmsTab = () => {
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<NotificationChannel | null>(null);
  const [recipients, setRecipients] = useState<SmsRecipient[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [messages, setMessages] = useState<NotificationHistoryItem[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [activeTab, setActiveTab] = useState("send");
  const [form, setForm] = useState({ title: "", body: "", target: "all" });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [filterText, setFilterText] = useState("");
  const [sending, setSending] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<NotificationLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testing, setTesting] = useState(false);
  const [autoSettings, setAutoSettings] = useState<Record<string, string>>({});
  const [savingAuto, setSavingAuto] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [channels, recs, st, hist, smsSettings] = await Promise.all([
        api.notifications.channels(),
        api.notifications.smsRecipients(),
        api.notifications.stats(),
        api.notifications.history("sms", 50, 0),
        api.notifications.getSmsSettings(),
      ]);
      const smsChannel = channels.find(c => c.channel === "sms");
      setChannel(smsChannel || null);
      setRecipients(recs);
      setStats(st);
      setMessages(hist.items);
      setMessagesTotal(hist.total);
      setAutoSettings(smsSettings);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const filteredRecipients = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return recipients;
    return recipients.filter(r =>
      recipientName(r).toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q) ||
      (r.member_no || "").toLowerCase().includes(q)
    );
  }, [recipients, filterText]);

  const previewText = useMemo(() => {
    const t = form.title.trim();
    const b = form.body.trim();
    return t ? `${t}. ${b}` : b;
  }, [form.title, form.body]);

  const handleSend = async () => {
    if (!form.body.trim()) {
      toast({ title: "Введите текст сообщения", variant: "destructive" });
      return;
    }
    if (form.target === "selected" && selectedIds.length === 0) {
      toast({ title: "Выберите получателей", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await api.notifications.sendSms({
        title: form.title.trim(),
        body: form.body.trim(),
        target: form.target,
        target_member_ids: form.target === "selected" ? selectedIds : undefined,
      });
      toast({ title: `Отправлено: ${res.sent}, ошибок: ${res.failed}` });
      setForm({ title: "", body: "", target: "all" });
      setSelectedIds([]);
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
      await api.notifications.saveChannel("sms", !channel?.enabled);
      loadData();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: "Введите номер телефона", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      await api.notifications.testSms(testPhone.trim());
      toast({ title: "Тестовое SMS отправлено" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setTesting(false);
  };

  const toggleId = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAllFiltered = () => {
    const ids = filteredRecipients.map(r => r.id);
    setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
  };

  const clearSelection = () => setSelectedIds([]);

  const handleSaveAutoSettings = async () => {
    setSavingAuto(true);
    try {
      await api.notifications.saveSmsSettings(autoSettings);
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
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Icon name="Users" size={20} className="text-emerald-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.sms_recipients ?? recipients.length}</div>
              <div className="text-xs text-muted-foreground">Получателей с телефоном</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-50 flex items-center justify-center">
              <Icon name="MessageSquare" size={20} className="text-sky-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.sms_messages || 0}</div>
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
          <TabsTrigger value="recipients">Получатели ({recipients.length})</TabsTrigger>
          <TabsTrigger value="auto">Авто</TabsTrigger>
          <TabsTrigger value="templates">Шаблоны</TabsTrigger>
          <TabsTrigger value="settings">Настройки</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="MessageSquare" size={18} />
                Новая SMS-рассылка
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Заголовок (необязательно)</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Короткая тема — будет добавлена в начало" maxLength={50} />
              </div>
              <div>
                <Label>Текст SMS</Label>
                <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Текст сообщения..." rows={4} maxLength={480} />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                  <span>Будет отправлено как: <span className="text-foreground">{previewText || "—"}</span></span>
                  <span>{previewText.length} симв.</span>
                </div>
              </div>
              <div>
                <Label>Получатели</Label>
                <Select value={form.target} onValueChange={v => setForm({ ...form, target: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все пайщики с телефоном ({recipients.length})</SelectItem>
                    <SelectItem value="selected">Выбранные ({selectedIds.length})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.target === "selected" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input placeholder="Поиск по имени, телефону или № члена" value={filterText} onChange={e => setFilterText(e.target.value)} className="flex-1" />
                    <Button variant="outline" size="sm" onClick={selectAllFiltered}>Выбрать всех</Button>
                    <Button variant="outline" size="sm" onClick={clearSelection}>Очистить</Button>
                  </div>
                  <div className="border rounded-lg max-h-60 overflow-y-auto">
                    {filteredRecipients.map(r => (
                      <label key={r.id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer">
                        <Checkbox checked={selectedIds.includes(r.id)} onCheckedChange={() => toggleId(r.id)} />
                        <span className="text-sm flex-1 truncate">{recipientName(r)}</span>
                        <span className="text-xs text-muted-foreground font-mono">{r.phone}</span>
                      </label>
                    ))}
                    {filteredRecipients.length === 0 && <div className="p-4 text-sm text-muted-foreground text-center">Никто не найден</div>}
                  </div>
                </div>
              )}
              <Button onClick={handleSend} disabled={sending || !form.body.trim()}>
                {sending ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Send" size={16} className="mr-2" />}
                Отправить SMS
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

        <TabsContent value="recipients" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {recipients.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Нет пайщиков с указанным телефоном</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>№</TableHead>
                      <TableHead>Получатель</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Телефон</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recipients.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm font-mono">{r.member_no}</TableCell>
                        <TableCell className="text-sm">{recipientName(r)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.member_type === "UL" ? "ЮЛ" : "ФЛ"}</TableCell>
                        <TableCell className="text-sm font-mono">{r.phone}</TableCell>
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
                  <p className="text-xs text-muted-foreground mb-2">Пайщик получит SMS за выбранное количество дней до даты платежа</p>
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
                    <Label className="text-sm">SMS о просрочке</Label>
                    <p className="text-xs text-muted-foreground">Отправлять сообщение, если платёж просрочен</p>
                  </div>
                  <Switch checked={autoSettings.overdue_notify === "true"} onCheckedChange={v => setAutoSettings(prev => ({ ...prev, overdue_notify: v ? "true" : "false" }))} />
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-sm">Время отправки</Label>
                  <Input type="time" value={autoSettings.remind_time || "10:00"} onChange={e => setAutoSettings(prev => ({ ...prev, remind_time: e.target.value }))} className="w-32" />
                  <p className="text-xs text-muted-foreground">Время по Москве, в которое будут отправляться SMS</p>
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
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-sm">За сколько дней напоминать</Label>
                  <p className="text-xs text-muted-foreground mb-2">Пайщик получит SMS о приближении даты закрытия сберегательного договора</p>
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
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-sm">Время отправки</Label>
                  <Input type="time" value={autoSettings.savings_remind_time || "10:00"} onChange={e => setAutoSettings(prev => ({ ...prev, savings_remind_time: e.target.value }))} className="w-32" />
                  <p className="text-xs text-muted-foreground">Время по Москве, в которое будут отправляться SMS</p>
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
                Переменные: <code className="bg-muted px-1 rounded text-xs">{"{contract_no}"}</code> — номер договора, <code className="bg-muted px-1 rounded text-xs">{"{amount}"}</code> — сумма, <code className="bg-muted px-1 rounded text-xs">{"{days}"}</code> — кол-во дней, <code className="bg-muted px-1 rounded text-xs">{"{org_name}"}</code> — наименование организации без аббревиатуры (например, Эксперт Финанс), <code className="bg-muted px-1 rounded text-xs">{"{org_phone}"}</code> — телефон организации. В ручной рассылке подстановка тоже работает. SMS не поддерживает HTML — текст уйдёт как есть.
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="CalendarClock" size={18} />
                  Платёж — в день платежа
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_payment_today || "Сегодня платеж по займу {contract_no}, сумма {amount} руб. Ваш \"{org_name}\", {org_phone}"} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_payment_today: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="CalendarClock" size={18} />
                  Платёж — за 1 день
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_payment_tomorrow || "Завтра платеж по займу {contract_no}, сумма {amount} руб. Ваш \"{org_name}\", {org_phone}"} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_payment_tomorrow: e.target.value }))} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="CalendarClock" size={18} />
                  Платёж — за N дней
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea rows={3} value={autoSettings.tpl_payment_days || "Через {days} дн. платеж по займу {contract_no}, сумма {amount} руб. Ваш \"{org_name}\", {org_phone}"} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_payment_days: e.target.value }))} />
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
                <Textarea rows={3} value={autoSettings.tpl_overdue || "Просрочка по займу {contract_no}, сумма {amount} руб. Оплатите во избежание пени. Ваш \"{org_name}\", {org_phone}"} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_overdue: e.target.value }))} />
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
                <Textarea rows={3} value={autoSettings.tpl_savings_today || "Сегодня окончание договора сбережений {contract_no}, сумма {amount} руб. Ваш \"{org_name}\", {org_phone}"} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_savings_today: e.target.value }))} />
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
                <Textarea rows={3} value={autoSettings.tpl_savings_tomorrow || "Завтра окончание договора сбережений {contract_no}, сумма {amount} руб. Ваш \"{org_name}\", {org_phone}"} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_savings_tomorrow: e.target.value }))} />
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
                <Textarea rows={3} value={autoSettings.tpl_savings_days || "Через {days} дн. окончание договора сбережений {contract_no}, сумма {amount} руб. Ваш \"{org_name}\", {org_phone}"} onChange={e => setAutoSettings(prev => ({ ...prev, tpl_savings_days: e.target.value }))} />
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
                  Настройки SMS
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-normal text-muted-foreground">{channel?.enabled ? "Вкл" : "Выкл"}</span>
                  <Switch checked={channel?.enabled || false} onCheckedChange={toggleEnabled} />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg text-sm text-emerald-800">
                SMS отправляются через SMSAero. Доступы задаются в секретах проекта: <code className="font-mono bg-emerald-100 px-1 rounded">SMSAERO_EMAIL</code> и <code className="font-mono bg-emerald-100 px-1 rounded">SMSAERO_API_KEY</code>. Они уже используются для авторизации в личном кабинете.
              </div>
              <div className="border-t pt-4">
                <Label>Тестовая отправка</Label>
                <p className="text-xs text-muted-foreground mb-2">Отправить тестовое SMS на указанный номер (формат 7XXXXXXXXXX или 8XXXXXXXXXX)</p>
                <div className="flex gap-2">
                  <Input placeholder="79991234567" value={testPhone} onChange={e => setTestPhone(e.target.value)} />
                  <Button variant="outline" onClick={handleTest} disabled={testing || !testPhone.trim()}>
                    {testing && <Icon name="Loader2" size={14} className="animate-spin mr-1" />}
                    Тест
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Лог доставки SMS</DialogTitle>
          </DialogHeader>
          {logLoading ? (
            <div className="flex items-center justify-center py-8">
              <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {logEntries.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">Нет записей</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Получатель</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Ошибка</TableHead>
                      <TableHead>Время</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logEntries.map(e => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm">{e.user_name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant={e.status === "sent" ? "default" : "destructive"}>{e.status === "sent" ? "Отправлено" : "Ошибка"}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{e.error_text || "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(e.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSmsTab;