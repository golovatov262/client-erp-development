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
import api, { LoanApplication, Member, MemberDetail, Organization, StaffUser, toNum } from "@/lib/api";
import MemberSearch from "@/components/ui/member-search";
import DadataSuggest from "@/components/ui/dadata-suggest";
import MaskedInput from "@/components/ui/masked-input";
import dadata, { DadataAddressSuggestion, DadataFmsUnitSuggestion, DadataPartySuggestion } from "@/lib/dadata";
import { LoanApplicationDocButtons } from "./LoanApplicationPrintForm";
import LoanApplicationApproveDialog from "./LoanApplicationApproveDialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: LoanApplication | null;
  members: Member[];
  orgs: Organization[];
  canEdit: boolean;
  onSaved: () => void;
  onLoanCreated?: () => void;
};

const fmt = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);

const LoanApplicationDialog = ({ open, onOpenChange, item, members, orgs, canEdit, onSaved, onLoanCreated }: Props) => {
  const [form, setForm] = useState<Partial<LoanApplication>>({});
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();

  const isNew = !item;
  const readOnly = !canEdit;
  const isFl = (form.borrower_type || "fl") === "fl";

  useEffect(() => {
    api.users.list().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    if (open) {
      if (item) {
        setForm({ ...item });
      } else {
        setForm({ curator_user_id: user?.id ?? null, borrower_type: "fl" });
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

  const masked = (k: keyof LoanApplication, mask: string, placeholder?: string) => (
    <MaskedInput
      mask={mask}
      value={String(form[k] || "")}
      onChange={v => set(k, v as never)}
      placeholder={placeholder}
      disabled={!!readOnly}
    />
  );

  const curatorName = users.find(u => u.id === form.curator_user_id)?.name || "—";

  const handleReject = async () => {
    const reason = prompt("Причина отклонения:");
    if (reason === null) return;
    setRejecting(true);
    try {
      await api.loanApplications.reject(item!.id, reason);
      toast({ title: "Заявка отклонена" });
      onSaved();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setRejecting(false);
    }
  };

  const fillFromMember = async (id: string | null) => {
    const memberId = id ? Number(id) : null;
    set("member_id", memberId);
    if (!memberId) return;
    try {
      const m: MemberDetail = await api.members.get(memberId);
      const fio = [m.last_name, m.first_name, m.middle_name].filter(Boolean).join(" ");
      const passportSN = [m.passport_series, m.passport_number].filter(Boolean).join(" ");
      setForm(f => ({
        ...f,
        member_id: memberId,
        full_name: fio || f.full_name,
        birth_date: m.birth_date || f.birth_date,
        birth_place: m.birth_place || f.birth_place,
        passport_series_number: passportSN || f.passport_series_number,
        passport_issue_date: m.passport_issue_date || f.passport_issue_date,
        passport_issued_by: m.passport_issued_by || f.passport_issued_by,
        passport_division_code: m.passport_dept_code || f.passport_division_code,
        registration_address: m.registration_address || f.registration_address,
        mobile_phone: m.phone || f.mobile_phone,
        email: m.email || f.email,
        inn: m.inn || f.inn,
        bank_account: m.bank_account || f.bank_account,
        bik: m.bank_bik || f.bik,
        marital_status: m.marital_status || f.marital_status,
        spouse_name: m.spouse_fio || f.spouse_name,
        spouse_phone: m.spouse_phone || f.spouse_phone,
        contact_full_name: m.extra_contact_fio || f.contact_full_name,
        contact_phone: m.extra_phone || f.contact_phone,
      }));
      toast({ title: "Данные пайщика подставлены", description: "Недостающие поля заполните вручную" });
    } catch {
      toast({ title: "Не удалось загрузить данные пайщика", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>
              {isNew ? "Новая заявка на займ" : `Заявка ${item?.application_no || ""}`}
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

        <Tabs defaultValue="loan" className="flex flex-col flex-1 min-h-0">
          <TabsList className="flex-wrap h-auto justify-start rounded-none border-b bg-transparent px-6 py-1 gap-1 shrink-0">
            <TabsTrigger value="loan" className="text-xs">Параметры займа</TabsTrigger>
            <TabsTrigger value="borrower" className="text-xs">{isFl ? "Заёмщик" : "Организация / ИП"}</TabsTrigger>
            {isFl && <TabsTrigger value="income" className="text-xs">Доходы и расходы</TabsTrigger>}
            {isFl && <TabsTrigger value="family" className="text-xs">Семья</TabsTrigger>}
            <TabsTrigger value="collateral" className="text-xs">Обеспечение</TabsTrigger>
            <TabsTrigger value="service" className="text-xs">Служебное</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">

            {/* ── Параметры займа ── */}
            <TabsContent value="loan" className="grid grid-cols-2 gap-3 mt-0 pb-2">
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
                <MemberSearch
                  members={members}
                  value={form.member_id ? String(form.member_id) : ""}
                  onChange={fillFromMember}
                  placeholder="Поиск по ФИО, номеру, ИНН, телефону..."
                />
              ), "При выборе поля заёмщика заполнятся автоматически")}
            </TabsContent>

            {/* ── Заёмщик ФЛ ── */}
            {isFl && (
              <TabsContent value="borrower" className="grid grid-cols-2 gap-3 mt-0 pb-2">
                {field("ФИО *", txt("full_name"))}
                {field("Дата рождения *", dateF("birth_date"))}
                {field("Место рождения *", txt("birth_place", "Как в паспорте"))}
                {field("Паспорт (серия и номер) *", (
                  <MaskedInput
                    mask="99 99 999999"
                    value={String(form.passport_series_number || "")}
                    onChange={v => set("passport_series_number", v as never)}
                    placeholder="__ __ ______"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Дата выдачи паспорта *", dateF("passport_issue_date"))}
                {field("Кем выдан *", (
                  <DadataSuggest<DadataFmsUnitSuggestion>
                    value={form.passport_issued_by || ""}
                    onChange={v => set("passport_issued_by", v as never)}
                    onSelect={item => {
                      set("passport_issued_by", item.value as never);
                      if (item.data?.code) set("passport_division_code", item.data.code as never);
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
                {field("Код подразделения *", (
                  <MaskedInput
                    mask="999-999"
                    value={String(form.passport_division_code || "")}
                    onChange={v => set("passport_division_code", v as never)}
                    placeholder="___-___"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Адрес регистрации *", (
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
                {field("Мобильный телефон *", (
                  <MaskedInput
                    mask="+9 (999) 999-99-99"
                    value={String(form.mobile_phone || "")}
                    onChange={v => set("mobile_phone", v as never)}
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
                {field("ИНН *", (
                  <MaskedInput
                    mask="999999999999"
                    value={String(form.inn || "")}
                    onChange={v => set("inn", v as never)}
                    placeholder="12 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Расчётный счёт *", (
                  <MaskedInput
                    mask="99999999999999999999"
                    value={String(form.bank_account || "")}
                    onChange={v => set("bank_account", v as never)}
                    placeholder="20 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                {field("БИК *", (
                  <MaskedInput
                    mask="999999999"
                    value={String(form.bik || "")}
                    onChange={v => set("bik", v as never)}
                    placeholder="9 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Наименование банка *", txt("bank_name"))}
                <div className="col-span-2 border-t pt-3 mt-2">
                  <p className="text-sm font-medium mb-2">Дополнительный контакт</p>
                  <div className="grid grid-cols-2 gap-3">
                    {field("ФИО контакта", txt("contact_full_name"))}
                    {field("Телефон контакта", (
                      <MaskedInput
                        mask="+9 (999) 999-99-99"
                        value={String(form.contact_phone || "")}
                        onChange={v => set("contact_phone", v as never)}
                        placeholder="+7 (___) ___-__-__"
                        disabled={!!readOnly}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* ── Заёмщик ЮЛ/ИП ── */}
            {!isFl && (
              <TabsContent value="borrower" className="grid grid-cols-2 gap-3 mt-0 pb-2">
                {field("Наименование организации / ФИО ИП *", (
                  <DadataSuggest<DadataPartySuggestion>
                    value={form.full_name || ""}
                    onChange={v => set("full_name", v as never)}
                    onSelect={s => {
                      setForm(f => ({
                        ...f,
                        full_name: s.data?.name?.full_with_opf || s.value,
                        inn: s.data?.inn || f.inn,
                        employer_inn: s.data?.inn || f.employer_inn,
                        employer_name: s.data?.name?.short_with_opf || f.employer_name,
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
                {field("ФИО руководителя / ИП", txt("employer_name", "Иванов Иван Иванович"))}
                {field("Телефон *", (
                  <MaskedInput
                    mask="+9 (999) 999-99-99"
                    value={String(form.mobile_phone || "")}
                    onChange={v => set("mobile_phone", v as never)}
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
                {field("Расчётный счёт *", (
                  <MaskedInput
                    mask="99999999999999999999"
                    value={String(form.bank_account || "")}
                    onChange={v => set("bank_account", v as never)}
                    placeholder="20 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                {field("БИК *", (
                  <MaskedInput
                    mask="999999999"
                    value={String(form.bik || "")}
                    onChange={v => set("bik", v as never)}
                    placeholder="9 цифр"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Наименование банка", txt("bank_name"))}
                <div className="col-span-2 border-t pt-3 mt-2">
                  <p className="text-sm font-medium mb-2">Контактное лицо</p>
                  <div className="grid grid-cols-2 gap-3">
                    {field("ФИО контакта", txt("contact_full_name"))}
                    {field("Телефон контакта", (
                      <MaskedInput
                        mask="+9 (999) 999-99-99"
                        value={String(form.contact_phone || "")}
                        onChange={v => set("contact_phone", v as never)}
                        placeholder="+7 (___) ___-__-__"
                        disabled={!!readOnly}
                      />
                    ))}
                  </div>
                </div>
              </TabsContent>
            )}

            {/* ── Доходы и расходы (только ФЛ) ── */}
            {isFl && (
              <TabsContent value="income" className="grid grid-cols-2 gap-3 mt-0 pb-2">
                <div className="col-span-2 text-sm font-medium">Доходы</div>
                {field("Официально подтверждённый доход *, ₽", num("official_income"))}
                {field("Вид подтверждения дохода", txt("income_confirmation", "2-НДФЛ, выписка и т.д."))}
                {field("ИНН работодателя *", (
                  <DadataSuggest<DadataPartySuggestion>
                    value={form.employer_inn || ""}
                    onChange={v => set("employer_inn", v as never)}
                    onSelect={s => {
                      set("employer_inn", (s.data?.inn || "") as never);
                      set("employer_name", (s.data?.name?.short_with_opf || s.value) as never);
                    }}
                    fetchSuggestions={dadata.suggestParty}
                    renderSuggestion={s => (
                      <div>
                        <div className="font-medium text-xs">{s.data?.name?.short_with_opf || s.value}</div>
                        <div className="text-[11px] text-muted-foreground">ИНН: {s.data?.inn}</div>
                      </div>
                    )}
                    getSuggestionValue={s => s.data?.inn || ""}
                    placeholder="Введите ИНН или название работодателя..."
                    disabled={!!readOnly}
                  />
                ))}
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
            )}

            {/* ── Семья (только ФЛ) ── */}
            {isFl && (
              <TabsContent value="family" className="grid grid-cols-2 gap-3 mt-0 pb-2">
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
                {field("Телефон супруга(и)", (
                  <MaskedInput
                    mask="+9 (999) 999-99-99"
                    value={String(form.spouse_phone || "")}
                    onChange={v => set("spouse_phone", v as never)}
                    placeholder="+7 (___) ___-__-__"
                    disabled={!!readOnly}
                  />
                ))}
                {field("Доход супруга(и), ₽", num("spouse_income"))}
              </TabsContent>
            )}

            {/* ── Обеспечение ── */}
            <TabsContent value="collateral" className="space-y-4 mt-0 pb-2">
              <div>
                <p className="text-sm font-medium mb-2">Недвижимое имущество</p>
                <div className="grid grid-cols-2 gap-3">
                  {field("Вид недвижимости", txt("real_estate_type"))}
                  {field("Кадастровый номер", (
                    <MaskedInput
                      mask="99:99:9999999:99"
                      value={String(form.cadastral_number || "")}
                      onChange={v => set("cadastral_number", v as never)}
                      placeholder="__:__:_______:__"
                      disabled={!!readOnly}
                    />
                  ))}
                  {field("Адрес залогового объекта", (
                    <DadataSuggest<DadataAddressSuggestion>
                      value={form.property_address || ""}
                      onChange={v => set("property_address", v as never)}
                      onSelect={item => set("property_address", item.unrestricted_value as never)}
                      fetchSuggestions={dadata.suggestAddress}
                      renderSuggestion={s => s.value}
                      getSuggestionValue={s => s.unrestricted_value}
                      placeholder="Начните вводить адрес..."
                      disabled={!!readOnly}
                    />
                  ))}
                  {field("Кадастровый номер земли", txt("land_cadastral_number"))}
                  {field("Адрес земельного участка", (
                    <DadataSuggest<DadataAddressSuggestion>
                      value={form.land_address || ""}
                      onChange={v => set("land_address", v as never)}
                      onSelect={item => set("land_address", item.unrestricted_value as never)}
                      fetchSuggestions={dadata.suggestAddress}
                      renderSuggestion={s => s.value}
                      getSuggestionValue={s => s.unrestricted_value}
                      placeholder="Начните вводить адрес..."
                      disabled={!!readOnly}
                    />
                  ))}
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

            {/* ── Служебное ── */}
            <TabsContent value="service" className="grid grid-cols-2 gap-3 mt-0 pb-2">
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

              {field("Сумма комиссии, ₽", num("commission_amount"))}

              <div className="space-y-1">
                <Label className="text-xs">Комиссия куратора, ₽</Label>
                <Input value={curatorCommission != null ? fmt(curatorCommission) : "—"} disabled className="bg-muted/40" />
                <p className="text-[11px] text-muted-foreground">(Комиссия − Вознаграждение агента) / 2</p>
              </div>

              <div className="col-span-2 flex items-center gap-3 py-1 border-t pt-3 mt-1">
                <input
                  type="checkbox"
                  id="is_agent_application_loan"
                  checked={!!form.is_agent_application}
                  onChange={e => {
                    const checked = e.target.checked;
                    setForm(f => ({ ...f, is_agent_application: checked, agent_name: checked ? f.agent_name : "" }));
                  }}
                  disabled={!!readOnly}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="is_agent_application_loan" className="text-sm font-medium cursor-pointer">
                  Заявка от агента
                </label>
              </div>

              {!!form.is_agent_application && (
                <>
                  {field("Наименование агента", txt("agent_name", "ФИО или название организации"))}
                  <div className="space-y-1">
                    <Label className="text-xs">Вознаграждение агента, ₽ (1% от суммы займа)</Label>
                    <Input value={agentReward != null ? fmt(agentReward) : "—"} disabled className="bg-muted/40" />
                    <p className="text-[11px] text-muted-foreground">Рассчитывается автоматически</p>
                  </div>
                </>
              )}

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

        <DialogFooter className="border-t px-6 py-3 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Закрыть</Button>
          {!isNew && <LoanApplicationDocButtons item={form as LoanApplication} />}
          {canEdit && item && (item.status === "new" || item.status === "in_review") && (
            <>
              <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={handleReject} disabled={rejecting}>
                Отклонить
              </Button>
              <Button variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={() => setShowApprove(true)}>
                Одобрить
              </Button>
            </>
          )}
          {canEdit && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Сохраняем..." : (isNew ? "Создать заявку" : "Сохранить")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {item && (
        <LoanApplicationApproveDialog
          open={showApprove}
          onOpenChange={setShowApprove}
          item={item}
          onApproved={() => {
            setShowApprove(false);
            onSaved();
            onLoanCreated?.();
          }}
        />
      )}
    </Dialog>
  );
};

export default LoanApplicationDialog;