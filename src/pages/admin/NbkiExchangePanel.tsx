import { useEffect, useRef, useState } from 'react';
import api, { humanizeError, NbkiExchangeConfig, NbkiExchangeStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const labels:Record<string,string> = {queued:'Ожидает Windows-компонент',processing:'Подписание и шифрование',prepared:'Защищённый файл готов',sending:'Отправляется',sent:'Отправлен — ожидается квитанция',delivery_unknown:'Отправка не подтверждена — требуется сверка с НБКИ',completed:'Получена итоговая квитанция',failed:'Ошибка подготовки',cancelled:'Отменён'};
const encode = async (file:File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text=''; for(let i=0;i<bytes.length;i++) text+=String.fromCharCode(bytes[i]);
  return btoa(text);
};
export default function NbkiExchangePanel({eventIds,onChange}:{eventIds:number[];onChange:()=>void}) {
  const [state,setState]=useState<NbkiExchangeStatus|null>(null);
  const [config,setConfig]=useState<NbkiExchangeConfig>({});
  const [recipient,setRecipient]=useState<File|null>(null);
  const [receipt,setReceipt]=useState<File|null>(null);
  const [mchd,setMchd]=useState<File|null>(null);
  const [error,setError]=useState(''); const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false); const [token,setToken]=useState('');
  const [editing,setEditing]=useState(false);
  const notify=useRef(onChange);notify.current=onChange;
  const previousStatus=useRef('');
  const refresh=async(initial=false)=>{
    const next=await api.nbki.exchangeStatus();setState(next);
    const status=JSON.stringify(next.packages.map(p=>[p.id,p.status]));
    if(previousStatus.current && previousStatus.current!==status)notify.current();
    previousStatus.current=status;
    if(initial)setConfig({signature_mode:'detached',signature_profile:'CAdES-T',package_suffix:'.zip.p7m',transport:'disabled',...next.config});
  };
  useEffect(()=>{void refresh(true).catch(e=>setError(humanizeError(e)));
    const timer=setInterval(()=>void refresh().catch(e=>setError(humanizeError(e))),15000);
    return ()=>clearInterval(timer);
  },[]);
  const run=async(work:()=>Promise<void>)=>{
    setBusy(true);setError('');setMessage('');
    try{await work();await refresh();onChange();}catch(e){setError(humanizeError(e));}finally{setBusy(false);}
  };
  const save=()=>run(async()=>{
    const payload:Record<string,unknown>={...config};
    if(recipient)payload.recipient_certificate=await encode(recipient);
    if(receipt)payload.receipt_certificate=await encode(receipt);
    if(mchd)payload.mchd_base64=await encode(mchd);
    const result=await api.nbki.exchangeAction<{config:NbkiExchangeConfig}>('exchange_settings',payload);
    setConfig(result.config);setRecipient(null);setReceipt(null);setMchd(null);setEditing(false);setMessage('Настройки сохранены');
  });
  const prepare=()=>run(async()=>{
    const result=await api.nbki.exchangeAction<{id:number}>('exchange_prepare',{event_ids:eventIds});
    setMessage(`Пакет №${result.id} поставлен в очередь Windows-компонента`);
  });
  const createAgent=()=>run(async()=>{
    const result=await api.nbki.exchangeAction<{token:string}>('exchange_agent_create');setToken(result.token);
  });
  const download=(id:number,xml=false)=>run(async()=>{
    const r=await api.nbki.exchangeAction<{file_name:string;content_base64:string}>('exchange_download',{id,xml});
    const raw=Uint8Array.from(atob(r.content_base64),c=>c.charCodeAt(0));
    const url=URL.createObjectURL(new Blob([raw]));const a=document.createElement('a');a.href=url;a.download=r.file_name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  const certificates=state?.agents.filter(a=>a.active).flatMap(a=>a.diagnostic.certificates||[])||[];
  const reserved=new Set(state?.packages.filter(p=>!['completed','failed','cancelled'].includes(p.status)).flatMap(p=>p.event_ids)||[]);
  const available=eventIds.filter(id=>!reserved.has(id));
  const update=(key:keyof NbkiExchangeConfig,value:string|boolean)=>{setConfig(c=>({...c,[key]:value}));setEditing(true);};
  return <Card>
    <CardHeader><CardTitle className="text-base">Подписание, шифрование и обмен с НБКИ</CardTitle></CardHeader>
    <CardContent className="space-y-4 text-sm">
      <p>XML подписывается на вашем Windows-ПК, помещается в ZIP и шифруется сертификатом НБКИ. Закрытый ключ остаётся в реестре Windows. Для фонового обмена ПК должен быть включён, а пользователь — вошедшим в Windows.</p>
      {error&&<div role="alert" className="text-destructive whitespace-pre-wrap">{error}</div>}
      {message&&<div role="status">{message}</div>}
      <details><summary className="cursor-pointer font-medium">Настройки сертификатов и канала обмена</summary>
        <div className="grid gap-4 md:grid-cols-2 pt-4">
          <label className="space-y-1">Сертификат НБКИ для шифрования (.cer)
            <Input type="file" accept=".cer,.crt,.pem" onChange={e=>{setRecipient(e.target.files?.[0]||null);setEditing(true);}}/>
            <div className="text-xs break-all">{config.recipient?.subject}<br/>{config.recipient?.thumbprint}{config.recipient&&` · до ${config.recipient.valid_until.slice(0,10)}`}</div>
          </label>
          <label className="space-y-1">Сертификат НБКИ для проверки квитанций (.cer)
            <Input type="file" accept=".cer,.crt,.pem" onChange={e=>{setReceipt(e.target.files?.[0]||null);setEditing(true);}}/>
            <div className="text-xs break-all">{config.receipt_signer?.subject}<br/>{config.receipt_signer?.thumbprint}</div>
          </label>
          <label>Сертификат вашей организации (отпечаток SHA-1)
            <Input list="nbki-local-certs" value={config.signer_thumbprint||''} onChange={e=>update('signer_thumbprint',e.target.value)} placeholder="Выберите после подключения Windows-компонента"/>
            <datalist id="nbki-local-certs">{certificates.map(c=><option key={c.thumbprint} value={c.thumbprint}>{c.subject}</option>)}</datalist>
          </label>
          <label>Сертификат HTTPS-аутентификации (если отличается)
            <Input value={config.tls_thumbprint||''} onChange={e=>update('tls_thumbprint',e.target.value)} placeholder="По умолчанию — сертификат подписи"/>
          </label>
          <p>Подпись: отсоединённая CAdES-T со штампом времени и сертификатом TSP. XML и подпись помещаются в ZIP32, архив шифруется ГОСТ 28147-89 в DER.</p>
          <label>Адрес TSP-сервера аккредитованного УЦ
            <Input value={config.tsp_url||''} onChange={e=>update('tsp_url',e.target.value)} placeholder="Адрес из базы знаний НБКИ / от вашего УЦ"/>
            <span className="text-xs text-muted-foreground">Сертификат службы должен входить в список НБКИ или быть согласован с НБКИ.</span>
          </label>
          <label>Зарегистрированный в НБКИ пакет МЧД (если используется)
            <Input type="file" accept=".zip" onChange={e=>{setMchd(e.target.files?.[0]||null);setEditing(true);}}/>
            {config.mchd_base64&&<span>Пакет МЧД загружен. <button type="button" className="underline" onClick={()=>{update('mchd_base64','');setMchd(null);}}>Удалить из настройки</button></span>}
          </label>
          <label>Расширение защищённого пакета по инструкции НБКИ
            <select className="w-full border rounded p-2" value={config.package_suffix||''} onChange={e=>update('package_suffix',e.target.value)}>
              {['.zip.p7m','.zip.enc'].map(s=><option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Канал отправки
            <select className="w-full border rounded p-2" value={config.transport||'disabled'} onChange={e=>update('transport',e.target.value)}>
              <option value="disabled">Подготовка файла без автоматической отправки</option><option value="nbki_https">HTTPS API НБКИ</option>
            </select>
          </label>
          <p className="text-muted-foreground">Отправка: icrs.nbki.ru/inout/cgi-bin/uploadvb.cgi. Получение квитанций: icrs.nbki.ru/inout/outGUTDF/. После отправки CRM ожидает квитанцию о приёме файла, затем — результат обработки событий.</p>
          <label className="flex gap-2 items-center"><input type="checkbox" checked={!!config.auto_receive} onChange={e=>update('auto_receive',e.target.checked)}/>Получать квитанции автоматически: ticket1 раз в минуту, ticket2 раз в 5 минут после положительного ticket1</label>
        </div>
        <Button className="mt-3" disabled={busy} onClick={save}>Сохранить настройки</Button>
      </details>
      <details><summary className="cursor-pointer font-medium">Подключение Windows-ПК</summary>
        <div className="space-y-3 pt-3">
          <p>На ПК нужны КриптоПро CSP 5.0 R3 или новее, лицензия КриптоПро TSP Client, корневые сертификаты УЦ ЦБ и компонент КриптоПро ЭЦП (CAdES COM). Ключ должен быть доступен текущему пользователю Windows. Компонент работает без открытого браузера.</p>
          <a className="underline" href="/nbki-agent.zip?v=2.0.3" download>Скачать Windows-компонент 2.0.3</a>
          <p>Распакуйте архив, создайте ключ подключения ниже и запустите установку из PowerShell под пользователем — владельцем ключа:</p>
          <code className="block break-all">{`.\Install-NbkiAgent.ps1 -CrmUrl "${window.location.origin}/api"`}</code>
          <p className="text-muted-foreground">Установщик не меняет политику выполнения скриптов и настройки безопасности. Если ваша политика требует подписи скрипта, установку выполняет администратор по правилам организации.</p>
          <Button variant="outline" disabled={busy} onClick={createAgent}>Создать ключ подключения ПК</Button>
          {token&&<div className="space-y-2"><p>Ключ показан один раз. Вставьте его в запрос установщика.</p><Input readOnly value={token} aria-label="Ключ подключения Windows"/><Button variant="outline" onClick={()=>setToken('')}>Скрыть ключ</Button></div>}
          {state?.agents.map(a=><div key={a.id} className="border-t pt-2">
            <div>{a.name} · {a.active?'активен':'отозван'} · Последняя связь: {a.last_seen_at?new Date(a.last_seen_at).toLocaleString('ru-RU'):'ещё не подключён'}</div>
            {(a.diagnostic.error||a.diagnostic.receipt_error)&&<div className="text-destructive">{a.diagnostic.error||a.diagnostic.receipt_error}</div>}
            {a.active&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>run(async()=>{await api.nbki.exchangeAction('exchange_agent_revoke',{id:a.id});})}>Отозвать доступ ПК</Button>}
          </div>)}
        </div>
      </details>
      <Button disabled={busy||editing||!available.length||!state?.config.recipient||!state?.config.signer_thumbprint||!state?.config.tsp_url||state?.config.signature_profile!=='CAdES-T'||!state?.config.package_suffix} onClick={()=>{
        if(available.length!==eventIds.length){void run(async()=>{const r=await api.nbki.exchangeAction<{id:number}>('exchange_prepare',{event_ids:available});setMessage(`Пакет №${r.id} поставлен в очередь`);});}else void prepare();
      }}>{state?.config.transport==='nbki_https'?'Подписать, зашифровать и отправить':'Подписать и зашифровать'} · {available.length} событий</Button>
      {editing&&<p>Сохраните настройки перед подготовкой пакета.</p>}
      {state?.packages.map(p=><div key={p.id} className="border-t pt-3 space-y-1">
        <div className="font-medium break-all">№{p.id} · {p.file_name}</div><div>{labels[p.status]||p.status} · {p.event_ids.length} событий</div>
        {p.error&&<p className="text-destructive">{p.error}</p>}
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy} onClick={()=>download(p.id,true)}>Исходный XML</Button>{p.encrypted_name&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>download(p.id)}>Скачать защищённый файл</Button>}
        {['queued','prepared','failed'].includes(p.status)&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>run(async()=>{await api.nbki.exchangeAction('exchange_cancel',{id:p.id});})}>Отменить пакет</Button>}</div>
      </div>)}
    </CardContent>
  </Card>;
}
