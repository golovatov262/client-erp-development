import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function LoanNbkiOperation({loanId}: {loanId:number}) {
  const [refs,setRefs] = useState<Record<string,{code:string;label:string}[]>>({});
  const [kind,setKind] = useState("close");
  const [at,setAt] = useState("");
  const [basis,setBasis] = useState("");
  const [reason,setReason] = useState("");
  const [collateralReason,setCollateralReason] = useState("");
  const [change,setChange] = useState("");
  const [special,setSpecial] = useState("");
  const [provisionCode,setProvisionCode] = useState("");
  const [provisionDate,setProvisionDate] = useState("");
  const [provisionSum,setProvisionSum] = useState("");
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState("");
  const {toast} = useToast();
  useEffect(() => { api.loans.nbkiOperationReferences().then(setRefs).catch(() => setResult("Не удалось загрузить справочники причин")); }, []);
  const select = (label:string, key:string, value:string, update:(s:string)=>void) => <label className="space-y-1 text-sm"><span>{label}</span><select className="w-full rounded-md border bg-background p-2" value={value} onChange={e=>update(e.target.value)}><option value="">Выберите основание</option>{(refs[key] || []).filter(r=>key!=="closure" || r.code!=="18").map(r=><option value={r.code} key={r.code}>{r.code} — {r.label}</option>)}</select></label>;
  const save = async () => {
    setBusy(true);setResult("");
    try {
      const r = await api.loans.nbkiOperation({loan_id:loanId,kind,occurred_at:at,basis,reason_code:reason,collateral_reason_code:collateralReason,changes:{code:change,specialCode:special},provision_payment:{code:provisionCode,date:provisionDate,sum:provisionSum,currency:"RUB"}});
      setResult(`Операция №${r.operation_id} сохранена. В очередь БКИ добавлено событий: ${r.events_count}. Готовность XML и недостающие сведения доступны на вкладке НБКИ в администрировании.`);
      toast({title:kind==="close" ? "Прекращение займа и обеспечения зарегистрировано" : "События зарегистрированы"});
    } catch(e) { setResult(e instanceof Error ? e.message : "Не удалось сохранить операцию"); }
    finally {setBusy(false);}
  };
  return <div className="rounded-md border p-3 space-y-3">
    <div className="font-medium">Операция по действующему договору для БКИ</div>
    <p className="text-xs text-muted-foreground">Укажите фактическое время и документ-основание. Сохраняется текущий срез CRM на сегодня. При закрытии одновременно прекращаются залоги и поручительства. Принятые ранее платежи повторно не отправляются.</p>
    <label className="block text-sm space-y-1"><span>Операция</span><select className="w-full rounded-md border bg-background p-2" value={kind} onChange={e=>setKind(e.target.value)}>
      <option value="close">Прекращение займа и обеспечения — 2.5 / 2.4</option>
      <option value="terms_change">Зафиксировать изменение условий договора — 2.1</option>
      <option value="debt_change">Изменение задолженности без платежа — 2.3</option>
      <option value="collateral_change">Изменение обеспечения — 2.4</option>
      <option value="guarantor_debt_change">Изменение задолженности поручителя — 2.3</option>
      <option value="guarantor_change">Изменение обязательства поручителя — 2.1</option>
    </select></label>
    <div className="grid gap-3 sm:grid-cols-2"><div><Label>Дата и время операции (МСК)</Label><Input type="datetime-local" step="1" value={at} onChange={e=>setAt(e.target.value)} /></div><div><Label>Основание / документ</Label><Input maxLength={256} value={basis} onChange={e=>setBasis(e.target.value)} /></div></div>
    {kind==="close" && <div className="grid gap-3">{select("Прекращение займа — справочник 3.8","closure",reason,setReason)}{select("Прекращение обеспечения — справочник 4.2","collateral",collateralReason,setCollateralReason)}</div>}
    {kind==="close" && collateralReason==="2" && <div className="grid gap-3">{select("Использованное обеспечение","provision",provisionCode,setProvisionCode)}<label><Label>Дата погашения за счёт обеспечения</Label><Input type="date" value={provisionDate} onChange={e=>setProvisionDate(e.target.value)}/></label><label><Label>Погашено за счёт обеспечения, ₽</Label><Input type="number" min="0.01" step="0.01" value={provisionSum} onChange={e=>setProvisionSum(e.target.value)}/></label></div>}
    {(kind==="terms_change" || kind==="guarantor_change") && <div className="grid gap-3">{select("Вид изменения договора","change",change,setChange)}{select("Специальное изменение договора","special_change",special,setSpecial)}<p className="text-xs text-muted-foreground">Фиксируются уже внесённые в CRM условия. Эта операция не пересчитывает график.</p></div>}
    {result && <p role="status" className="text-sm">{result}</p>}
    <Button onClick={()=>void save()} disabled={busy || !at || !basis || (kind==="close" && (!reason || !collateralReason)) || ((kind==="terms_change" || kind==="guarantor_change") && (!change || !special))}>{busy ? "Сохраняю…" : kind==="close" ? "Закрыть обязательства и создать события" : "Зафиксировать события БКИ"}</Button>
  </div>;
}
