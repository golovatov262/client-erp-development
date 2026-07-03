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
import { Switch } from "@/components/ui/switch";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, {
  NotificationChannel,
  NotificationHistoryItem,
  NotificationLogEntry,
  NotificationStats,
  humanizeError,
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

const AdminEmailTab = () => {
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<NotificationChannel | null>(null);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [messages, setMessages] = useState<NotificationHistoryItem[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [activeTab, setActiveTab] = useState("send");
  const [form, setForm] = useState({ title: "", body: "", target: "all" });
  const [sending, setSending] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<NotificationLogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [smtp, setSmtp] = useState({ from_name: "", from_email: "", smtp_host: "", smtp_port: "587", smtp_user: "", smtp_pass: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [channels, st, hist] = await Promise.all([
        api.notifications.channels(),
        api.notifications.stats(),
        api.notifications.history("email", 50, 0),
      ]);
      const emailChannel = channels.find(c => c.channel === "email");
      setChannel(emailChannel || null);
      if (emailChannel) {
        const s = emailChannel.settings || {};
        setSmtp({
          from_name: (s.from_name as string) || "",
          from_email: (s.from_email as string) || "",
          smtp_host: (s.smtp_host as string) || "",
          smtp_port: String(s.smtp_port || 587),
          smtp_user: (s.smtp_user as string) || "",
          smtp_pass: (s.smtp_pass as string) || "",
        });
      }
      setStats(st);
      setMessages(hist.items);
      setMessagesTotal(hist.total);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: humanizeError(e), variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSend = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: "Заполните заголовок и текст", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await api.notifications.sendEmail({
        title: form.title.trim(),
        body: form.body.trim(),
        target: form.target,
      });
      toast({ title: `Отправлено: ${res.sent}, ошибок: ${res.failed}` });
      setForm({ title: "", body: "", target: "all" });
      loadData();
    } catch (e) {
      toast({ title: "Ошибка отправки", description: humanizeError(e), variant: "destructive" });
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
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    }
    setLogLoading(false);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.notifications.saveChannel("email", channel?.enabled, {
        from_name: smtp.from_name,
        from_email: smtp.from_email,
        smtp_host: smtp.smtp_host,
        smtp_port: Number(smtp.smtp_port),
        smtp_user: smtp.smtp_user,
        smtp_pass: smtp.smtp_pass,
      });
      toast({ title: "Настройки сохранены" });
      loadData();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    }
    setSavingSettings(false);
  };

  const toggleEnabled = async () => {
    try {
      await api.notifications.saveChannel("email", !channel?.enabled);
      loadData();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    }
  };

  const handleTest = async () => {
    if (!testEmail.trim()) {
      toast({ title: "Введите email", variant: "destructive" });
      return;
    }
    setTesting(true);
    try {
      await api.notifications.testEmail(testEmail.trim());
      toast({ title: "Тестовое письмо отправлено" });
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    }
    setTesting(false);
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
              <div className="text-2xl font-bold">{stats?.email_users || 0}</div>
              <div className="text-xs text-muted-foreground">Пользователей с email</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
              <Icon name="Mail" size={20} className="text-purple-500" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.email_messages || 0}</div>
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
          <TabsTrigger value="settings">Настройки</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="Mail" size={18} />
                Новая Email рассылка
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Заголовок (тема письма)</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Тема письма" maxLength={200} />
              </div>
              <div>
                <Label>Текст сообщения</Label>
                <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Текст email..." rows={6} />
              </div>
              <div>
                <Label>Получатели</Label>
                <Select value={form.target} onValueChange={v => setForm({ ...form, target: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все пользователи с email ({stats?.email_users || 0})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSend} disabled={sending || !form.title.trim() || !form.body.trim()}>
                {sending ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Mail" size={16} className="mr-2" />}
                Отправить
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardContent className="p-0">
              {messages.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Нет отправленных писем</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Тема</TableHead>
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
                          <TableCell className="text-sm max-w-[150px] truncate">{m.title}</TableCell>
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

        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Icon name="Settings" size={18} />
                  Настройки SMTP
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-normal text-muted-foreground">{channel?.enabled ? "Вкл" : "Выкл"}</span>
                  <Switch checked={channel?.enabled || false} onCheckedChange={toggleEnabled} />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Имя отправителя</Label>
                  <Input value={smtp.from_name} onChange={e => setSmtp({ ...smtp, from_name: e.target.value })} placeholder="Кооператив" />
                </div>
                <div>
                  <Label>Email отправителя</Label>
                  <Input value={smtp.from_email} onChange={e => setSmtp({ ...smtp, from_email: e.target.value })} placeholder="noreply@example.com" />
                </div>
                <div>
                  <Label>SMTP сервер</Label>
                  <Input value={smtp.smtp_host} onChange={e => setSmtp({ ...smtp, smtp_host: e.target.value })} placeholder="smtp.yandex.ru" />
                </div>
                <div>
                  <Label>Порт</Label>
                  <Input value={smtp.smtp_port} onChange={e => setSmtp({ ...smtp, smtp_port: e.target.value })} placeholder="587" />
                </div>
                <div>
                  <Label>Логин SMTP</Label>
                  <Input value={smtp.smtp_user} onChange={e => setSmtp({ ...smtp, smtp_user: e.target.value })} placeholder="user@example.com" />
                </div>
                <div>
                  <Label>Пароль SMTP</Label>
                  <Input type="password" value={smtp.smtp_pass} onChange={e => setSmtp({ ...smtp, smtp_pass: e.target.value })} placeholder="••••••••" />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveSettings} disabled={savingSettings}>
                  {savingSettings && <Icon name="Loader2" size={16} className="animate-spin mr-2" />}
                  Сохранить
                </Button>
              </div>
              <div className="border-t pt-4 mt-4">
                <Label>Тест отправки</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com" className="max-w-[250px]" />
                  <Button variant="outline" onClick={handleTest} disabled={testing}>
                    {testing ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Mail" size={16} className="mr-2" />}
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
          <DialogHeader><DialogTitle>Детали доставки</DialogTitle></DialogHeader>
          {logLoading ? (
            <div className="flex justify-center py-6"><Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Пользователь</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Ошибка</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logEntries.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{e.user_name || `ID ${e.user_id}`}</TableCell>
                      <TableCell>
                        <Badge variant={e.status === "sent" ? "default" : "destructive"}>
                          {e.status === "sent" ? "Доставлено" : "Ошибка"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{e.error_text || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {logEntries.length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Нет записей</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
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

export default AdminEmailTab;