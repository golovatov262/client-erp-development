import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, AgentItem, AgentLead, AgentReward } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import Icon from "@/components/ui/icon";

const BONUS_TABLE = [
  { min: 1, max: 4, base: 5000, bonus: 0 },
  { min: 5, max: 9, base: 5000, bonus: 5000 },
  { min: 10, max: 19, base: 5000, bonus: 10000 },
  { min: 20, max: 999, base: 5000, bonus: 20000 },
];

function calcBonus(count: number) {
  const tier = BONUS_TABLE.find(t => count >= t.min && count <= t.max);
  if (!tier) return 0;
  return tier.bonus;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    new: { label: "Новая", variant: "secondary" },
    processing: { label: "В работе", variant: "outline" },
    member: { label: "Пайщик", variant: "default" },
    rejected: { label: "Отказ", variant: "destructive" },
  };
  const s = map[status] || { label: status, variant: "outline" };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

function AgentForm({ agent, onClose }: { agent?: AgentItem; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: agent?.name || "",
    phone: agent?.phone || "",
    email: agent?.email || "",
    login: agent?.login || "",
    password: "",
  });

  const mut = useMutation({
    mutationFn: () =>
      agent
        ? api.agents.update({ id: agent.id, ...form })
        : api.agents.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      toast({ title: agent ? "Агент обновлён" : "Агент создан" });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium mb-1 block">ФИО *</label>
        <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Иванов Иван Иванович" />
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
        <label className="text-sm font-medium mb-1 block">Логин *</label>
        <Input value={form.login} onChange={e => setForm(p => ({ ...p, login: e.target.value }))} placeholder="agent_login" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Пароль {agent ? "(оставьте пустым чтобы не менять)" : "*"}</label>
        <Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Минимум 8 символов" />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>Отмена</Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Сохраняем..." : agent ? "Сохранить" : "Создать"}
        </Button>
      </div>
    </div>
  );
}

