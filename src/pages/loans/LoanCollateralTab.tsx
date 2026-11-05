import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import api, { LoanCollateral, LoanDetail, humanizeError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Props {
  loanId: number;
}

const COLLATERAL_TYPES = [
  "Залог недвижимого имущества",
  "Залог движимого имущества",
  "Поручительство",
  "Иное",
];

const TYPE_ICONS: Record<string, string> = {
  "Залог недвижимого имущества": "Home",
  "Залог движимого имущества": "Car",
  "Поручительство": "UserCheck",
  "Иное": "FileText",
};

const NBKI_FIELDS = [
  ["nbki_collateral_code", "Код конкретного вида предмета"],
  ["nbki_collateral_start", "Дата возникновения залога", "date"],
  ["nbki_collateral_end", "Дата окончания залога", "date"],
  ["nbki_collateral_sum", "Сумма обеспечения", "number"],
  ["nbki_collateral_currency", "Валюта (код)"],
  ["nbki_assess_date", "Дата оценки", "date"],
  ["nbki_price_code", "Код вида стоимости"],
  ["nbki_actual_cost", "Фактическая стоимость", "number"],
  ["nbki_calc_date", "Дата расчёта стоимости", "date"],
  ["nbki_actual_price_code", "Код фактической стоимости"],
  ["nbki_contract_total_sum", "Общая сумма договора залога", "number"],
  ["nbki_contract_count", "Количество договоров в записи", "number"],
  ["nbki_location", "Код ОКАТО (из ФИАС)"],
  ["nbki_guarantee_uid", "УИД договора поручительства"],
  ["nbki_guarantee_amount", "Сумма ответственности поручителя", "number"],
  ["nbki_guarantee_currency", "Валюта поручительства"],
  ["nbki_guarantee_start", "Дата заключения поручительства", "date"],
  ["nbki_guarantee_end", "Дата окончания поручительства", "date"],
] as const;

const COLLATERAL_CODES = [
  ["1", "Недвижимость"], ["1.1", "Здание"], ["1.2", "Сооружение"], ["1.3", "Помещение"],
  ["1.4", "Машино-место"], ["1.5", "Объект незавершённого строительства"], ["1.6", "Земельный участок"],
  ["1.7", "Единый недвижимый комплекс"], ["1.8", "Имущественный комплекс"], ["2", "Транспортное средство"],
  ["2.1", "Самоходная машина"], ["3", "Машины и оборудование"], ["3.1", "Сельскохозяйственное оборудование"],
  ["3.2", "Оборудование для строительства"], ["3.3", "Оборудование для добычи полезных ископаемых"],
  ["3.4", "Оборудование нефтепереработки и нефтехимии"], ["3.5", "Оборудование металлургии"],
  ["3.6", "Металлообрабатывающее оборудование"], ["3.7", "Деревообрабатывающее и целлюлозное оборудование"],
  ["3.8", "Энергетическое оборудование"], ["3.9", "Оборудование лёгкой промышленности"],
  ["3.10", "Оборудование пищевой промышленности"], ["3.11", "Медицинское оборудование"],
  ["3.12", "Вычислительное и телекоммуникационное оборудование"], ["4", "Воздушное судно"],
  ["4.1", "Самолёт"], ["4.2", "Вертолёт"], ["5", "Плавучее сооружение"],
  ["5.1", "Пассажирское судно"], ["5.2", "Грузовое судно или буксир"], ["5.3", "Рыболовное судно"],
  ["5.4", "Судно для иных целей"], ["5.5", "Плавучее сооружение, не являющееся судном"],
  ["6", "Железнодорожный подвижной состав"], ["6.1", "Локомотив"], ["6.2", "Специальная самоходная ж/д единица"],
  ["6.3", "Вагон моторвагонного состава"], ["6.4", "Грузовой вагон"], ["6.5", "Пассажирский вагон"],
  ["6.6", "Вагон высокоскоростного состава"], ["6.7", "Специальная несамоходная ж/д единица"],
  ["7", "Космический объект"], ["7.1", "Космический объект"], ["8", "Товары в обороте"],
  ["8.1", "Сельскохозяйственная продукция"], ["8.2", "Заменимые животные"], ["8.3", "Продукты, напитки, табачные изделия"],
  ["8.4", "Драгоценные металлы и камни"], ["8.5", "Ювелирные изделия"], ["8.6", "Строительные материалы и металлопродукция"],
  ["8.7", "Транспорт, оборудование и комплектующие"], ["8.8", "Текстиль"], ["8.9", "Топливно-энергетические ресурсы"],
  ["8.10", "Химические вещества и продукты"], ["8.11", "Лекарства и медицинские материалы"],
  ["9", "Будущий урожай"], ["9.1", "Зерновые культуры"], ["9.2", "Зернобобовые культуры"],
  ["9.3", "Масличные культуры"], ["9.4", "Технические культуры"], ["9.5", "Кормовые культуры"],
  ["9.6", "Бахчевые культуры"], ["9.7", "Картофель"], ["9.8", "Овощи"], ["9.9", "Многолетние насаждения"],
  ["10", "Аффинированные драгоценные металлы"], ["10.1", "Золото"], ["10.2", "Серебро"], ["10.3", "Платина"], ["10.4", "Палладий"],
  ["11", "Исключительные права на результаты интеллектуальной деятельности"], ["11.1", "Произведение науки, литературы или искусства"],
  ["11.2", "Программа для ЭВМ"], ["11.3", "База данных"], ["11.4", "Изобретение"], ["11.5", "Секрет производства (ноу-хау)"],
  ["11.6", "Товарный знак или знак обслуживания"], ["12", "Права по договору банковского счёта"],
  ["12.1", "Права на сумму на залоговом счёте"], ["12.2", "Права на сумму, указанную в договоре залога"],
  ["13", "Доля в уставном капитале ООО"], ["13.1", "Доля в уставном капитале ООО"], ["14", "Вексель"], ["14.1", "Вексель"],
  ["15", "Эмиссионные ценные бумаги"], ["15.1", "Акция"], ["15.2", "Облигация"], ["15.3", "Опцион эмитента"], ["15.4", "Депозитарная расписка"],
  ["16", "Инвестиционный пай"], ["16.1", "Инвестиционный пай"], ["17", "Ипотечный сертификат участия"], ["17.1", "Ипотечный сертификат участия"],
  ["18", "Прочие ценные бумаги"], ["18.1", "Закладная"], ["18.2", "Депозитный сертификат"], ["18.3", "Сберегательный сертификат"],
  ["19", "Прочие имущественные права"], ["19.1", "Право аренды или пользования"], ["19.2", "Права участника долевого строительства"],
  ["19.3", "Имущественные права на недвижимость"], ["19.4", "Право требования"], ["20", "Прочие движимые вещи"],
  ["20.1", "Индивидуально определённое животное"], ["20.2", "Монета из драгоценного металла"],
  ["20.3", "Предмет бытового использования"], ["21", "Всё имущество залогодателя"], ["99", "Иной предмет залога"],
] as const;

const VALUE_CODES = [["1", "Рыночная"], ["2", "Кадастровая"], ["3", "Ликвидационная"], ["4", "Инвестиционная"], ["99", "Иная"]] as const;

const fmt = (n?: number) => n === undefined || n === null ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
const fmtDate = (value?: string | null) => value ? value.slice(0, 10).split("-").reverse().join(".") : "—";

const LoanCollateralTab = ({ loanId }: Props) => {
  const [items, setItems] = useState<LoanCollateral[]>([]);
  const [loan, setLoan] = useState<LoanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [collateralType, setCollateralType] = useState("Залог недвижимого имущества");
  const [pledgerName, setPledgerName] = useState("");
  const [description, setDescription] = useState("");
  const [collateralValue, setCollateralValue] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [fiasResults, setFiasResults] = useState<{ address: string; okato: string | null; fias_guid: string | null; exact_match: boolean }[]>([]);
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const [nbki, setNbki] = useState<Record<string, string>>({});

  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api.loanCollateral.list(loanId).then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [loanId]);
  useEffect(() => { api.loans.get(loanId).then(setLoan).catch(() => setLoan(null)); }, [loanId]);

  const defaultNbki = (type: string) => type === "Поручительство" ? {} : {
    nbki_collateral_start: loan?.start_date?.slice(0, 10) || "",
    nbki_collateral_end: loan?.end_date?.slice(0, 10) || "",
    nbki_collateral_sum: loan?.amount != null ? String(loan.amount) : "",
    nbki_collateral_currency: "RUB",
    nbki_assess_date: loan?.start_date?.slice(0, 10) || "",
    nbki_actual_cost: loan?.amount != null ? String(loan.amount) : "",
    nbki_calc_date: loan?.start_date?.slice(0, 10) || "",
    nbki_contract_total_sum: loan?.amount != null ? String(loan.amount) : "",
    nbki_contract_count: "1",
  };

  const resetForm = () => {
    setShowAdd(false);
    setEditId(null);
    setCollateralType("Залог недвижимого имущества");
    setPledgerName("");
    setDescription("");
    setCollateralValue("");
    setIdentifier("");
    setLocationAddress("");
    setFiasResults([]);
    setNbki({});
  };

  const openAdd = () => {
    resetForm();
    const initialType = "Залог недвижимого имущества";
    setNbki(defaultNbki(initialType));
    if (initialType === "Залог движимого имущества") setLocationAddress(loan?.member_registration_address || "");
    setShowAdd(true);
  };

  const openEdit = (item: LoanCollateral) => {
    setEditId(item.id);
    setCollateralType(item.collateral_type);
    setPledgerName(item.pledger_name || "");
    setDescription(item.description || "");
    setCollateralValue(item.collateral_value !== undefined && item.collateral_value !== null ? String(item.collateral_value) : "");
    setIdentifier(item.identifier || "");
    setLocationAddress(item.nbki_location_address || (item.collateral_type === "Залог движимого имущества" ? loan?.member_registration_address || "" : item.collateral_type === "Залог недвижимого имущества" ? item.description || "" : ""));
    setFiasResults([]);
    const storedFields = item as unknown as Record<string, string | number | null | undefined>;
    setNbki(Object.fromEntries(NBKI_FIELDS.map(([key, , kind]) => {
      const value = storedFields[key];
      const fallback = (defaultNbki(item.collateral_type) as Record<string, string>)[key] || "";
      // Date inputs require YYYY-MM-DD, but identifiers/codes (especially the
      // 11-digit OKATO) must be preserved exactly as stored.
      const formatted = value == null || value === ""
        ? fallback
        : kind === "date"
          ? String(value).slice(0, 10)
          : String(value);
      return [key, formatted];
    })));
    setShowAdd(true);
  };

  const resolveOkato = async () => {
    if (!locationAddress.trim()) {
      toast({ title: "Введите адрес для поиска в ФИАС", variant: "destructive" });
      return;
    }
    setResolvingAddress(true);
    setFiasResults([]);
    try {
      const response = await api.loanCollateral.resolveOkato(locationAddress.trim());
      const found = response.results || [];
      const withOkato = found.filter(item => item.okato);
      setFiasResults(withOkato);
      if (withOkato.length === 1 && withOkato[0].exact_match) {
        setNbki(prev => ({ ...prev, nbki_location: withOkato[0].okato || "" }));
        setLocationAddress(withOkato[0].address || locationAddress);
        toast({ title: "ОКАТО определён по ФИАС" });
      } else if (withOkato.length > 0) {
        toast({ title: "Найден вариант адреса", description: "Проверьте совпадение и выберите адрес ниже" });
      } else {
        toast({ title: "Не найден адрес с кодом ОКАТО", description: "Проверьте адрес или заполните ОКАТО вручную", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Не удалось определить ОКАТО", description: humanizeError(e), variant: "destructive" });
    } finally {
      setResolvingAddress(false);
    }
  };

  const handleSave = async () => {
    if (!collateralType) {
      toast({ title: "Выберите вид обеспечения", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const effectiveNbki = {
        ...defaultNbki(collateralType),
        ...Object.fromEntries(Object.entries(nbki).filter(([, value]) => value !== "")),
      };
      const payload = {
        collateral_type: collateralType,
        pledger_name: pledgerName || undefined,
        description: description || undefined,
        collateral_value: collateralValue ? Number(collateralValue.replace(",", ".")) : undefined,
        identifier: identifier || undefined,
        nbki_location_address: locationAddress || null,
        ...Object.fromEntries(NBKI_FIELDS.map(([key, , kind]) => [key, effectiveNbki[key] ? (kind === "number" ? Number(effectiveNbki[key].replace(",", ".")) : effectiveNbki[key]) : null])),
      };
      if (editId) {
        await api.loanCollateral.update({ loan_id: loanId, id: editId, ...payload });
        toast({ title: "Обеспечение обновлено" });
      } else {
        await api.loanCollateral.create({ loan_id: loanId, ...payload });
        toast({ title: "Обеспечение добавлено" });
      }
      resetForm();
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: LoanCollateral) => {
    if (!confirm("Удалить запись об обеспечении?")) return;
    try {
      await api.loanCollateral.remove(loanId, item.id);
      toast({ title: "Обеспечение удалено" });
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Icon name="Loader2" size={24} className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Залоги и поручители по договору займа
        </div>
        {!showAdd && (
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Icon name="Plus" size={14} />
            Добавить
          </Button>
        )}
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="text-sm font-medium">{editId ? "Редактирование" : "Новое обеспечение"}</div>
            <div className="space-y-1.5">
              <Label className="text-xs">Вид обеспечения *</Label>
              <Select value={collateralType} onValueChange={value => { setCollateralType(value); if (value === "Залог движимого имущества" && !locationAddress) setLocationAddress(loan?.member_registration_address || ""); }}>
                <SelectTrigger><SelectValue placeholder="Выберите вид обеспечения" /></SelectTrigger>
                <SelectContent>
                  {COLLATERAL_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Залогодатель / Поручитель</Label>
              <Input value={pledgerName} onChange={e => setPledgerName(e.target.value)} placeholder="ФИО или наименование" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Характеристики залога</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание объекта: адрес, площадь, марка авто и т.д." rows={3} />
            </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Сумма залога</Label>
                  <Input type="number" value={collateralValue} onChange={e => setCollateralValue(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                <Label className="text-xs">Кадастровый номер / VIN</Label>
                <Input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={collateralType === "Залог движимого имущества" ? "VIN транспортного средства" : "Кадастровый номер объекта"} />
                </div>
              </div>
              {collateralType !== "Поручительство" && collateralType !== "Иное" && <div className="rounded-md border p-3 space-y-2">
                <div className="text-sm font-medium">Адрес для определения ОКАТО</div>
                <div className="text-xs text-muted-foreground">Для недвижимости укажите адрес объекта; для движимого имущества используется адрес регистрации пайщика. ФИАС возвращает код ОКАТО, который требует формат БКИ.</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={locationAddress} onChange={e => { setLocationAddress(e.target.value); setFiasResults([]); }} placeholder="Регион, населённый пункт, улица, дом" />
                  <Button type="button" variant="outline" onClick={() => void resolveOkato()} disabled={resolvingAddress} className="shrink-0">
                    {resolvingAddress ? <Icon name="Loader2" size={14} className="mr-1 animate-spin" /> : null}Определить ОКАТО
                  </Button>
                </div>
                {fiasResults.length > 0 && (fiasResults.length > 1 || !fiasResults[0].exact_match) && <Select value={fiasResults.find(item => item.okato === nbki.nbki_location)?.address || ""} onValueChange={address => {
                  const match = fiasResults.find(item => item.address === address);
                  if (match) { setNbki(prev => ({ ...prev, nbki_location: match.okato || "" })); setLocationAddress(match.address); }
                }}><SelectTrigger><SelectValue placeholder="Выберите точный адрес из ФИАС" /></SelectTrigger><SelectContent>{fiasResults.map((item, index) => <SelectItem key={`${item.okato}-${index}`} value={item.address}>{item.address} — ОКАТО {item.okato}</SelectItem>)}</SelectContent></Select>}
              </div>}
              <div className="rounded-md border p-3 space-y-2">
              <div><div className="text-sm font-medium">Реквизиты обеспечения для файла БКИ</div><div className="text-xs text-muted-foreground">Суммы и даты по умолчанию подставлены из договора займа. Валюта — RUB. Коды выбираются по справочникам ГУТДФ 5.1.</div></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{NBKI_FIELDS.filter(([key]) => collateralType === "Поручительство" ? key.startsWith("nbki_guarantee") : !key.startsWith("nbki_guarantee")).map(([key, label, kind]) => <div key={key} className="space-y-1"><Label className="text-xs">{label}</Label>{key === "nbki_collateral_code" ? <Select value={nbki[key] || ""} onValueChange={value => setNbki(prev => ({ ...prev, [key]: value }))}><SelectTrigger><SelectValue placeholder="Выберите вид предмета" /></SelectTrigger><SelectContent>{COLLATERAL_CODES.map(([code, text]) => <SelectItem key={code} value={code}>{code} — {text}</SelectItem>)}</SelectContent></Select> : (key === "nbki_price_code" || key === "nbki_actual_price_code") ? <Select value={nbki[key] || ""} onValueChange={value => setNbki(prev => ({ ...prev, [key]: value }))}><SelectTrigger><SelectValue placeholder="Выберите вид стоимости" /></SelectTrigger><SelectContent>{VALUE_CODES.map(([code, text]) => <SelectItem key={code} value={code}>{code} — {text}</SelectItem>)}</SelectContent></Select> : <Input type={kind || "text"} inputMode={key === "nbki_location" ? "numeric" : undefined} maxLength={key === "nbki_location" ? 11 : undefined} readOnly={key === "nbki_collateral_currency" || key === "nbki_contract_count"} value={key === "nbki_collateral_currency" ? "RUB" : key === "nbki_contract_count" ? "1" : nbki[key] || ""} onChange={e => setNbki(prev => ({ ...prev, [key]: e.target.value }))} />}</div>)}</div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={resetForm}>Отмена</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !collateralType} className="gap-1.5">
                {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Save" size={14} />}
                {editId ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && !showAdd ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <Icon name="ShieldCheck" size={32} className="mx-auto mb-2 opacity-30" />
            По этому договору обеспечение не заполнено
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id}>
              <CardContent className="py-3 flex items-start gap-3">
                <Icon name={TYPE_ICONS[item.collateral_type] || "FileText"} size={18} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{item.collateral_type}</Badge>
                    {item.collateral_value !== undefined && item.collateral_value !== null && (
                      <span className="text-xs text-muted-foreground">{fmt(item.collateral_value)}</span>
                    )}
                  </div>
                  {item.pledger_name && <div className="font-medium text-sm">{item.pledger_name}</div>}
                  {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                  {item.identifier && <div className="text-xs text-muted-foreground">Идентификатор: {item.identifier}</div>}
                  {item.nbki_location_address && <div className="text-xs text-muted-foreground">Адрес для ОКАТО: {item.nbki_location_address}</div>}
                  {item.nbki_location && <div className="text-xs text-muted-foreground">ОКАТО: {item.nbki_location}</div>}
                  {item.nbki_source_facts && (() => {
                    const source = item.nbki_source_facts;
                    const facts = source.payload?.collateral || {};
                    const value = facts.Sum_group_FL_32_35_Group || {};
                    return <div className="mt-2 space-y-1 rounded border bg-muted/30 px-2 py-1.5 text-xs">
                      <div className="font-medium">Сведения из XML НБКИ · событие 2.4 №{source.event_order}</div>
                      <div>Код предмета: {source.collateral_code}; дата события: {source.event_time ? new Date(source.event_time).toLocaleString("ru-RU") : "—"}</div>
                      <div>Идентификатор в XML: <span className="font-mono">{source.property_id || "—"}</span></div>
                      <div>Сумма обеспечения: {value.sum || "—"} {value.currency || ""}; дата оценки: {value.assessDate || "—"}; код стоимости: {value.priceCode || "—"}</div>
                      <div>Фактическая стоимость: {facts.actualCost || "—"}; дата расчёта: {facts.calcDate || "—"}; срок залога: {facts.startDate || "—"} — {facts.collateralEndDate || "—"}</div>
                      {source.match_reason && <div className="text-amber-700">{source.match_reason}</div>}
                      <div className="text-muted-foreground">Источник: {source.document_number}; CRM-идентификатор и существующая стоимость сохранены.</div>
                    </div>;
                  })()}
                  {item.collateral_type === "Поручительство" && item.nbki_guarantee_uid && <div className="space-y-0.5 rounded border px-2 py-1.5 text-xs">
                    <div>УИД поручительства: <span className="break-all font-mono">{item.nbki_guarantee_uid}</span></div>
                    {item.nbki_guarantee_amount != null && <div>Размер ответственности: {fmt(item.nbki_guarantee_amount)}</div>}
                    <div>Срок: {fmtDate(item.nbki_guarantee_start)} — {fmtDate(item.nbki_guarantee_end)}</div>
                    <div className="text-muted-foreground">Данные отчёта 1С; приём НБКИ по этому файлу не подтверждён квитанцией</div>
                  </div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                    <Icon name="Pencil" size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item)}>
                    <Icon name="Trash2" size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default LoanCollateralTab;
