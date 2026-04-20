import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import api, { SavingApplication, Member, Organization, StaffUser, toNum } from "@/lib/api";
import MemberSearch from "@/components/ui/member-search";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: SavingApplication | null;
  members: Member[];
  orgs: Organization[];
  canEdit: boolean;
  onSaved: () => void;
  onSavingCreated: () => void;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const fmtNum = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);

const SavingApplicationDialog = ({ open, onOpenChange, item, members, orgs, canEdit, onSaved, onSavingCreated }: Props) => {
  const [form, setForm] = useState<Partial<SavingApplication>>({});
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();

  const isNew = !item;
  const isClosed = item?.status === "concluded" || item?.status === "annulled";
  const readOnly = !canEdit || isClosed;

  useEffect(() => {
    api.users.list().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setForm(item ? { ...item } : { payout_type: "monthly", curator_user_id: user?.id ?? null });
    }
  }, [open, item, user]);

  const set = <K extends keyof SavingApplication>(k: K, v: SavingApplication[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const numOrNull = (v: unknown) => (v === "" || v == null ? null : toNum(String(v)));

  const agentReward = (() => {
    const amt = Number(form.amount || 0);
    if (!amt) return null;
    return clamp(amt * 0.01, 1000, 10000);
  })();

  const curatorReward = (() => {
    if (!form.is_curator_personal) return null;
    const amt = Number(form.amount || 0);
    if (!amt) return null;
    return clamp(amt * 0.01, 1000, 10000);
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<SavingApplication> = {
        ...form,
        member_id: form.member_id ? Number(form.member_id) : null,
        org_id: form.org_id ? Number(form.org_id) : null,
        amount: numOrNull(form.amount),
        term_months: form.term_months ? Number(form.term_months) : null,
        rate: numOrNull(form.rate),
        commission_amount: numOrNull(form.commission_amount),
        curator_user_id: form.curator_user_id ? Number(form.curator_user_id) : null,
        is_curator_personal: !!form.is_curator_personal,
      };
      if (isNew) {
        await api.savingApplications.create(payload);
        toast({ title: "Заявка создана" });
      } else {
        await api.savingApplications.update(item!.id, payload);
        toast({ title: "Заявка сохранена" });
      }
      onSaved();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!item) return;
    if (newStatus === "concluded") {
      if (!confirm(`Заключить договор сбережений по заявке ${item.application_no}?`)) return;
      setSaving(true);
      try {
        const res = await api.savingApplications.conclude(item.id);
        toast({ title: "Договор заключён", description: `Создан договор сбережений ${res.contract_no}` });
        onSavingCreated();
        onSaved();
      } catch (e) {
        toast({ title: "Ошибка", description: String(e), variant: "destructive" });
      } finally {
        setSaving(false);
      }
    } else if (newStatus === "annulled") {
      const reason = prompt("Причина аннулирования:");
      if (reason === null) return;
      setSaving(true);
      try {
        await api.savingApplications.annul(item.id, reason);
        toast({ title: "Заявка аннулирована" });
        onSaved();
      } catch (e) {
        toast({ title: "Ошибка", description: String(e), variant: "destructive" });
      } finally {
        setSaving(false);
      }
    } else {
      set("status", newStatus);
    }
  };

  const staffUsers = users.filter(u => u.role === "admin" || u.role === "manager");
  const curatorName = users.find(u => u.id === form.curator_user_id)?.name || "—";

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {node}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
  const txt = (k: keyof SavingApplication, placeholder?: string) => (
    <Input value={(form[k] as string) || ""} onChange={e => set(k, e.target.value as never)} placeholder={placeholder} disabled={!!readOnly} />
  );
  const num = (k: keyof SavingApplication, placeholder?: string) => (
    <Input type="number" value={(form[k] as number | string | null | undefined) ?? ""} onChange={e => set(k, e.target.value as never)} placeholder={placeholder} disabled={!!readOnly} />
  );
  const dateF = (k: keyof SavingApplication) => (
    <Input type="date" value={(form[k] as string) || ""} onChange={e => set(k, e.target.value as never)} disabled={!!readOnly} />
  );
  const area = (k: keyof SavingApplication, placeholder?: string) => (
    <Textarea value={(form[k] as string) || ""} onChange={e => set(k, e.target.value as never)} placeholder={placeholder} disabled={!!readOnly} rows={2} />
  );

  const statusLabels: Record<string, string> = {
    new: "Новая", in_review: "На рассмотрении", concluded: "Договор заключён", annulled: "Аннулирована",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle>
            {isNew ? "Новая заявка на сбережение" : `Заявка ${item?.application_no || ""}`}
            {item?.status && !isNew && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {statusLabels[item.status] || item.status}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="deposit" className="flex flex-col flex-1 min-h-0">
          <TabsList className="flex-wrap h-auto justify-start rounded-none border-b bg-transparent px-6 py-1 gap-1 shrink-0">
            <TabsTrigger value="deposit" className="text-xs">Параметры вклада</TabsTrigger>
            <TabsTrigger value="depositor" className="text-xs">Данные вкладчика</TabsTrigger>
            <TabsTrigger value="service" className="text-xs">Служебное</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">

            {/* ── Параметры вклада ── */}
            <TabsContent value="deposit" className="grid grid-cols-2 gap-4 mt-0 pb-2">
              {field("Сумма вклада, ₽ *", num("amount", "Введите сумму"))}
              {field("Срок, мес. *", num("term_months", "Напр.: 12"))}
              {field("Процентная ставка, % годовых *", num("rate", "Напр.: 10"))}
              {field("Вариант выплаты процентов *", (
                <Select value={form.payout_type || "monthly"} onValueChange={v => set("payout_type", v)} disabled={!!readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Ежемесячно</SelectItem>
                    <SelectItem value="end_of_term">В конце срока</SelectItem>
                  </SelectContent>
                </Select>
              ))}
              {field("Организация", (
                <Select value={form.org_id ? String(form.org_id) : "none"} onValueChange={v => set("org_id", v === "none" ? null : Number(v))} disabled={!!readOnly}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {orgs.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.short_name || o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ))}
              {field("Привязать к пайщику (если уже есть)", (
                <MemberSearch
                  members={members}
                  value={form.member_id ? String(form.member_id) : ""}
                  onChange={(id) => set("member_id", id ? Number(id) : null)}
                  placeholder="Поиск по ФИО, номеру, ИНН, телефону..."
                />
              ), "Если не выбрано — пайщик создастся автоматически при заключении договора")}
            </TabsContent>

            {/* ── Данные вкладчика ── */}
            <TabsContent value="depositor" className="grid grid-cols-2 gap-3 mt-0 pb-2">
              <div className="col-span-2 text-sm font-medium text-muted-foreground">ФИО</div>
              {field("Фамилия *", txt("last_name"))}
              {field("Имя *", txt("first_name"))}
              {field("Отчество", txt("middle_name"))}

              <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Основная информация</div>
              {field("Дата рождения", dateF("birth_date"))}
              {field("Место рождения", txt("birth_place"))}
              {field("ИНН *", txt("inn"))}

              <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Паспортные данные</div>
              {field("Серия", txt("passport_series", "0000"))}
              {field("Номер", txt("passport_number", "000000"))}
              {field("Код подразделения", txt("passport_dept_code", "000-000"))}
              {field("Дата выдачи", dateF("passport_issue_date"))}
              {field("Кем выдан", txt("passport_issued_by"))}

              <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Адрес и контакты</div>
              {field("Адрес регистрации", txt("registration_address"))}
              {field("Телефон", txt("phone", "+7 ..."))}
              {field("Email", txt("email"))}
              {field("Telegram", txt("telegram", "@username"))}

              <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Банковские реквизиты</div>
              {field("БИК", txt("bank_bik"))}
              {field("Расчётный счёт", txt("bank_account"))}

              <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Дополнительно</div>
              {field("Семейное положение", (
                <Select value={form.marital_status || ""} onValueChange={v => set("marital_status", v)} disabled={!!readOnly}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Холост / Не замужем</SelectItem>
                    <SelectItem value="married">В браке</SelectItem>
                    <SelectItem value="divorced">В разводе</SelectItem>
                    <SelectItem value="widowed">Вдовец / Вдова</SelectItem>
                  </SelectContent>
                </Select>
              ))}
              {field("ФИО супруга(и)", txt("spouse_fio"))}
              {field("Телефон супруга(и)", txt("spouse_phone"))}
              {field("Доп. телефон", txt("extra_phone"))}
              {field("ФИО доп. контакта", txt("extra_contact_fio"))}
            </TabsContent>

            {/* ── Служебное ── */}
            <TabsContent value="service" className="grid grid-cols-2 gap-4 mt-0 pb-2">
              {field("Статус заявки", (
                <Select
                  value={form.status || "new"}
                  onValueChange={v => {
                    if (!isNew && (v === "concluded" || v === "annulled")) {
                      handleStatusChange(v);
                    } else {
                      set("status", v);
                    }
                  }}
                  disabled={!!readOnly}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Новая</SelectItem>
                    <SelectItem value="in_review">На рассмотрении</SelectItem>
                    {!isNew && <SelectItem value="concluded">Договор заключён</SelectItem>}
                    {!isNew && <SelectItem value="annulled">Аннулирована</SelectItem>}
                  </SelectContent>
                </Select>
              ), isNew ? "Для заключения договора сначала сохраните заявку" : undefined)}

              {field("Куратор заявки", isAdmin ? (
                <Select value={form.curator_user_id ? String(form.curator_user_id) : "none"} onValueChange={v => set("curator_user_id", v === "none" ? null : Number(v))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {staffUsers.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={curatorName} disabled />
              ), "По умолчанию — создавший заявку. Изменить может только администратор")}

              {field("Наименование агента", txt("agent_name", "ФИО или название организации"))}

              <div className="space-y-1">
                <Label className="text-xs">Вознаграждение агента, ₽ (1% от суммы, мин. 1 000, макс. 10 000)</Label>
                <Input value={agentReward != null ? fmtNum(agentReward) : "—"} disabled className="bg-muted/40" />
                <p className="text-[11px] text-muted-foreground">Рассчитывается автоматически</p>
              </div>

              <div className="col-span-2 flex items-center gap-3 py-1">
                <input
                  type="checkbox"
                  id="curator_personal"
                  checked={!!form.is_curator_personal}
                  onChange={e => set("is_curator_personal", e.target.checked as never)}
                  disabled={!!readOnly}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="curator_personal" className="text-sm cursor-pointer">
                  Личная заявка куратора
                </label>
              </div>

              {form.is_curator_personal && (
                <div className="space-y-1">
                  <Label className="text-xs">Вознаграждение куратора, ₽ (1% от суммы, мин. 1 000, макс. 10 000)</Label>
                  <Input value={curatorReward != null ? fmtNum(curatorReward) : "—"} disabled className="bg-muted/40" />
                  <p className="text-[11px] text-muted-foreground">Рассчитывается автоматически</p>
                </div>
              )}

              <div className="col-span-2">
                {field("Комментарий специалиста", area("specialist_comment"))}
              </div>

              {item?.rejection_reason && (
                <div className="col-span-2 p-3 bg-red-50 rounded text-sm">
                  <strong>Причина аннулирования:</strong> {item.rejection_reason}
                </div>
              )}
              {item?.created_saving_id && (
                <div className="col-span-2 p-3 bg-green-50 rounded text-sm">
                  Договор сбережений #{item.created_saving_id} заключён успешно.
                </div>
              )}
            </TabsContent>

          </div>
        </Tabs>

        <DialogFooter className="border-t px-6 py-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
          {canEdit && !readOnly && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Сохраняем..." : (isNew ? "Создать заявку" : "Сохранить")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SavingApplicationDialog;