function ProcessLeadDialog({ lead, onClose }: { lead: AgentLead; onClose: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState("processing");
  const [memberId, setMemberId] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: () => api.members.list(),
  });

  const mut = useMutation({
    mutationFn: () =>
      api.agentLeads.process({
        id: lead.id,
        status,
        member_id: status === "member" && memberId ? Number(memberId) : undefined,
        reject_reason: rejectReason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-leads"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      toast({ title: "Статус заявки обновлён" });
      onClose();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
        <div><span className="font-medium">Организация:</span> {lead.org_name}</div>
        <div><span className="font-medium">ИНН:</span> {lead.inn}</div>
        {lead.contact_name && <div><span className="font-medium">Контакт:</span> {lead.contact_name}</div>}
        {lead.phone && <div><span className="font-medium">Телефон:</span> {lead.phone}</div>}
        {lead.email && <div><span className="font-medium">Email:</span> {lead.email}</div>}
        {lead.comment && <div><span className="font-medium">Комментарий:</span> {lead.comment}</div>}
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">Новый статус</label>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="processing">В работе</SelectItem>
            <SelectItem value="member">Пайщик</SelectItem>
            <SelectItem value="rejected">Отказ</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {status === "member" && (
        <div>
          <label className="text-sm font-medium mb-1 block">Пайщик *</label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите пайщика" />
            </SelectTrigger>
            <SelectContent>
              {members?.map(m => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.member_no} — {m.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Агенту будет начислено вознаграждение автоматически</p>
        </div>
      )}
      {status === "rejected" && (
        <div>
          <label className="text-sm font-medium mb-1 block">Причина отказа</label>
          <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Укажите причину" />
        </div>
      )}
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>Отмена</Button>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Сохраняем..." : "Применить"}
        </Button>
      </div>
    </div>
  );
}

function AgentDetailModal({ agent, onClose }: { agent: AgentItem; onClose: () => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });

  const { data: leads } = useQuery({
    queryKey: ["agent-leads", agent.id],
    queryFn: () => api.agentLeads.list(agent.id),
  });

  const { data: report } = useQuery({
    queryKey: ["agent-month-report", agent.id, month],
    queryFn: () => api.agentRewards.monthReport(agent.id, month),
  });

  const [processLead, setProcessLead] = useState<AgentLead | null>(null);

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{agent.name}</DialogTitle>
      </DialogHeader>
      <div className="flex gap-4 text-sm mb-4">
        {agent.phone && <span className="flex items-center gap-1"><Icon name="Phone" size={14} /> {agent.phone}</span>}
        {agent.email && <span className="flex items-center gap-1"><Icon name="Mail" size={14} /> {agent.email}</span>}
        <span className="flex items-center gap-1"><Icon name="Users" size={14} /> Пайщиков: {agent.members_count}</span>
        <span className="flex items-center gap-1"><Icon name="Wallet" size={14} /> Выплачено: {fmt(agent.total_paid)}</span>
      </div>

      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Заявки</TabsTrigger>
          <TabsTrigger value="report">Отчёт</TabsTrigger>
        </TabsList>

        <TabsContent value="leads" className="mt-4">
          {!leads?.length ? (
            <p className="text-muted-foreground text-sm">Заявок нет</p>
          ) : (
            <div className="space-y-2">
              {leads.map(lead => (
                <div key={lead.id} className="border rounded-lg p-3 flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{lead.org_name}</div>
                    <div className="text-xs text-muted-foreground">ИНН: {lead.inn} {lead.contact_name && `· ${lead.contact_name}`}</div>
                    <div className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString("ru-RU")}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {statusBadge(lead.status)}
                    {lead.status !== "member" && lead.status !== "rejected" && (
                      <Button size="sm" variant="outline" onClick={() => setProcessLead(lead)}>
                        Обработать
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {processLead && (
            <Dialog open onOpenChange={() => setProcessLead(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Обработка заявки</DialogTitle>
                </DialogHeader>
                <ProcessLeadDialog lead={processLead} onClose={() => setProcessLead(null)} />
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        <TabsContent value="report" className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm font-medium whitespace-nowrap">Месяц:</label>
            <Input type="month" className="w-48"
              value={month.slice(0, 7)}
              onChange={e => setMonth(e.target.value + "-01")}
            />
          </div>
          {!report ? (
            <p className="text-muted-foreground text-sm">Нет данных</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{report.members_count}</div>
                  <div className="text-xs text-muted-foreground">Пайщиков за месяц</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{fmt(report.total)}</div>
                  <div className="text-xs text-muted-foreground">Вознаграждение</div>
                </div>
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold">{fmt(report.total_bonus)}</div>
                  <div className="text-xs text-muted-foreground">Бонус</div>
                </div>
              </div>
              {report.rows.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2">Организация</th>
                      <th className="text-right py-2">Базовая</th>
                      <th className="text-right py-2">Бонус</th>
                      <th className="text-right py-2">Итого</th>
                      <th className="text-center py-2">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map(r => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2">{r.lead_org_name || "—"}</td>
                        <td className="py-2 text-right">{fmt(r.base_amount)}</td>
                        <td className="py-2 text-right">{fmt(r.bonus_amount)}</td>
                        <td className="py-2 text-right font-medium">{fmt(r.total_amount)}</td>
                        <td className="py-2 text-center">
                          <Badge variant={r.status === "paid" ? "default" : "secondary"}>
                            {r.status === "paid" ? "Выплачено" : "Ожидает"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

export default function Agents() {
  const [showForm, setShowForm] = useState(false);
  const [editAgent, setEditAgent] = useState<AgentItem | null>(null);
  const [detailAgent, setDetailAgent] = useState<AgentItem | null>(null);
  const [leadsFilter, setLeadsFilter] = useState("all");
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: () => api.agents.list(),
  });

  const { data: allLeads } = useQuery({
    queryKey: ["agent-leads"],
    queryFn: () => api.agentLeads.list(),
  });

  const { data: rewards } = useQuery({
    queryKey: ["agent-rewards"],
    queryFn: () => api.agentRewards.list(),
  });

  const blockMut = useMutation({
    mutationFn: (id: number) => api.agents.block(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      toast({ title: "Агент заблокирован" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const markPaidMut = useMutation({
    mutationFn: (id: number) => api.agentRewards.markPaid(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-rewards"] });
      toast({ title: "Отмечено как выплачено" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const filteredLeads = allLeads?.filter(l => leadsFilter === "all" || l.status === leadsFilter);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Агенты</h1>
          <p className="text-muted-foreground text-sm mt-1">Агентские продажи членства в КПК</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Icon name="Plus" size={16} className="mr-2" />
          Добавить агента
        </Button>
      </div>

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">Агенты ({agents?.length || 0})</TabsTrigger>
          <TabsTrigger value="leads">Заявки ({allLeads?.length || 0})</TabsTrigger>
          <TabsTrigger value="rewards">Вознаграждения</TabsTrigger>
          <TabsTrigger value="scheme">Схема выплат</TabsTrigger>
        </TabsList>

        <TabsContent value="agents" className="mt-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : !agents?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="Users" size={48} className="mx-auto mb-3 opacity-30" />
              <p>Агентов пока нет</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {agents.map(agent => (
                <div key={agent.id} className="border rounded-lg p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agent.name}</span>
                      <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                        {agent.status === "active" ? "Активен" : "Заблокирован"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1 flex gap-4">
                      {agent.phone && <span>{agent.phone}</span>}
                      {agent.email && <span>{agent.email}</span>}
                      <span>Логин: {agent.login}</span>
                    </div>
                    <div className="text-sm mt-1 flex gap-4">
                      <span className="text-green-600 font-medium">Пайщиков: {agent.members_count}</span>
                      <span className="text-muted-foreground">Выплачено: {fmt(agent.total_paid)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setDetailAgent(agent)}>
                      <Icon name="Eye" size={14} className="mr-1" />
                      Детали
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditAgent(agent)}>
                      <Icon name="Pencil" size={14} />
                    </Button>
                    {agent.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => blockMut.mutate(agent.id)}>
                        <Icon name="Ban" size={14} />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="leads" className="mt-4">
          <div className="flex gap-2 mb-4">
            {["all", "new", "processing", "member", "rejected"].map(s => (
              <Button key={s} size="sm" variant={leadsFilter === s ? "default" : "outline"}
                onClick={() => setLeadsFilter(s)}>
                {s === "all" ? "Все" : s === "new" ? "Новые" : s === "processing" ? "В работе" : s === "member" ? "Пайщики" : "Отказы"}
              </Button>
            ))}
          </div>
          {!filteredLeads?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="FileText" size={48} className="mx-auto mb-3 opacity-30" />
              <p>Заявок нет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLeads.map(lead => (
                <div key={lead.id} className="border rounded-lg p-3 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{lead.org_name}</span>
                      {statusBadge(lead.status)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      ИНН: {lead.inn} · Агент: {lead.agent_name}
                      {lead.contact_name && ` · ${lead.contact_name}`}
                    </div>
                    {lead.phone && <div className="text-sm text-muted-foreground">{lead.phone} {lead.email && `· ${lead.email}`}</div>}
                    <div className="text-xs text-muted-foreground">{new Date(lead.created_at).toLocaleDateString("ru-RU")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rewards" className="mt-4">
          {!rewards?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="Wallet" size={48} className="mx-auto mb-3 opacity-30" />
              <p>Вознаграждений нет</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2">Агент</th>
                  <th className="text-left py-2">Организация</th>
                  <th className="text-left py-2">Месяц</th>
                  <th className="text-right py-2">Базовая</th>
                  <th className="text-right py-2">Бонус</th>
                  <th className="text-right py-2">Итого</th>
                  <th className="text-center py-2">Статус</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rewards.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.agent_name}</td>
                    <td className="py-2 text-muted-foreground">{r.lead_org_name || "—"}</td>
                    <td className="py-2">{r.reward_month?.slice(0, 7)}</td>
                    <td className="py-2 text-right">{fmt(r.base_amount)}</td>
                    <td className="py-2 text-right">{fmt(r.bonus_amount)}</td>
                    <td className="py-2 text-right font-medium">{fmt(r.total_amount)}</td>
                    <td className="py-2 text-center">
                      <Badge variant={r.status === "paid" ? "default" : "secondary"}>
                        {r.status === "paid" ? "Выплачено" : "Ожидает"}
                      </Badge>
                    </td>
                    <td className="py-2">
                      {r.status !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => markPaidMut.mutate(r.id)}>
                          Выплатить
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TabsContent>

        <TabsContent value="scheme" className="mt-4">
          <div className="max-w-lg space-y-4">
            <h3 className="font-semibold text-lg">Схема вознаграждений агентов</h3>
            <p className="text-sm text-muted-foreground">
              За каждого нового пайщика агент получает базовое вознаграждение. При достижении
              плановых показателей начисляется дополнительный бонус.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">Пайщиков в месяц</th>
                    <th className="text-right p-3">За 1 пайщика</th>
                    <th className="text-right p-3">Бонус</th>
                    <th className="text-right p-3">Доход</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 3, 5, 10, 20].map(count => {
                    const bonus = calcBonus(count);
                    const base = count * 5000;
                    return (
                      <tr key={count} className="border-t">
                        <td className="p-3 font-medium">{count} {count === 1 ? "пайщик" : count < 5 ? "пайщика" : "пайщиков"}</td>
                        <td className="p-3 text-right">5 000 ₽</td>
                        <td className="p-3 text-right text-orange-600">{bonus > 0 ? `+ ${fmt(bonus)}` : "—"}</td>
                        <td className="p-3 text-right font-bold text-green-600">{fmt(base + bonus)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Бонус за объём начисляется единовременно при достижении порога 5, 10 и 20 пайщиков в месяц.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showForm || !!editAgent} onOpenChange={open => { if (!open) { setShowForm(false); setEditAgent(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editAgent ? "Редактировать агента" : "Новый агент"}</DialogTitle>
          </DialogHeader>
          <AgentForm agent={editAgent || undefined} onClose={() => { setShowForm(false); setEditAgent(null); }} />
        </DialogContent>
      </Dialog>

      {detailAgent && (
        <Dialog open onOpenChange={() => setDetailAgent(null)}>
          <AgentDetailModal agent={detailAgent} onClose={() => setDetailAgent(null)} />
        </Dialog>
      )}
    </div>
  );
}
