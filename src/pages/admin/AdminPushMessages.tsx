import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import api, { PushStats, PushSubscriber, PushMessage, PushMessageLogEntry, PushSettings } from "@/lib/api";

const fmtDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  draft: { label: "Черновик", variant: "secondary" },
  sending: { label: "Отправляется", variant: "secondary" },
  sent: { label: "Отправлено", variant: "default" },
  error: { label: "Ошибка", variant: "destructive" },
};

const AdminPushMessages = () => {
  const [stats, setStats] = useState<PushStats | null>(null);
  const [subscribers, setSubscribers] = useState<PushSubscriber[]>([]);
  const [messages, setMessages] = useState<PushMessage[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSend, setShowSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", url: "", target: "all" });
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<PushMessageLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("send");
  const [settings, setSettings] = useState<PushSettings>({ enabled: "true", reminder_days: "3,1,0", overdue_notify: "true", remind_time: "09:00", savings_enabled: "true", savings_reminder_days: "30,15,7", savings_remind_time: "09:00" });
  const [savingSettings, setSavingSettings] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, sub, m, st] = await Promise.all([
        api.push.stats(),
        api.push.subscribers(),
        api.push.messages(50, 0),
        api.push.getSettings(),
      ]);
      setStats(s);
      setSubscribers(sub);
      setMessages(m.items);
      setMessagesTotal(m.total);
      if (st && st.enabled !== undefined) setSettings(st);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSend = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: "Заполните заголовок и текст", variant: "destructive" });
      return;
    }
    if (form.target === "selected" && selectedUsers.length === 0) {
      toast({ title: "Выберите получателей", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await api.push.send({
        title: form.title.trim(),
        body: form.body.trim(),
        url: form.url.trim(),
        target: form.target,
        target_user_ids: form.target === "selected" ? selectedUsers : undefined,
      });
      toast({ title: `Отправлено: ${res.sent}, ошибок: ${res.failed}` });
      setShowSend(false);
      setForm({ title: "", body: "", url: "", target: "all" });
      setSelectedUsers([]);
      loadData();
    } catch (e) {
      toast({ title: "Ошибка отправки", description: String(e), variant: "destructive" });
    }
    setSending(false);
  };

  const openLog = async (msgId: number) => {
    setLogLoading(true);
    setShowLog(true);
    try {
      const entries = await api.push.messageLog(msgId);
      setLogEntries(entries);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setLogLoading(false);
  };

  const toggleUser = (userId: number) => {
    setSelectedUsers(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.push.saveSettings(settings);
      toast({ title: "Настройки сохранены" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setSavingSettings(false);
  };

  const reminderDays = settings.reminder_days.split(",").map(d => d.trim()).filter(Boolean);
  const toggleDay = (day: string) => {
    const current = new Set(reminderDays);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    const sorted = Array.from(current).map(Number).sort((a, b) => b - a).map(String);
    setSettings({ ...settings, reminder_days: sorted.join(",") });
  };

  const savingsReminderDays = (settings.savings_reminder_days || "30,15,7").split(",").map(d => d.trim()).filter(Boolean);
  const toggleSavingsDay = (day: string) => {
    const current = new Set(savingsReminderDays);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    const sorted = Array.from(current).map(Number).sort((a, b) => b - a).map(String);
    setSettings({ ...settings, savings_reminder_days: sorted.join(",") });
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
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <Icon name="Users" size={20} className="text-blue-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.unique_users || 0}</div>
              <div className="text-xs text-muted-foreground">Подписчиков</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <Icon name="Smartphone" size={20} className="text-green-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.total_subscriptions || 0}</div>
              <div className="text-xs text-muted-foreground">Устройств</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Icon name="Send" size={20} className="text-purple-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.total_messages || 0}</div>
              <div className="text-xs text-muted-foreground">Рассылок</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="send">Отправить</TabsTrigger>
            <TabsTrigger value="history">История ({messagesTotal})</TabsTrigger>
            <TabsTrigger value="subscribers">Подписчики ({subscribers.length})</TabsTrigger>
            <TabsTrigger value="settings">Настройки</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="send" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="Send" size={18} />
                Новая рассылка
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Заголовок</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Напр: Важное уведомление" maxLength={100} />
              </div>
              <div>
                <Label>Текст сообщения</Label>
                <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Текст push-уведомления..." rows={3} maxLength={500} />
              </div>
              <div>
                <Label>Ссылка (необязательно)</Label>
                <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
                <p className="text-xs text-muted-foreground mt-1">Откроется при нажатии на уведомление</p>
              </div>
              <div>
                <Label>Получатели</Label>
                <Select value={form.target} onValueChange={v => setForm({ ...form, target: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все подписчики ({stats?.unique_users || 0})</SelectItem>
                    <SelectItem value="selected">Выбранные</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.target === "selected" && (
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  {subscribers.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">Нет подписчиков</div>
                  ) : subscribers.map(s => (
                    <label key={s.user_id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0">
                      <Checkbox checked={selectedUsers.includes(s.user_id)} onCheckedChange={() => toggleUser(s.user_id)} />
                      <span className="text-sm">{s.name}</span>
                      {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">{s.devices} устр.</span>
                    </label>
                  ))}
                </div>
              )}

              <Button onClick={handleSend} disabled={sending || !form.title || !form.body} className="w-full sm:w-auto">
                {sending ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Send" size={16} className="mr-2" />}
                Отправить
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {messages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Рассылок пока нет</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Заголовок</TableHead>
                      <TableHead className="hidden sm:table-cell">Текст</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Доставлено</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.map(m => {
                      const st = statusMap[m.status] || { label: m.status, variant: "secondary" as const };
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.sent_at || m.created_at)}</TableCell>
                          <TableCell className="font-medium text-sm max-w-[150px] truncate">{m.title}</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[200px] truncate">{m.body}</TableCell>
                          <TableCell><Badge variant={st.variant} className="text-xs">{st.label}</Badge></TableCell>
                          <TableCell className="text-right text-sm">
                            <span className="text-green-600">{m.sent_count}</span>
                            {m.failed_count > 0 && <span className="text-red-500 ml-1">/ {m.failed_count}</span>}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openLog(m.id)} title="Детали">
                              <Icon name="Eye" size={14} />
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
                <div className="p-8 text-center text-muted-foreground text-sm">Пока нет подписчиков</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Клиент</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead className="hidden sm:table-cell">Email</TableHead>
                      <TableHead className="text-right">Устройств</TableHead>
                      <TableHead className="hidden sm:table-cell">Подписка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.map(s => (
                      <TableRow key={s.user_id}>
                        <TableCell className="font-medium text-sm">{s.name}</TableCell>
                        <TableCell className="text-sm">{s.phone || "—"}</TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{s.email || "—"}</TableCell>
                        <TableCell className="text-right">{s.devices}</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{fmtDate(s.last_sub)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="Settings" size={18} />
                Автоматические напоминания о платежах
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Автоматические push-напоминания</div>
                  <div className="text-xs text-muted-foreground">Клиенты получают уведомления о предстоящих и просроченных платежах</div>
                </div>
                <Switch checked={settings.enabled === "true"} onCheckedChange={v => setSettings({ ...settings, enabled: v ? "true" : "false" })} />
              </div>

              {settings.enabled === "true" && (
                <>
                  <div className="space-y-2">
                    <Label>За сколько дней напоминать</Label>
                    <div className="flex flex-wrap gap-2">
                      {["7", "5", "3", "2", "1", "0"].map(day => (
                        <Button key={day} variant={reminderDays.includes(day) ? "default" : "outline"} size="sm" onClick={() => toggleDay(day)} className="min-w-[80px]">
                          {day === "0" ? "В день платежа" : `За ${day} дн.`}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Выбрано: {reminderDays.length === 0 ? "ничего" : reminderDays.map(d => d === "0" ? "в день платежа" : `за ${d} дн.`).join(", ")}</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Уведомлять о просрочке</div>
                      <div className="text-xs text-muted-foreground">Отправлять push при наступлении просрочки платежа</div>
                    </div>
                    <Switch checked={settings.overdue_notify === "true"} onCheckedChange={v => setSettings({ ...settings, overdue_notify: v ? "true" : "false" })} />
                  </div>

                  <div className="space-y-2">
                    <Label>Время отправки</Label>
                    <Input type="time" value={settings.remind_time} onChange={e => setSettings({ ...settings, remind_time: e.target.value })} className="w-32" />
                    <p className="text-xs text-muted-foreground">Время по Москве, в которое будут отправляться автоматические напоминания</p>
                  </div>
                </>
              )}

              <Button onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Save" size={16} className="mr-2" />}
                Сохранить настройки
              </Button>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="PiggyBank" size={18} />
                Напоминания об окончании договоров сбережений
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Автоматические push-напоминания</div>
                  <div className="text-xs text-muted-foreground">Клиенты получают уведомления о приближающемся окончании договора сбережений</div>
                </div>
                <Switch checked={settings.savings_enabled === "true"} onCheckedChange={v => setSettings({ ...settings, savings_enabled: v ? "true" : "false" })} />
              </div>

              {settings.savings_enabled === "true" && (
                <>
                  <div className="space-y-2">
                    <Label>За сколько дней напоминать</Label>
                    <div className="flex flex-wrap gap-2">
                      {["30", "25", "15", "7", "3", "1", "0"].map(day => (
                        <Button key={day} variant={savingsReminderDays.includes(day) ? "default" : "outline"} size="sm" onClick={() => toggleSavingsDay(day)} className="min-w-[80px]">
                          {day === "0" ? "В день окончания" : `За ${day} дн.`}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Выбрано: {savingsReminderDays.length === 0 ? "ничего" : savingsReminderDays.map(d => d === "0" ? "в день окончания" : `за ${d} дн.`).join(", ")}</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Время отправки</Label>
                    <Input type="time" value={settings.savings_remind_time || "09:00"} onChange={e => setSettings({ ...settings, savings_remind_time: e.target.value })} className="w-32" />
                    <p className="text-xs text-muted-foreground">Время по Москве, в которое будут отправляться напоминания о сбережениях</p>
                  </div>
                </>
              )}

              <Button onClick={handleSaveSettings} disabled={savingSettings}>
                {savingSettings ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Save" size={16} className="mr-2" />}
                Сохранить настройки
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showLog} onOpenChange={setShowLog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Детали рассылки</DialogTitle></DialogHeader>
          {logLoading ? (
            <div className="flex justify-center py-6"><Icon name="Loader2" size={24} className="animate-spin" /></div>
          ) : logEntries.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Нет записей</div>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-2">
              {logEntries.map(e => (
                <div key={e.id} className="flex items-center justify-between border rounded-md px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{e.user_name || `ID ${e.user_id}`}</div>
                    {e.error_text && <div className="text-xs text-red-500 mt-0.5">{e.error_text}</div>}
                  </div>
                  <Badge variant={e.status === "sent" ? "default" : "destructive"} className="text-xs">
                    {e.status === "sent" ? "Доставлено" : "Ошибка"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLog(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPushMessages;