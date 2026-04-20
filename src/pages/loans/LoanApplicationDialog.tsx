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
import api, { LoanApplication, Member, Organization, StaffUser, toNum } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: LoanApplication | null;
  members: Member[];
  orgs: Organization[];
  canEdit: boolean;
  onSaved: () => void;
};

const fmt = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);

const LoanApplicationDialog = ({ open, onOpenChange, item, members, orgs, canEdit, onSaved }: Props) => {
  const [form, setForm] = useState<Partial<LoanApplication>>({});
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();

  const isNew = !item;
  const readOnly = !canEdit || (item && (item.status === "approved" || item.status === "rejected" || item.status === "archived"));

  useEffect(() => {
    api.users.list().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      if (item) {
        setForm({ ...item });
      } else {
        setForm({ curator_user_id: user?.id ?? null });
      }
    }
  }, [open, item, user]);

  const set = <K extends keyof LoanApplication>(k: K, v: LoanApplication[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const numOrNull = (v: unknown) => (v === "" || v == null ? null : toNum(String(v)));

  const agentReward = (() => {
    const amt = Number(form.amount || 0);
    if (!amt) return null;
    return amt * 0.01;
  })();

  const curatorCommission = (() => {
    const comm = Number(form.commission_amount || 0);
    const agent = agentReward ?? 0;
    if (!comm) return null;
    return (comm - agent) / 2;
  })();

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<LoanApplication> = {
        ...form,
        member_id: form.member_id ? Number(form.member_id) : null,
        org_id: form.org_id ? Number(form.org_id) : null,
        amount: numOrNull(form.amount),
        term_months: form.term_months ? Number(form.term_months) : null,
        official_income: numOrNull(form.official_income),
        additional_income: numOrNull(form.additional_income),
        current_loans_payments: numOrNull(form.current_loans_payments),
        mandatory_expenses: numOrNull(form.mandatory_expenses),
        spouse_income: numOrNull(form.spouse_income),
        car_market_value: numOrNull(form.car_market_value),
        commission_amount: numOrNull(form.commission_amount),
        car_year: form.car_year ? Number(form.car_year) : null,
        children_count: form.children_count != null && form.children_count !== ("" as unknown) ? Number(form.children_count) : null,
        curator_user_id: form.curator_user_id ? Number(form.curator_user_id) : null,
      };
      if (isNew) {
        await api.loanApplications.create(payload);
        toast({ title: "Заявка создана" });
      } else {
        await api.loanApplications.update(item!.id, payload);
        toast({ title: "Заявка сохранена" });
      }
      onSaved();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, node: React.ReactNode, hint?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {node}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  const txt = (k: keyof LoanApplication, placeholder?: string) => (
    <Input value={(form[k] as string) || ""} onChange={e => set(k, e.target.value as never)} placeholder={placeholder} disabled={!!readOnly} />
  );
  const num = (k: keyof LoanApplication, placeholder?: string) => (
    <Input type="number" value={(form[k] as number | string | null | undefined) ?? ""} onChange={e => set(k, e.target.value as never)} placeholder={placeholder} disabled={!!readOnly} />
  );
  const dateF = (k: keyof LoanApplication) => (
    <Input type="date" value={(form[k] as string) || ""} onChange={e => set(k, e.target.value as never)} disabled={!!readOnly} />
  );
  const area = (k: keyof LoanApplication, placeholder?: string) => (
    <Textarea value={(form[k] as string) || ""} onChange={e => set(k, e.target.value as never)} placeholder={placeholder} disabled={!!readOnly} rows={2} />
  );

  const curatorName = users.find(u => u.id === form.curator_user_id)?.name || "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isNew ? "Новая заявка на займ" : `Заявка ${item?.application_no || ""}`}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="loan" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="loan">Параметры займа</TabsTrigger>
            <TabsTrigger value="borrower">Заёмщик</TabsTrigger>
            <TabsTrigger value="income">Доходы и расходы</TabsTrigger>
            <TabsTrigger value="family">Семья</TabsTrigger>
            <TabsTrigger value="collateral">Обеспечение</TabsTrigger>
            <TabsTrigger value="service">Служебное</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto pt-4 pr-1">
            <TabsContent value="loan" className="grid grid-cols-2 gap-3 mt-0">
              {field("Сумма займа, ₽ *", num("amount", "25 000 — 5 000 000"))}
              {field("Срок, мес. *", num("term_months", "3 — 360"), "Более 60 мес. — только ипотека")}
              {field("Вид кредитной программы", txt("loan_program"))}
              {field("Предполагаемое обеспечение", txt("collateral_types", "Напр.: Недвижимость, Авто"))}
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
                <Select value={form.member_id ? String(form.member_id) : "none"} onValueChange={v => set("member_id", v === "none" ? null : Number(v))} disabled={!!readOnly}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Новый заёмщик</SelectItem>
                    {members.slice(0, 500).map(m => <SelectItem key={m.id} value={String(m.id)}>{m.member_no} · {m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ), "Если не выбрано — пайщик создастся при одобрении")}
            </TabsContent>

            <TabsContent value="borrower" className="grid grid-cols-2 gap-3 mt-0">
              {field("ФИО *", txt("full_name"))}
              {field("Дата рождения *", dateF("birth_date"))}
              {field("Место рождения *", txt("birth_place", "Как в паспорте"))}
              {field("Паспорт (серия номер) *", txt("passport_series_number", "99 99 999999"))}
              {field("Дата выдачи паспорта *", dateF("passport_issue_date"))}
              {field("Кем выдан *", txt("passport_issued_by"))}
              {field("Код подразделения *", txt("passport_division_code", "999-999"))}
              {field("Адрес регистрации *", txt("registration_address"))}
              {field("Мобильный телефон *", txt("mobile_phone", "+7 ..."))}
              {field("Email", txt("email"))}
              {field("ИНН *", txt("inn"))}
              {field("Расчётный счёт *", txt("bank_account"))}
              {field("БИК *", txt("bik"))}
              {field("Наименование банка *", txt("bank_name"))}
              <div className="col-span-2 border-t pt-3 mt-2">
                <p className="text-sm font-medium mb-2">Дополнительный контакт</p>
                <div className="grid grid-cols-2 gap-3">
                  {field("ФИО контакта", txt("contact_full_name"))}
                  {field("Телефон контакта", txt("contact_phone"))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="income" className="grid grid-cols-2 gap-3 mt-0">
              <div className="col-span-2 text-sm font-medium">Доходы</div>
              {field("Официально подтверждённый доход *, ₽", num("official_income"))}
              {field("Вид подтверждения дохода", txt("income_confirmation", "2-НДФЛ, выписка и т.д."))}
              {field("ИНН работодателя *", txt("employer_inn"))}
              {field("Наименование работодателя", txt("employer_name"))}
              {field("Занимаемая должность *", txt("position"))}
              {field("Вид доп. дохода", txt("additional_income_type"))}
              {field("Сумма доп. дохода, ₽", num("additional_income"))}
              {field("Иной доп. доход (описание)", txt("additional_income_other"))}

              <div className="col-span-2 text-sm font-medium border-t pt-3 mt-2">Расходы</div>
              {field("Выплаты по текущим кредитам, ₽ *", num("current_loans_payments"))}
              {field("Обязательные расходы, ₽ *", num("mandatory_expenses"), "Коммуналка, авто и прочее")}
              {field("Есть действующие кредиты *", (
                <Select value={form.has_active_loans || ""} onValueChange={v => set("has_active_loans", v)} disabled={!!readOnly}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Да</SelectItem>
                    <SelectItem value="no">Нет</SelectItem>
                  </SelectContent>
                </Select>
              ))}
            </TabsContent>

            <TabsContent value="family" className="grid grid-cols-2 gap-3 mt-0">
              {field("Семейное положение *", (
                <Select value={form.marital_status || ""} onValueChange={v => set("marital_status", v)} disabled={!!readOnly}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Холост / Не замужем</SelectItem>
                    <SelectItem value="married">В браке</SelectItem>
                    <SelectItem value="divorced">В разводе</SelectItem>
                    <SelectItem value="widowed">Вдовец / Вдова</SelectItem>
                    <SelectItem value="civil">Гражданский брак</SelectItem>
                  </SelectContent>
                </Select>
              ))}
              {field("Дети до 18 лет *", (
                <Select value={form.has_minor_children || ""} onValueChange={v => set("has_minor_children", v)} disabled={!!readOnly}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Есть</SelectItem>
                    <SelectItem value="no">Нет</SelectItem>
                  </SelectContent>
                </Select>
              ))}
              {field("Количество детей до 18 лет", num("children_count"))}
              {field("ФИО супруга(и)", txt("spouse_name"))}
              {field("Телефон супруга(и)", txt("spouse_phone"))}
              {field("Доход супруга(и), ₽", num("spouse_income"))}
            </TabsContent>

            <TabsContent value="collateral" className="space-y-4 mt-0">
              <div>
                <p className="text-sm font-medium mb-2">Недвижимое имущество</p>
                <div className="grid grid-cols-2 gap-3">
                  {field("Вид недвижимости", txt("real_estate_type"))}
                  {field("Кадастровый номер", txt("cadastral_number", "99:99:9999999:99"))}
                  {field("Адрес залогового объекта", txt("property_address"))}
                  {field("Кадастровый номер земли", txt("land_cadastral_number"))}
                  {field("Адрес земельного участка", txt("land_address"))}
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Автомобиль</p>
                <div className="grid grid-cols-2 gap-3">
                  {field("Марка", txt("car_brand"))}
                  {field("Модель", txt("car_model"))}
                  {field("Год выпуска", num("car_year", "2008 — 2025"))}
                  {field("Рыночная стоимость, ₽", num("car_market_value"))}
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Иное обеспечение</p>
                {field("Описание обеспечения", area("other_collateral_description"))}
              </div>
            </TabsContent>

            <TabsContent value="service" className="grid grid-cols-2 gap-3 mt-0">
              {field("Статус заявки", (
                <Select value={form.status || "new"} onValueChange={v => set("status", v)} disabled={!!readOnly}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Новая</SelectItem>
                    <SelectItem value="in_review">На рассмотрении</SelectItem>
                    <SelectItem value="approved">Одобрена</SelectItem>
                    <SelectItem value="rejected">Отклонена</SelectItem>
                    <SelectItem value="archived">Архив</SelectItem>
                  </SelectContent>
                </Select>
              ))}

              {field("Куратор заявки", isAdmin ? (
                <Select value={form.curator_user_id ? String(form.curator_user_id) : "none"} onValueChange={v => set("curator_user_id", v === "none" ? null : Number(v))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {users.filter(u => u.role === "admin" || u.role === "manager").map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={curatorName} disabled />
              ), "По умолчанию — создавший заявку. Изменить может только администратор")}

              {field("Наименование агента", txt("agent_name", "ФИО или название организации"))}

              {field("Сумма комиссии, ₽", num("commission_amount"))}

              <div className="space-y-1">
                <Label className="text-xs">Вознаграждение агента, ₽ (1% от суммы займа)</Label>
                <Input value={agentReward != null ? fmt(agentReward) : "—"} disabled className="bg-muted/40" />
                <p className="text-[11px] text-muted-foreground">Рассчитывается автоматически</p>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Комиссия куратора, ₽</Label>
                <Input value={curatorCommission != null ? fmt(curatorCommission) : "—"} disabled className="bg-muted/40" />
                <p className="text-[11px] text-muted-foreground">(Комиссия − Вознаграждение агента) / 2</p>
              </div>

              <div className="col-span-2">
                {field("Комментарий кредитного специалиста *", area("specialist_comment", "Впечатление от общения, факторы риска/положительные"))}
              </div>

              {item?.rejection_reason && (
                <div className="col-span-2 p-3 bg-red-50 rounded text-sm">
                  <strong>Причина отклонения:</strong> {item.rejection_reason}
                </div>
              )}
              {item?.created_loan_id && (
                <div className="col-span-2 p-3 bg-green-50 rounded text-sm">
                  Заявка одобрена — создан договор займа #{item.created_loan_id}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="border-t pt-3">
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

export default LoanApplicationDialog;