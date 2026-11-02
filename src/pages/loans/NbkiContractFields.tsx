import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import api, { humanizeError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const FIELDS = [
  ["loan_uid", "УИД договора займа"],
  ["deal_code", "Код вида сделки"], ["kind_code", "Код вида займа"], ["purpose_code", "Код цели займа"],
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
    <div className="grid gap-3 sm:grid-cols-2">{FIELDS.map(([key, label]) => <div key={key} className="space-y-1"><Label className="text-xs">{label}</Label><Input value={values[key] || ""} onChange={e => set(key, e.target.value)} /></div>)}</div>
    <div className="space-y-1"><Label className="text-xs">Основание / примечание менеджера</Label><Textarea value={values.note || ""} onChange={e => set("note", e.target.value)} rows={2} placeholder="Документ и реквизит, по которому внесено значение" /></div>
    <div className="flex justify-end"><Button size="sm" onClick={save} disabled={saving}>{saving ? <Icon name="Loader2" size={14} className="mr-1 animate-spin" /> : <Icon name="Save" size={14} className="mr-1" />}Сохранить общие реквизиты</Button></div>
  </div>;
}
