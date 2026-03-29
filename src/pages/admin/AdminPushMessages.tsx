import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, { PushStats, PushSubscriber, PushMessage, PushSettings } from "@/lib/api";
import PushSendTab from "./push/PushSendTab";
import PushHistoryTab, { fmtDate } from "./push/PushHistoryTab";
import PushSettingsTab from "./push/PushSettingsTab";
import PushTemplatesTab from "./push/PushTemplatesTab";

const AdminPushMessages = () => {
  const [stats, setStats] = useState<PushStats | null>(null);
  const [subscribers, setSubscribers] = useState<PushSubscriber[]>([]);
  const [messages, setMessages] = useState<PushMessage[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", url: "", target: "all" });
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
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
      setForm({ title: "", body: "", url: "", target: "all" });
      setSelectedUsers([]);
      loadData();
    } catch (e) {
      toast({ title: "Ошибка отправки", description: String(e), variant: "destructive" });
    }
    setSending(false);
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
            <TabsTrigger value="templates">Шаблоны</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="send" className="mt-4">
          <PushSendTab
            form={form}
            setForm={setForm}
            stats={stats}
            subscribers={subscribers}
            selectedUsers={selectedUsers}
            toggleUser={toggleUser}
            sending={sending}
            handleSend={handleSend}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <PushHistoryTab messages={messages} subscribers={subscribers} />
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
          <PushSettingsTab
            settings={settings}
            setSettings={setSettings}
            savingSettings={savingSettings}
            handleSaveSettings={handleSaveSettings}
          />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <PushTemplatesTab
            settings={settings}
            setSettings={setSettings}
            savingSettings={savingSettings}
            handleSaveSettings={handleSaveSettings}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPushMessages;
