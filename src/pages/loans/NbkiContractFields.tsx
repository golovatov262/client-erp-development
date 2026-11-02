import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import api, { humanizeError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Reference values from Bank of Russia GUTDF 5.1, effective 01.07.2026.
// Deal type is narrowed to values permitted for the borrower role (role=1).
const DEAL_TYPES = [
  ["1", "Договор займа (кредита)"],
  ["99", "Иная сделка"],
] as const;

const LOAN_KINDS = [
  ["7", "Кредит «овердрафт» (кредитование счета)"],
  ["8", "Синдицированный заем (кредит)"],
  ["9", "Жилищный кредит (кроме кредита с ипотекой)"],
  ["10", "Кредит с ипотекой"],
  ["11", "Кредит на приобретение автотранспортного средства"],
  ["12", "Кредит на приобретение транспортного средства, кроме автотранспортного средства"],
  ["13", "Необеспеченный микрозаем"],
  ["14", "Иной необеспеченный заем (кредит)"],
  ["15", "Жилищный заем (кроме займа с ипотекой)"],
  ["16", "Заем с ипотекой"],
  ["17", "Заем на приобретение автомобиля"],
  ["18", "Иной обеспеченный заем (кредит)"],
  ["99", "Иной заем (кредит)"],
] as const;

export default function NbkiContractFields({ loanId }: { loanId: number }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEffect(() => { api.bkiFields.get(loanId).then(data => setValues(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || ""])))).catch(() => setValues({})); }, [loanId]);
  const set = (key: string, value: string) => setValues(prev => ({ ...prev, [key]: value }));
  const save = async () => {
    setSaving(true);
    try { await api.bkiFields.save(loanId, values); toast({ title: "Реквизиты БКИ сохранены" }); }
    catch (e) { toast({ title: "Не удалось сохранить", description: humanizeError(e), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return <div className="rounded-md border p-3 space-y-3">
    <div><div className="text-sm font-medium">Общие реквизиты для передачи в БКИ</div><div className="text-xs text-muted-foreground">Персональные данные берутся из карточки пайщика. По одному договору коды и сведения должны быть одинаковыми при передаче в НБКИ, ОКБ и другие бюро. УИД займа укажите по реестру БКИ; если он уже импортирован и сопоставлен, здесь можно оставить поле пустым. Коды соблюдения размера и срока платежей не заполняются: ЦБ разъяснил, что их передача прекращена с 29.12.2025.</div></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label className="text-xs">УИД договора займа</Label><Input value={values.loan_uid || ""} onChange={e => set("loan_uid", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Тип сделки (справочник 2.2)</Label><Select value={values.deal_code || ""} onValueChange={value => set("deal_code", value)}><SelectTrigger><SelectValue placeholder="Выберите тип сделки" /></SelectTrigger><SelectContent>{DEAL_TYPES.map(([code, label]) => <SelectItem key={code} value={code}>{code} — {label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label className="text-xs">Вид займа (справочник 2.3)</Label><Select value={values.kind_code || ""} onValueChange={value => set("kind_code", value)}><SelectTrigger><SelectValue placeholder="Выберите вид займа" /></SelectTrigger><SelectContent>{LOAN_KINDS.map(([code, label]) => <SelectItem key={code} value={code}>{code} — {label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label className="text-xs">Код цели займа</Label><Input value={values.purpose_code || ""} onChange={e => set("purpose_code", e.target.value)} /></div>
    </div>
    <div className="space-y-1"><Label className="text-xs">Основание / примечание менеджера</Label><Textarea value={values.note || ""} onChange={e => set("note", e.target.value)} rows={2} placeholder="Документ и реквизит, по которому внесено значение" /></div>
    <div className="flex justify-end"><Button size="sm" onClick={save} disabled={saving}>{saving ? <Icon name="Loader2" size={14} className="mr-1 animate-spin" /> : <Icon name="Save" size={14} className="mr-1" />}Сохранить общие реквизиты</Button></div>
  </div>;
}
