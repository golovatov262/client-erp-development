import { useCallback, useEffect, useMemo, useState } from "react";
import api, { IntegrationSecretStatus, humanizeError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const groups = [
  ["Уведомления", [["SMSAERO_EMAIL","SMS Aero — email"],["SMSAERO_API_KEY","SMS Aero — API-ключ"],["TELEGRAM_BOT_TOKEN","Telegram — токен"],["MAX_BOT_TOKEN","MAX — токен"],["VAPID_PUBLIC_KEY","Web Push — публичный ключ"],["VAPID_PRIVATE_KEY","Web Push — приватный ключ"],["VAPID_EMAIL","Web Push — email"]]],
  ["Проверки и внешние API", [["DADATA_API_KEY","DaData"],["CREDIT_CHECK_API_KEY","Кредитная история"],["KVELL_API_KEY","Kvell — API-ключ"],["KVELL_SECRET_KEY","Kvell — секрет"],["FSSP_API_TOKEN","ФССП"],["RFM_API_KEY","РФМ"],["ANTHROPIC_API_KEY","Anthropic"]]],
  ["Банк и почта", [["BANK_IMAP_HOST","IMAP-сервер"],["BANK_IMAP_PORT","IMAP-порт"],["BANK_IMAP_USER","IMAP-пользователь"],["BANK_IMAP_PASSWORD","IMAP-пароль"],["SBER_CLIENT_ID_ORG2","Сбер — Client ID организации 2"],["SBER_CLIENT_SECRET_ORG2","Сбер — секрет организации 2"],["SBER_CLIENT_ID_ORG3","Сбер — Client ID организации 3"],["SBER_CLIENT_SECRET_ORG3","Сбер — секрет организации 3"]]],
  ["Файловое хранилище", [["S3_ENDPOINT_URL","S3 endpoint"],["S3_BUCKET","S3 bucket"],["AWS_ACCESS_KEY_ID","S3 Access Key"],["AWS_SECRET_ACCESS_KEY","S3 Secret Key"]]],
] as const;

export default function AdminIntegrations() {
  const [statuses,setStatuses]=useState<IntegrationSecretStatus[]>([]), [values,setValues]=useState<Record<string,string>>({}), [savingGroup,setSavingGroup]=useState<string | null>(null);
  const {toast}=useToast();
  const configured=useMemo(()=>new Set(statuses.filter(x=>x.configured).map(x=>x.key)),[statuses]);
  const load=useCallback(()=>api.integrationSecrets.list().then(setStatuses).catch(e=>toast({title:"Ошибка",description:humanizeError(e),variant:"destructive"})),[toast]);
  useEffect(()=>{void load();},[load]);
  const saveGroup=async(title:string, fields:readonly (readonly [string,string])[])=>{
    const keys=new Set(fields.map(([key])=>key));
    const groupValues=Object.fromEntries(Object.entries(values).filter(([key,value])=>keys.has(key)&&value.trim()));
    if(!Object.keys(groupValues).length)return;
    setSavingGroup(title);
    try{
      const r=await api.integrationSecrets.save(groupValues);
      setValues(current=>Object.fromEntries(Object.entries(current).filter(([key])=>!keys.has(key))));
      await load();
      toast({title:"Настройки сохранены",description:`Обновлено полей: ${r.changed.length}`});
    }catch(e){
      toast({title:"Ошибка",description:humanizeError(e),variant:"destructive"});
    }finally{
      setSavingGroup(null);
    }
  };
  const remove=async(key:string)=>{if(!confirm("Удалить сохранённое значение?"))return;await api.integrationSecrets.remove(key);await load();};
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Секреты зашифрованы и после сохранения не показываются. Пустое поле не изменяет текущее значение.</p>
    {groups.map(([title,fields])=>{
      const hasChanges=fields.some(([key])=>values[key]?.trim());
      const saving=savingGroup===title;
      return <Card key={title}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        {fields.map(([key,label])=><div className="space-y-2" key={key}><div className="flex items-center justify-between"><Label htmlFor={key}>{label}</Label>{configured.has(key)&&<Badge variant="secondary">Настроено</Badge>}</div><div className="flex gap-2"><Input id={key} type={/SECRET|PASSWORD|TOKEN|PRIVATE|API_KEY/.test(key)?"password":"text"} autoComplete="off" placeholder={configured.has(key)?"Оставьте пустым, чтобы не менять":"Введите значение"} value={values[key]||""} onChange={e=>setValues(v=>({...v,[key]:e.target.value}))}/>{configured.has(key)&&<Button variant="outline" onClick={()=>void remove(key)} disabled={savingGroup!==null}>Удалить</Button>}</div></div>)}
        <div className="md:col-span-2"><Button onClick={()=>void saveGroup(title,fields)} disabled={savingGroup!==null||!hasChanges}>{saving?"Сохранение…":`Сохранить: ${title}`}</Button></div>
      </CardContent></Card>;
    })}
  </div>;
}
