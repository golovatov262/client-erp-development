import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

function fmt(n: number | undefined | null) {
  return (Number(n) || 0).toLocaleString("ru-RU") + " ₽";
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; color: string }> = {
    new: { label: "Новая", color: "bg-blue-100 text-blue-700" },
    processing: { label: "В работе", color: "bg-yellow-100 text-yellow-700" },
    member: { label: "Пайщик", color: "bg-green-100 text-green-700" },
    rejected: { label: "Отказ", color: "bg-red-100 text-red-700" },
  };
  const s = map[status] || { label: status, color: "bg-gray-100 text-gray-700" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>;
}

const MONTHS_RU = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

function formatMonth(iso: string) {
  const d = new Date(iso + "-02");
  return `${MONTHS_RU[d.getMonth()]} ${d.getFullYear()}`;
}

function LeadForm({ token, onClose }: { token: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ org_name: "", inn: "", phone: "", email: "", contact_name: "", comment: "" });

  const mut = useMutation({
    mutationFn: () => api.agentCabinet.createLead(token, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ac-leads"] });
      toast({ title: "Заявка отправлена" });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium mb-1 block">Наименование ЮЛ / ФИО ИП *</label>
        <Input value={form.org_name} onChange={e => setForm(p => ({ ...p, org_name: e.target.value }))} placeholder="ООО «Пример» или Иванов Иван Иванович" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">ИНН *</label>
        <Input value={form.inn} onChange={e => setForm(p => ({ ...p, inn: e.target.value }))} placeholder="1234567890" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">ФИО контактного лица</label>
        <Input value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="Петров Пётр Петрович" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Телефон</label>
        <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+7..." />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Email</label>
        <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Комментарий</label>
        <Input value={form.comment} onChange={e => setForm(p => ({ ...p, comment: e.target.value }))} placeholder="Дополнительная информация" />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>Отмена</Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending || !form.org_name || !form.inn}>
          {mut.isPending ? "Отправляем..." : "Отправить заявку"}
        </Button>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: (token: string, name: string) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ login: "", password: "" });

  const mut = useMutation({
    mutationFn: () => api.agentCabinet.login(form.login, form.password),
    onSuccess: (data) => {
      onLogin(data.token, data.agent.name);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <div className="bg-background border rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Icon name="Handshake" size={28} className="text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold">Кабинет агента</h1>
          <p className="text-sm text-muted-foreground mt-1">Агентские продажи КПК</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Логин</label>
            <Input value={form.login} onChange={e => setForm(p => ({ ...p, login: e.target.value }))}
              placeholder="Ваш логин" onKeyDown={e => e.key === "Enter" && mut.mutate()} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Пароль</label>
            <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="Пароль" onKeyDown={e => e.key === "Enter" && mut.mutate()} />
          </div>
        </div>
        <Button className="w-full" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Входим..." : "Войти"}
        </Button>
      </div>
    </div>
  );
}

function AgentDashboard({ token, agentName, onLogout }: { token: string; agentName: string; onLogout: () => void }) {
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadsTab, setLeadsTab] = useState("all");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["ac-stats", token],
    queryFn: () => api.agentCabinet.stats(token),
    retry: false,
  });

  const { data: leads, isLoading: leadsLoading } = useQuery({
    queryKey: ["ac-leads", token],
    queryFn: () => api.agentCabinet.leads(token),
    retry: false,
  });

  const reportMut = useMutation({
    mutationFn: () => api.agentCabinet.monthReport(token, month),
  });

  const filteredLeads = leads?.filter(l => leadsTab === "all" || l.status === leadsTab);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Icon name="Handshake" size={16} className="text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">Кабинет агента</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block">{agentName}</span>
            <Button size="sm" variant="ghost" onClick={onLogout}>
              <Icon name="LogOut" size={16} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {statsLoading ? (
          <div className="flex justify-center py-4">
            <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-background border rounded-xl p-4">
              <div className="text-2xl font-bold">{stats.total_leads}</div>
              <div className="text-xs text-muted-foreground mt-1">Всего заявок</div>
            </div>
            <div className="bg-background border rounded-xl p-4">
              <div className="text-2xl font-bold text-green-600">{stats.members}</div>
              <div className="text-xs text-muted-foreground mt-1">Стали пайщиками</div>
            </div>
            <div className="bg-background border rounded-xl p-4">
              <div className="text-2xl font-bold">{fmt(stats.total_earned)}</div>
              <div className="text-xs text-muted-foreground mt-1">Заработано всего</div>
            </div>
            <div className="bg-background border rounded-xl p-4">
              <div className="text-2xl font-bold text-orange-600">{fmt(stats.pending_amount)}</div>
              <div className="text-xs text-muted-foreground mt-1">К выплате</div>
            </div>
          </div>
        ) : null}

        <Tabs defaultValue="leads">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <TabsList>
              <TabsTrigger value="leads">Мои заявки</TabsTrigger>
              <TabsTrigger value="report">Отчёт</TabsTrigger>
              <TabsTrigger value="scheme">Как заработать</TabsTrigger>
            </TabsList>
            <Button size="sm" onClick={() => setShowLeadForm(true)}>
              <Icon name="Plus" size={14} className="mr-1" />
              Новая заявка
            </Button>
          </div>

          <TabsContent value="leads" className="mt-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {(["all", "new", "processing", "member", "rejected"] as const).map(s => (
                <button key={s}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${leadsTab === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  onClick={() => setLeadsTab(s)}>
                  {s === "all" ? "Все" : s === "new" ? "Новые" : s === "processing" ? "В работе" : s === "member" ? "Пайщики" : "Отказы"}
                  {s !== "all" && leads && (
                    <span className="ml-1 opacity-60">{leads.filter(l => l.status === s).length}</span>
                  )}
                </button>
              ))}
            </div>

            {leadsLoading ? (
              <div className="flex justify-center py-8">
                <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : !filteredLeads?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <Icon name="FileText" size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Заявок нет</p>
                <Button className="mt-3" size="sm" onClick={() => setShowLeadForm(true)}>
                  Добавить первую заявку
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredLeads.map(lead => (
                  <div key={lead.id} className="bg-background border rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{lead.org_name}</span>
                          {statusBadge(lead.status)}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">ИНН: {lead.inn}</div>
                        {lead.contact_name && <div className="text-sm text-muted-foreground">{lead.contact_name}</div>}
                        {lead.phone && <div className="text-sm text-muted-foreground">{lead.phone}</div>}
                        {lead.reject_reason && (
                          <div className="text-sm text-red-600 mt-1">Причина: {lead.reject_reason}</div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(lead.created_at).toLocaleDateString("ru-RU")}
                        </div>
                      </div>
                      {lead.status === "member" && (
                        <div className="flex-shrink-0 text-green-600 font-bold text-sm">+5 000 ₽</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="report" className="mt-4 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm font-medium">Месяц:</label>
              <Input type="month" className="w-44"
                value={month.slice(0, 7)}
                onChange={e => setMonth(e.target.value + "-01")}
              />
              <Button size="sm" onClick={() => reportMut.mutate()} disabled={reportMut.isPending}>
                {reportMut.isPending ? <Icon name="Loader2" size={14} className="animate-spin mr-1" /> : null}
                Показать
              </Button>
            </div>

            {reportMut.isPending ? (
              <div className="flex justify-center py-8">
                <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : !reportMut.data || !reportMut.data.rows?.length ? (
              <div className="text-center py-12 text-muted-foreground">
                <Icon name="BarChart3" size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Нажмите «Показать» для загрузки отчёта</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-background border rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{reportMut.data.members_count}</div>
                    <div className="text-xs text-muted-foreground mt-1">Пайщиков за {formatMonth(month)}</div>
                  </div>
                  <div className="bg-background border rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{fmt(reportMut.data.total)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Вознаграждение</div>
                  </div>
                  <div className="bg-background border rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold text-orange-600">{fmt(reportMut.data.total_bonus)}</div>
                    <div className="text-xs text-muted-foreground mt-1">Бонус за объём</div>
                  </div>
                </div>
                <div className="bg-background border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3">Организация</th>
                        <th className="text-right p-3">Сумма</th>
                        <th className="text-center p-3">Выплата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportMut.data.rows.map(r => (
                        <tr key={r.id} className="border-t">
                          <td className="p-3">{r.lead_org_name || "—"}</td>
                          <td className="p-3 text-right font-medium">{fmt(r.total_amount)}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${r.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                              {r.status === "paid" ? "Выплачено" : "Ожидает"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="scheme" className="mt-4">
            <div className="bg-background border rounded-xl overflow-hidden max-w-lg">
              <div className="p-4 bg-primary text-primary-foreground">
                <h3 className="font-bold text-lg">Схема вознаграждений</h3>
                <p className="text-sm opacity-80 mt-1">Привлекайте больше — зарабатывайте больше</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted">
                    <th className="text-left p-3">Пайщиков в месяц</th>
                    <th className="text-right p-3">За 1 пайщика</th>
                    <th className="text-right p-3">Ваш доход</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { count: 1, income: 5000, bonus: 0 },
                    { count: 3, income: 15000, bonus: 0 },
                    { count: 5, income: 25000, bonus: 5000 },
                    { count: 10, income: 50000, bonus: 10000 },
                    { count: 20, income: 100000, bonus: 20000 },
                  ].map(row => (
                    <tr key={row.count} className="border-t">
                      <td className="p-3 font-medium">{row.count} {row.count === 1 ? "пайщик" : row.count < 5 ? "пайщика" : "пайщиков"}</td>
                      <td className="p-3 text-right">5 000 ₽</td>
                      <td className="p-3 text-right">
                        <span className="font-bold text-green-600">{fmt(row.income)}</span>
                        {row.bonus > 0 && (
                          <div className="text-xs text-orange-600">+ {fmt(row.bonus)} бонус = {fmt(row.income + row.bonus)}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={showLeadForm} onOpenChange={setShowLeadForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Новая заявка</DialogTitle>
          </DialogHeader>
          <LeadForm token={token} onClose={() => setShowLeadForm(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AgentCabinet() {
  const [token, setToken] = useState(() => localStorage.getItem("agent_token") || "");
  const [agentName, setAgentName] = useState(() => localStorage.getItem("agent_name") || "");

  function handleLogin(t: string, name: string) {
    setToken(t);
    setAgentName(name);
    localStorage.setItem("agent_token", t);
    localStorage.setItem("agent_name", name);
  }

  function handleLogout() {
    setToken("");
    setAgentName("");
    localStorage.removeItem("agent_token");
    localStorage.removeItem("agent_name");
  }

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <AgentDashboard token={token} agentName={agentName} onLogout={handleLogout} />;
}