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
import api, { SavingApplication, Member, MemberDetail, Organization, StaffUser, toNum } from "@/lib/api";
import MemberSearch from "@/components/ui/member-search";
import DadataSuggest from "@/components/ui/dadata-suggest";
import MaskedInput from "@/components/ui/masked-input";
import dadata, { DadataAddressSuggestion, DadataFmsUnitSuggestion, DadataPartySuggestion } from "@/lib/dadata";
import { SavingApplicationDocButtons } from "./SavingApplicationPrintForm";

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
  const isFl = (form.borrower_type || "fl") === "fl";

  useEffect(() => {
    api.users.list().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      setForm(item ? { ...item } : { payout_type: "monthly", curator_user_id: user?.id ?? null, borrower_type: "fl" });
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

  const fillFromMember = async (id: string | null) => {
    const memberId = id ? Number(id) : null;
    set("member_id", memberId);
    if (!memberId) return;
    try {
      const m: MemberDetail = await api.members.get(memberId);
      setForm(f => ({
        ...f,
        member_id: memberId,
        last_name: m.last_name || f.last_name,
        first_name: m.first_name || f.first_name,
        middle_name: m.middle_name || f.middle_name,
        birth_date: m.birth_date || f.birth_date,
        birth_place: m.birth_place || f.birth_place,
        inn: m.inn || f.inn,
        passport_series: m.passport_series || f.passport_series,
        passport_number: m.passport_number || f.passport_number,
        passport_dept_code: m.passport_dept_code || f.passport_dept_code,
        passport_issue_date: m.passport_issue_date || f.passport_issue_date,
        passport_issued_by: m.passport_issued_by || f.passport_issued_by,
        registration_address: m.registration_address || f.registration_address,
        phone: m.phone || f.phone,
        email: m.email || f.email,
        telegram: m.telegram || f.telegram,
        bank_bik: m.bank_bik || f.bank_bik,
        bank_account: m.bank_account || f.bank_account,
        marital_status: m.marital_status || f.marital_status,
        spouse_fio: m.spouse_fio || f.spouse_fio,
        spouse_phone: m.spouse_phone || f.spouse_phone,
        extra_phone: m.extra_phone || f.extra_phone,
        extra_contact_fio: m.extra_contact_fio || f.extra_contact_fio,
      }));
      toast({ title: "Данные пайщика подставлены", description: "Недостающие поля заполните вручную" });
    } catch {
      toast({ title: "Не удалось загрузить данные пайщика", variant: "destructive" });
    }
  };

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
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>
              {isNew ? "Новая заявка на сбережение" : `Заявка ${item?.application_no || ""}`}
              {item?.status && !isNew && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  — {statusLabels[item.status] || item.status}
                </span>
              )}
            </DialogTitle>
            <div className="flex items-center gap-1 rounded-lg border p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => !readOnly && set("borrower_type", "fl")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${isFl ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                disabled={!!readOnly}
              >
                Физлицо
              </button>
              <button
                type="button"
                onClick={() => !readOnly && set("borrower_type", "ul")}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${!isFl ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                disabled={!!readOnly}
              >
                Юрлицо / ИП
              </button>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="deposit" className="flex flex-col flex-1 min-h-0">
          <TabsList className="flex-wrap h-auto justify-start rounded-none border-b bg-transparent px-6 py-1 gap-1 shrink-0">
            <TabsTrigger value="deposit" className="text-xs">Параметры вклада</TabsTrigger>
            <TabsTrigger value="depositor" className="text-xs">{isFl ? "Данные вкладчика" : "Организация / ИП"}</TabsTrigger>
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
                  onChange={fillFromMember}
                  placeholder="Поиск по ФИО, номеру, ИНН, телефону..."
                />
              ), "При выборе поля вкладчика заполнятся автоматически")}
            </TabsContent>

            {/* ── Физлицо ── */}
            {isFl && (
              <TabsContent value="depositor" className="grid grid-cols-2 gap-3 mt-0 pb-2">
                <div className="col-span-2 text-sm font-medium text-muted-foreground">ФИО</div>
                {field("Фамилия *", txt("last_name"))}
                {field("Имя *", txt("first_name"))}
                {field("Отчество", txt("middle_name"))}

                <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Основная информация</div>
                {field("Дата рождения", dateF("birth_date"))}
                {field("Место рождения", txt("birth_place"))}
                {field("ИНН *", (
                  <MaskedInput
                    mask="999999999999"
                    value={String(form.inn || "")}
                    onChange={v => set("inn", v as never)}
                    placeholder="12 цифр"
                    disabled={!!readOnly}
                  />
                ))}

                <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Паспортные данные</div>
                {field("Серия", (
                  <MaskedInput
                    mask="9999"
                    value={String(form.passport_series || "")}
                    onChange={v => set("passport_series", v as never)}
                    placeholder="0000"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Номер", (
                  <MaskedInput
                    mask="999999"
                    value={String(form.passport_number || "")}
                    onChange={v => set("passport_number", v as never)}
                    placeholder="000000"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Код подразделения", (
                  <MaskedInput
                    mask="999-999"
                    value={String(form.passport_dept_code || "")}
                    onChange={v => set("passport_dept_code", v as never)}
                    placeholder="___-___"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Дата выдачи", dateF("passport_issue_date"))}
                {field("Кем выдан", (
                  <DadataSuggest<DadataFmsUnitSuggestion>
                    value={form.passport_issued_by || ""}
                    onChange={v => set("passport_issued_by", v as never)}
                    onSelect={s => {
                      set("passport_issued_by", s.value as never);
                      if (s.data?.code) set("passport_dept_code", s.data.code as never);
                    }}
                    fetchSuggestions={dadata.suggestFmsUnit}
                    renderSuggestion={s => (
                      <div>
                        <div className="font-medium text-xs">{s.value}</div>
                        {s.data?.code && <div className="text-[11px] text-muted-foreground">{s.data.code}</div>}
                      </div>
                    )}
                    getSuggestionValue={s => s.value}
                    placeholder="Начните вводить название подразделения..."
                    disabled={!!readOnly}
                  />
                ))}

                <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Адрес и контакты</div>
                {field("Адрес регистрации", (
                  <DadataSuggest<DadataAddressSuggestion>
                    value={form.registration_address || ""}
                    onChange={v => set("registration_address", v as never)}
                    onSelect={item => set("registration_address", item.unrestricted_value as never)}
                    fetchSuggestions={dadata.suggestAddress}
                    renderSuggestion={s => s.value}
                    getSuggestionValue={s => s.unrestricted_value}
                    placeholder="Начните вводить адрес..."
                    disabled={!!readOnly}
                  />
                ))}
                {field("Телефон", (
                  <MaskedInput
                    mask="+9 (999) 999-99-99"
                    value={String(form.phone || "")}
                    onChange={v => set("phone", v as never)}
                    placeholder="+7 (___) ___-__-__"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Email", (
                  <Input
                    type="email"
                    value={form.email || ""}
                    onChange={e => set("email", e.target.value as never)}
                    placeholder="example@mail.ru"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Telegram", txt("telegram", "@username"))}

                <div className="col-span-2 text-sm font-medium text-muted-foreground border-t pt-3">Банковские реквизиты</div>
                {field("БИК", (
                  <MaskedInput
                    mask="999999999"
                    value={String(form.bank_bik || "")}
                    onChange={v => set("bank_bik", v as never)}
                    placeholder="9 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Расчётный счёт", (
                  <MaskedInput
                    mask="99999999999999999999"
                    value={String(form.bank_account || "")}
                    onChange={v => set("bank_account", v as never)}
                    placeholder="20 цифр"
                    disabled={!!readOnly}
                  />
                ))}

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
                {field("Телефон супруга(и)", (
                  <MaskedInput
                    mask="+9 (999) 999-99-99"
                    value={String(form.spouse_phone || "")}
                    onChange={v => set("spouse_phone", v as never)}
                    placeholder="+7 (___) ___-__-__"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Доп. телефон", (
                  <MaskedInput
                    mask="+9 (999) 999-99-99"
                    value={String(form.extra_phone || "")}
                    onChange={v => set("extra_phone", v as never)}
                    placeholder="+7 (___) ___-__-__"
                    disabled={!!readOnly}
                  />
                ))}
                {field("ФИО доп. контакта", txt("extra_contact_fio"))}
              </TabsContent>
            )}

            {/* ── Юрлицо / ИП ── */}
            {!isFl && (
              <TabsContent value="depositor" className="grid grid-cols-2 gap-3 mt-0 pb-2">
                {field("Наименование организации / ФИО ИП *", (
                  <DadataSuggest<DadataPartySuggestion>
                    value={form.last_name || ""}
                    onChange={v => set("last_name", v as never)}
                    onSelect={s => {
                      setForm(f => ({
                        ...f,
                        last_name: s.data?.name?.full_with_opf || s.value,
                        inn: s.data?.inn || f.inn,
                        registration_address: s.data?.address?.unrestricted_value || f.registration_address,
                      }));
                    }}
                    fetchSuggestions={dadata.suggestParty}
                    renderSuggestion={s => (
                      <div>
                        <div className="font-medium text-xs">{s.data?.name?.short_with_opf || s.value}</div>
                        <div className="text-[11px] text-muted-foreground">ИНН: {s.data?.inn} {s.data?.address?.value ? `• ${s.data.address.value}` : ""}</div>
                      </div>
                    )}
                    getSuggestionValue={s => s.data?.name?.full_with_opf || s.value}
                    placeholder="Введите название или ИНН..."
                    disabled={!!readOnly}
                  />
                ), "Начните вводить — данные подтянутся из реестра")}
                {field("ИНН *", (
                  <MaskedInput
                    mask="9999999999999"
                    value={String(form.inn || "")}
                    onChange={v => set("inn", v as never)}
                    placeholder="10 или 12 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Юридический / фактический адрес *", (
                  <DadataSuggest<DadataAddressSuggestion>
                    value={form.registration_address || ""}
                    onChange={v => set("registration_address", v as never)}
                    onSelect={item => set("registration_address", item.unrestricted_value as never)}
                    fetchSuggestions={dadata.suggestAddress}
                    renderSuggestion={s => s.value}
                    getSuggestionValue={s => s.unrestricted_value}
                    placeholder="Начните вводить адрес..."
                    disabled={!!readOnly}
                  />
                ))}
                {field("ФИО руководителя / ИП", txt("first_name", "Иванов Иван Иванович"))}
                {field("Телефон *", (
                  <MaskedInput
                    mask="+9 (999) 999-99-99"
                    value={String(form.phone || "")}
                    onChange={v => set("phone", v as never)}
                    placeholder="+7 (___) ___-__-__"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Email", (
                  <Input
                    type="email"
                    value={form.email || ""}
                    onChange={e => set("email", e.target.value as never)}
                    placeholder="example@mail.ru"
                    disabled={!!readOnly}
                  />
                ))}
                {field("БИК", (
                  <MaskedInput
                    mask="999999999"
                    value={String(form.bank_bik || "")}
                    onChange={v => set("bank_bik", v as never)}
                    placeholder="9 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Расчётный счёт", (
                  <MaskedInput
                    mask="99999999999999999999"
                    value={String(form.bank_account || "")}
                    onChange={v => set("bank_account", v as never)}
                    placeholder="20 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                <div className="col-span-2 border-t pt-3">
                  <p className="text-sm font-medium mb-2">Контактное лицо</p>
                  <div className="grid grid-cols-2 gap-3">
                    {field("ФИО контакта", txt("extra_contact_fio"))}
                    {field("Телефон контакта", (
                      <MaskedInput
                        mask="+9 (999) 999-99-99"
                        value={String(form.extra_phone || "")}
                        onChange={v => set("extra_phone", v as never)}
                        placeholder="+7 (___) ___-__-__"
                        disabled={!!readOnly}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>
            )}

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

              <div className="col-span-2 flex items-center gap-3 py-1">
                <input
                  type="checkbox"
                  id="is_agent_application_saving"
                  checked={!!form.is_agent_application}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(f => ({
                      ...f,
                      is_agent_application: checked,
                      agent_name: checked ? f.agent_name : "",
                      commission_amount: checked ? f.commission_amount : null,
                    }));
                  }}
                  disabled={!!readOnly}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="is_agent_application_saving" className="text-sm font-medium cursor-pointer">
                  Заявка от агента
                </label>
              </div>

              {!!form.is_agent_application && (
                <>
                  {field("Наименование агента", txt("agent_name", "ФИО или название организации"))}
                  <div className="space-y-1">
                    <Label className="text-xs">Вознаграждение агента, ₽ (1% от суммы, мин. 1 000, макс. 10 000)</Label>
                    <Input value={agentReward != null ? fmtNum(agentReward) : "—"} disabled className="bg-muted/40" />
                    <p className="text-[11px] text-muted-foreground">Рассчитывается автоматически</p>
                  </div>
                </>
              )}

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
          {!isNew && <SavingApplicationDocButtons item={form as SavingApplication} />}
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