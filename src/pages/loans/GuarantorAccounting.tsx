import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
export type GuarantorAccount = {basis?:string;date?:string;debt?:Record<string,string>;payment?:Record<string,string>;cumulative?:Record<string,string>};
export default function GuarantorAccounting({value,onChange}: {value:GuarantorAccount;onChange:(v:GuarantorAccount)=>void}) {
  const sections:["debt"|"payment"|"cumulative",string,[string,string][]][] = [
    ["debt","Собственная задолженность поручителя",[["first_overdue_date","Начало просрочки (ГГГГ-ММ-ДД)"],["term_principal","Срочный основной долг"],["overdue_principal","Просроченный основной долг"],["term_interest","Срочные проценты"],["overdue_interest","Просроченные проценты"],["penalty","Пени"],["main_miss_date","Последний пропущенный платёж ОД (ГГГГ-ММ-ДД)"],["interest_miss_date","Последний пропущенный платёж процентов (ГГГГ-ММ-ДД)"]]],
    ["payment","Последний платёж поручителя",[["amount","Всего"],["principal","Основной долг"],["interest","Проценты"],["penalty","Пени"],["date","Дата (ГГГГ-ММ-ДД), при отсутствии — дефис"]]],
    ["cumulative","Всего уплачено поручителем",[["amount","Всего"],["principal","Основной долг"],["interest","Проценты"],["penalty","Пени"]]],
  ];
  return <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Отдельный учёт исполнения поручителем</summary>
    <p className="my-2 text-xs text-muted-foreground">Заполняйте по документам самого поручителя. Суммы займа сюда не переносятся. Если платежей и собственного долга не было, достаточно подтвердить их отсутствие выше.</p>
    <div className="grid gap-2 sm:grid-cols-2"><label><Label>Документ-основание</Label><Input value={value.basis || ""} onChange={e=>onChange({...value,basis:e.target.value})}/></label><label><Label>Дата подтверждённого среза</Label><Input type="date" value={value.date || ""} onChange={e=>onChange({...value,date:e.target.value})}/></label></div>
    {sections.map(([group,title,fields])=><fieldset className="mt-3" key={group}><legend className="text-sm">{title}</legend><div className="grid gap-2 sm:grid-cols-3">{fields.map(([key,label])=><label key={key}><Label className="text-xs">{label}</Label><Input value={value[group]?.[key] || ""} onChange={e=>onChange({...value,[group]:{...value[group],[key]:e.target.value}})}/></label>)}</div></fieldset>)}
  </details>;
}
