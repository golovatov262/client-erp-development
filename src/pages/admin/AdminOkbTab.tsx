import {useEffect,useRef,useState} from 'react';
import api,{humanizeError,OkbConfig,OkbEvents,OkbStatus} from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card,CardContent,CardHeader,CardTitle} from '@/components/ui/card';

const labels:Record<string,string>={queued:'Ожидает Windows-компонент ОКБ',processing:'Подписание и шифрование',sending:'Отправляется',sent:'Загружен в ОКБ — ожидаются извещения',delivery_unknown:'Доставка не подтверждена. Требуется сверка с ОКБ',completed:'Обработка завершена',failed:'Ошибка подготовки',cancelled:'Отменён'};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
async function encode(file:File){const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(const b of bytes)text+=String.fromCharCode(b);return btoa(text);}
export default function AdminOkbTab(){
 const [view,setView]=useState('operations');const [state,setState]=useState<OkbStatus|null>(null);const [config,setConfig]=useState<OkbConfig>({});
 const [events,setEvents]=useState<OkbEvents|null>(null);const [from,setFrom]=useState(today);const [to,setTo]=useState(today);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [token,setToken]=useState('');
 const [dirty,setDirty]=useState(false);const [recipient,setRecipient]=useState<File|null>(null);const [signer,setSigner]=useState<File|null>(null);
 const loadRef=useRef(()=>{});const previous=useRef('');
 const refresh=async(initial=false)=>{const next=await api.okb.status();setState(next);if(initial)setConfig(next.config);
   const key=JSON.stringify(next.packages.map(p=>[p.id,p.status,p.receipt_stage]));if(previous.current&&key!==previous.current)loadRef.current();previous.current=key;};
 const load=async()=>{try{setError('');setEvents(await api.okb.events(from,to));}catch(e){setError(humanizeError(e));}};loadRef.current=()=>{if(events)void load();};
 useEffect(()=>{void refresh(true).catch(e=>setError(humanizeError(e)));const timer=setInterval(()=>void refresh().catch(e=>setError(humanizeError(e))),15000);return()=>clearInterval(timer);},[]);
 const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await work();await refresh();}catch(e){setError(humanizeError(e));}finally{setBusy(false);}};
 const update=(key:keyof OkbConfig,value:string|boolean)=>{setConfig(c=>({...c,[key]:value}));setDirty(true);};
 const ready=events?.rows.filter(e=>e.ready).map(e=>e.id)||[];
 const download=(id:number,xml:boolean)=>run(async()=>{const r=await api.okb.action<{file_name:string;content_base64:string}>('download',{id,xml});const url=URL.createObjectURL(new Blob([Uint8Array.from(atob(r.content_base64),c=>c.charCodeAt(0))]));const a=document.createElement('a');a.href=url;a.download=r.file_name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 const packages=state?.packages.filter(p=>view==='history'||!['completed','cancelled'].includes(p.status))||[];
 return <div className="space-y-5 pt-4">
  <div className="flex justify-between gap-3"><div><h2 className="text-lg font-semibold">ОКБ · Обмен кредитной информацией</h2><p className="text-sm text-muted-foreground">Отдельная очередь ОКБ. Принятие в НБКИ не заменяет принятие в ОКБ.</p></div><Button variant="outline" onClick={()=>void run(async()=>{await refresh();if(events)await load();})}>Обновить</Button></div>
  <nav aria-label="Разделы ОКБ" className="flex flex-wrap gap-1 border-b pb-3">{[['operations','Текущая работа'],['history','История'],['settings','Настройки']].map(([key,label])=><Button key={key} variant={view===key?'default':'ghost'} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</Button>)}</nav>
  {error&&<div role="alert" className="text-sm text-destructive whitespace-pre-wrap">{error}</div>}{message&&<p role="status" className="text-sm">{message}</p>}
  {view==='operations'&&<>
   <Card><CardHeader><CardTitle className="text-base">1. Проверить события за период</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
    <p className="text-muted-foreground">Выберите период, который нужно передать в ОКБ. События берутся из операций CRM; подтверждённые ОКБ и уже включённые в пакет повторно не отправляются. История ранее отправленных вне CRM файлов ОКБ пока не учтена — не выбирайте такой период без сверки.</p>
    <div className="flex flex-wrap items-end gap-3"><label>С (МСК)<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>По (МСК)<Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><Button variant="outline" disabled={busy||!from||!to||from>to} onClick={()=>void run(load)}>Показать события</Button></div>
    {events&&<p>В списке: {events.rows.length}. Можно сформировать: {ready.length}. Требуют исправления: {events.rows.length-ready.length}.</p>}
    {events?.has_more&&<p>Показаны первые 100 событий. После их обработки обновите список для следующего пакета.</p>}
    <div className="max-h-96 overflow-y-auto">{events?.rows.map(e=><div key={e.id} className="border-b py-3"><span className="font-medium">{e.contract_no}</span> · {e.event_name||e.event_kind} · {e.event_at?new Date(e.event_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'Время события не установлено'}<div className={e.ready?'text-muted-foreground':'text-destructive'}>{e.ready?'XML можно сформировать':e.error}</div>{e.delivery.status==='rejected'&&<p>Ранее отклонено ОКБ. Готовность повторной выгрузки проверяется по исправленным данным.</p>}</div>)}</div>
    {events&&!events.rows.length&&<p>За выбранный период нет событий для нового пакета ОКБ.</p>}
   </CardContent></Card>
   <Card><CardHeader><CardTitle className="text-base">2. Отправить в ОКБ</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
    <p>Windows-компонент ОКБ подпишет ZIP, зашифрует и передаст файл в CFB. ПК должен быть включён, пользователь — вошедшим в Windows, компонент — запущен.</p>
    {!state?.config.enabled&&<p>Обмен выключен. <button className="underline" onClick={()=>setView('settings')}>Заполнить настройки подключения</button></p>}
    {dirty&&<p>Сохраните изменения настроек перед отправкой.</p>}
    {events&&(events.from!==from||events.to!==to)&&<p>Период изменён. Нажмите «Показать события» перед отправкой.</p>}
    <Button disabled={busy||dirty||!ready.length||!state?.config.enabled||events?.from!==from||events?.to!==to} onClick={()=>void run(async()=>{const r=await api.okb.action<{id:number}>('prepare',{event_ids:ready});setMessage(`Пакет ОКБ №${r.id} поставлен в очередь Windows-компонента`);await load();})}>Отправить в ОКБ · событий: {ready.length}</Button>
    <h3 className="border-t pt-3 font-semibold">3. Дождаться извещений</h3><p className="text-muted-foreground">Извещение №1 подтверждает получение файла. Извещение №2 показывает принятые и отклонённые события. {state?.config.auto_receive?'Компонент получает и проверяет ответы автоматически.':'Автоматическое получение выключено — включите его в настройках.'}</p>
   </CardContent></Card>
  </>}
  {view!=='settings'&&<Card><CardHeader><CardTitle className="text-base">{view==='history'?'Пакеты и результаты ОКБ':'Пакеты в работе'}</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
   {state&&!packages.length&&<p className="text-muted-foreground">{view==='history'?'Пакетов ОКБ пока нет.':'Незавершённых пакетов нет. Результаты принятых файлов — в истории.'}</p>}
   {packages.map(p=><div key={p.id} className="border-b pb-4 space-y-2"><div className="font-medium break-all">№{p.id} · {p.file_name}</div><div>{labels[p.status]||p.status} · событий: {p.events_count}</div>
    {p.status==='completed'&&<p>Принято: {p.accepted}. Отклонено: {p.rejected}.</p>}{p.error&&<p className="text-destructive">{p.error}</p>}
    {p.receipts?.map((r,i)=><div key={i}>Извещение №{r.kind}: {r.status==='accepted'?'все события приняты':r.status==='received'?'файл получен':r.status==='partial'?'частичное принятие':'отказ'}{r.errors.map((e,j)=><p key={j} className="text-destructive">{e.order_num&&`Событие ${e.order_num}: `}{e.field_name} {e.error_message}</p>)}{r.warnings?.map((w,j)=><p key={`warning-${j}`} className="text-amber-700">Предупреждение: {Object.values(w).filter(Boolean).join(' · ')}</p>)}</div>)}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>void download(p.id,true)}>Исходный XML</Button>{!['queued','processing'].includes(p.status)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void download(p.id,false)}>Защищённый файл</Button>}{['queued','failed'].includes(p.status)&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(async()=>{await api.okb.action('cancel',{id:p.id});await load();})}>Отменить пакет</Button>}</div>
   </div>)}
  </CardContent></Card>}
  <div hidden={view!=='settings'} className="space-y-5">
   <Card><CardHeader><CardTitle className="text-base">Подключение к ОКБ</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
    <p>Рабочий контур CFB ОКБ. Имена файлов CHP, формат ЕФКИ 5.1. Тестовые CHT-файлы с реальными данными CRM не отправляются.</p>
    <div className="grid gap-4 md:grid-cols-2">{([['sin','Код подписчика SIN (5 цифр)'],['group','Группа CFB'],['username','Логин CFB'],['signer_thumbprint','Сертификат организации: отпечаток SHA-1'],['tls_thumbprint','Сертификат HTTPS, если отличается'],['tsp_url','Адрес службы штампов времени TSP']] as const).map(([key,label])=><label key={key}>{label}<Input value={config[key]||''} onChange={e=>update(key,e.target.value)}/></label>)}</div>
    <p className="text-muted-foreground">Пароль CFB вводится установщику на Windows-ПК и защищается DPAPI. В CRM пароль не передаётся.</p>
    <label className="flex gap-2"><input type="checkbox" checked={!!config.certificate_registered} onChange={e=>update('certificate_registered',e.target.checked)}/>Сертификат организации зарегистрирован в ОКБ для рабочего обмена</label>
    <label className="flex gap-2"><input type="checkbox" checked={!!config.enabled} onChange={e=>update('enabled',e.target.checked)}/>Включить отправку в ОКБ</label>
    <label className="flex gap-2"><input type="checkbox" checked={!!config.auto_receive} onChange={e=>update('auto_receive',e.target.checked)}/>Автоматически получать и обрабатывать извещения</label>
    <details><summary className="cursor-pointer font-medium">Сертификаты ОКБ</summary><div className="grid gap-4 md:grid-cols-2 pt-3"><label>Получатель для шифрования<div className="text-xs break-all">{config.recipient?.subject} · до {config.recipient?.valid_until.slice(0,10)}</div><Input type="file" accept=".cer,.pem" onChange={e=>{setRecipient(e.target.files?.[0]||null);setDirty(true);}}/></label><label>Проверка подписи ответов<div className="text-xs break-all">{config.receipt_signer?.subject} · до {config.receipt_signer?.valid_until.slice(0,10)}</div><Input type="file" accept=".cer,.pem" onChange={e=>{setSigner(e.target.files?.[0]||null);setDirty(true);}}/></label></div></details>
    <Button disabled={busy} onClick={()=>void run(async()=>{const data:Record<string,unknown>={...config};if(recipient)data.recipient_certificate=await encode(recipient);if(signer)data.receipt_signer_certificate=await encode(signer);const r=await api.okb.action<{config:OkbConfig}>('settings',data);setConfig(r.config);setDirty(false);setMessage('Настройки ОКБ сохранены');})}>Сохранить настройки</Button>
   </CardContent></Card>
   <Card><CardHeader><CardTitle className="text-base">Windows-компонент ОКБ</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
    <p>Отдельный компонент использует установленный КриптоПро CSP и CAdES COM. Компонент НБКИ продолжает работать независимо.</p>
    <a href="/okb-agent.zip?v=1.0" download className="underline">Скачать компонент ОКБ 1.0 и сертификаты</a>
    <p>Распакуйте архив. Создайте ключ подключения и запустите установщик под владельцем сертификата:</p><code className="block break-all">{`.\\Install-OkbAgent.ps1 -CrmUrl "${window.location.origin}/api"`}</code>
    <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{const r=await api.okb.action<{token:string}>('agent_create');setToken(r.token);})}>Создать ключ подключения ОКБ</Button>
    {token&&<div><Input readOnly value={token} aria-label="Ключ подключения ОКБ"/><p>Показывается один раз. Вставьте в установщик.</p><Button variant="ghost" onClick={()=>setToken('')}>Скрыть ключ</Button></div>}
    {state?.agents.map(a=><div key={a.id} className="border-t pt-3">ПК #{a.id} · {a.active?'доступ активен':'доступ отозван'} · последняя связь: {a.last_seen_at?new Date(a.last_seen_at).toLocaleString('ru-RU'):'ещё не подключён'}{a.diagnostic.error&&<p className="text-destructive">{a.diagnostic.error}</p>}{a.diagnostic.receipt_error&&<p className="text-destructive">{a.diagnostic.receipt_error}</p>}{a.active&&<Button variant="outline" size="sm" disabled={busy} onClick={()=>void run(async()=>{await api.okb.action('agent_revoke',{id:a.id});})}>Отозвать доступ</Button>}</div>)}
   </CardContent></Card>
  </div>
 </div>;
}
