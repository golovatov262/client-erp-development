import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import api, { humanizeError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const FIELDS = [
  ["deal_code", "Код вида сделки"], ["kind_code", "Код вида займа"], ["purpose_code", "Код цели займа"],
  ["payment_size_code", "Код размера платежа"], ["payment_schedule_code", "Код периодичности платежа"],
] as const;

export default function NbkiContractFields({ loanId }: { loanId: number }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  useEffect(() => { api.nbkiManualFields.get(loanId).then(data => setValues(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v || ""])))).catch(() => {}); }, [loanId]);
  const set = (key: string, value: string) => setValues(prev => ({ ...prev, [key]: value }));
  const save = async () => {
    setSaving(true);
    try { await api.nbkiManualFields.save(loanId, values); toast({ title: "Реквизиты НБКИ сохранены" }); }
    catch (e) { toast({ title: "Не удалось сохранить", description: humanizeError(e), variant: "destructive" }); }
    finally { setSaving(false); }
  };
  return <div className="rounded-md border p-3 space-y-3">
    <div><div className="text-sm font-medium">Реквизиты для формирования НБКИ</div><div className="text-xs text-muted-foreground">Заполняются по документам/подтверждённым справочникам. Эти значения отдельно от условий договора CRM.</div></div>
    <div className="grid gap-3 sm:grid-cols-2">{FIELDS.map(([key, label]) => <div key={key} className="space-y-1"><Label className="text-xs">{label}</Label><Input value={values[key] || ""} onChange={e => set(key, e.target.value)} /></div>)}</div>
    <div className="space-y-1"><Label className="text-xs">Основание / примечание менеджера</Label><Textarea value={values.note || ""} onChange={e => set("note", e.target.value)} rows={2} placeholder="Документ и реквизит, по которому внесено значение" /></div>
    <div className="flex justify-end"><Button size="sm" onClick={save} disabled={saving}>{saving ? <Icon name="Loader2" size={14} className="mr-1 animate-spin" /> : <Icon name="Save" size={14} className="mr-1" />}Сохранить реквизиты НБКИ</Button></div>
  </div>;
}
