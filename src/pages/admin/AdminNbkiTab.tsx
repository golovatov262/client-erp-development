import { useEffect, useState } from "react";
import NbkiExchangePanel, { NbkiView } from "./NbkiExchangePanel";
import api, { NbkiCrmEvents, NbkiImportResult, NbkiSummary, humanizeError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const receiptLabel: Record<string, string> = {
  accepted: "Все события приняты",
  partial: "Принята часть событий",
  received: "Файл получен",
  rejected: "Отклонён",
  unknown: "Ожидается квитанция",
};

const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
};

const gzipFile = async (file: File): Promise<string> => {
  const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
  return toBase64(await new Response(stream).arrayBuffer());
};

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaultEventPeriod = () => {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 3);
  return { from: dateInputValue(from), to: dateInputValue(to) };
};

const AdminNbkiTab = () => {
  const [view, setView] = useState<NbkiView>("operations");
  const [summary, setSummary] = useState<NbkiSummary | null>(null);
  const [error, setError] = useState("");
  const [batchResult, setBatchResult] = useState("");
  const [crmEvents, setCrmEvents] = useState<NbkiCrmEvents | null>(null);
  const [eventPeriodFrom, setEventPeriodFrom] = useState(() => defaultEventPeriod().from);
  const [eventPeriodTo, setEventPeriodTo] = useState(() => defaultEventPeriod().to);
  const [loadedEventPeriod, setLoadedEventPeriod] = useState(() => defaultEventPeriod());
  const [eventPeriodLoading, setEventPeriodLoading] = useState(false);
  const [buildingEventId, setBuildingEventId] = useState<number | null>(null);
  const [buildingEventBatch, setBuildingEventBatch] = useState(false);
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [confirmingReceipt, setConfirmingReceipt] = useState(false);
  const [uploadVersion, setUploadVersion] = useState(0);
  const [importResult, setImportResult] = useState<NbkiImportResult | null>(null);

  const refresh = async () => {
    setError("");
    try {
      const [nextSummary, events] = await Promise.all([
        api.nbki.summary(),
        api.nbki.crmEvents(),
      ]);
      setSummary(nextSummary);
      setCrmEvents(events);
      const period = { from: events.period.from || eventPeriodFrom, to: events.period.to || eventPeriodTo };
      setEventPeriodFrom(period.from);
      setEventPeriodTo(period.to);
      setLoadedEventPeriod(period);
    } catch (e) { setError(humanizeError(e)); }
  };

  useEffect(() => { void refresh(); }, []);

  const loadEventPeriod = async () => {
    setEventPeriodLoading(true);
    setError("");
    try {
      const events = await api.nbki.crmEvents(eventPeriodFrom, eventPeriodTo);
      setCrmEvents(events);
      setLoadedEventPeriod({ from: eventPeriodFrom, to: eventPeriodTo });
    } catch (e) { setError(humanizeError(e)); }
    finally { setEventPeriodLoading(false); }
  };

  const downloadEvent23 = async (eventId: number) => {
    setBuildingEventId(eventId);
    setError("");
    try {
      const { file_name, content_base64 } = await api.nbki.event23Xml(eventId);
      const binary = atob(content_base64);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/xml;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file_name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(humanizeError(e)); }
    finally { setBuildingEventId(null); }
  };

  const downloadEvent23Batch = async () => {
    const ids = (crmEvents?.rows || []).filter(event => event.readiness.can_generate_xml).map(event => event.id);
    if (!ids.length) return;
    setBuildingEventBatch(true);
    setBatchResult("");
    setError("");
    try {
      const result = await api.nbki.event23BatchXml(ids);
      const binary = atob(result.content_base64);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/xml;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.file_name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const excludedNote = result.excluded.length
        ? `\nИсключены для проверки:\n${result.excluded.map(event => {
            const source = (crmEvents?.rows || []).find(row => row.id === event.event_id);
            return `#${event.event_id}${source ? ` · ${source.contract_no} · платёж #${source.source_id}` : ""}: ${event.reason}`;
          }).join("\n")}`
        : "";
      setBatchResult(`Пакет XML: сформировано ${result.events.length} событий по ${new Set(result.events.map(event => event.uid)).size} заёмщикам; исключено для проверки: ${result.excluded.length}.${excludedNote}`);
    } catch (e) { setError(humanizeError(e)); }
    finally { setBuildingEventBatch(false); }
  };

  const confirmReceipt = async () => {
    if (!xmlFiles.length && !receiptFiles.length) return;
    setConfirmingReceipt(true);
    setError("");
    setImportResult(null);
    try {
      const xml = await Promise.all(xmlFiles.map(gzipFile));
      const receipts = await Promise.all(receiptFiles.map(async file => toBase64(await file.arrayBuffer())));
      const result = await api.nbki.importHistorical(xml, receipts);
      setImportResult(result);
      setXmlFiles([]);
      setReceiptFiles([]);
      setUploadVersion(version => version + 1);
      await refresh();
    } catch (e) { setError(humanizeError(e)); }
    finally { setConfirmingReceipt(false); }
  };

  const periodPending = eventPeriodLoading || eventPeriodFrom !== loadedEventPeriod.from || eventPeriodTo !== loadedEventPeriod.to;
  const readyCount = crmEvents?.rows.filter(e=>e.readiness.can_generate_xml).length ?? 0;
  const blockedCount = crmEvents?.rows.filter(e=>!e.readiness.can_generate_xml).length ?? 0;
  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">НБКИ · Эксперт Финанс</h2>
          <p className="text-sm text-muted-foreground">Подготовка событий, отправка и контроль принятия НБКИ</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>Обновить</Button>
      </div>

      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <nav aria-label="Разделы НБКИ" className="flex flex-wrap gap-1 border-b pb-3">
        {([['operations','Текущая работа'],['history','История'],['settings','Настройки']] as const).map(([key,label])=><Button key={key} variant={view===key?'default':'ghost'} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</Button>)}
      </nav>
      <div hidden={view!=='operations'} className="space-y-4">
      <p className="text-sm text-muted-foreground">Проверьте события → отправьте готовые → дождитесь результата. Принятые события уходят из очереди; отклонённые требуют исправления перед повторной отправкой.</p>
      <Card>
        <CardHeader><CardTitle className="text-base">1. Проверить события · {crmEvents?.total ?? "…"}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2"><Badge variant="secondary">Можно сформировать: {crmEvents?readyCount:'…'}</Badge><Badge variant="outline">Требуют исправления: {crmEvents?blockedCount:'…'}</Badge></div>
          <p className="text-muted-foreground">Количество — это события CRM, а не файлы и не только платежи. Один пакет может содержать несколько событий. Принятые и уже отправленные события повторно не включаются.</p>
          <details><summary className="cursor-pointer text-muted-foreground">Какие события попадают в очередь</summary><p className="mt-2 text-muted-foreground">Платежи, изменения условий и обеспечения, закрытие обязательств. Задолженность передаётся при платеже, наступлении срока платежа, возникновении просрочки и не реже раза в 31 день. Связанные начисления и платёж включаются вместе; ежедневных выгрузок только из-за роста процентов нет.</p></details>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">События с (МСК)<input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" type="date" value={eventPeriodFrom} onChange={event => setEventPeriodFrom(event.target.value)} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">по (МСК)<input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" type="date" value={eventPeriodTo} onChange={event => setEventPeriodTo(event.target.value)} /></label>
            <Button variant="outline" onClick={() => void loadEventPeriod()} disabled={eventPeriodLoading || !eventPeriodFrom || !eventPeriodTo || eventPeriodFrom > eventPeriodTo}>
              {eventPeriodLoading ? "Загружаю события…" : "Показать период"}
            </Button>

          </div>
          <p className="text-xs text-muted-foreground">Период: {loadedEventPeriod.from} — {loadedEventPeriod.to}; непринятых событий: {crmEvents?.total ?? "…"}. Незавершённые события до начала периода также показаны.</p>
          {crmEvents?.exported_through && <p className="text-xs text-muted-foreground">Последняя дата событий в отправленных файлах: {crmEvents.exported_through}. Новый период начинается со следующего дня.</p>}
          <details className="py-2"><summary className="cursor-pointer text-muted-foreground">Дополнительно: скачать XML для ручной отправки</summary><p className="my-2 text-xs text-muted-foreground">Для обычной работы используйте «Отправить в НБКИ» ниже. Скачивание XML не отправляет файл и не подтверждает его приём.</p>            <Button variant="outline" onClick={() => void downloadEvent23Batch()} disabled={!crmEvents?.rows.some(event => event.readiness.can_generate_xml) || buildingEventId !== null || buildingEventBatch || eventPeriodFrom !== loadedEventPeriod.from || eventPeriodTo !== loadedEventPeriod.to}>
              {buildingEventBatch ? "Формирую пакет XML…" : "Скачать XML готовых событий"}
            </Button>
          </details>
          {batchResult && <p role="status" className="whitespace-pre-wrap text-sm">{batchResult}</p>}
          <div className="max-h-96 overflow-y-auto">
            {!!crmEvents?.debt_scan_issues?.length && <div className="rounded-md border p-3 text-sm"><div className="font-medium">Требуют проверки данные задолженности</div>{crmEvents.debt_scan_issues.map(issue => <div key={issue.loan_id}>{issue.contract_no}: {issue.reason}</div>)}</div>}
            {crmEvents?.rows.map(event => <div key={event.id} className="border-b py-2">
              <Badge variant="outline" className="mr-2">{event.source_type.match(/FL_Event_([0-9_]+)/)?.[1]?.replace(/_/g, ".") || "2.3"} · {event.source_type.startsWith("guarantor_") ? "Поручитель" : "Заёмщик"}</Badge>
              {event.earlier_period && <Badge variant="outline" className="mr-2">Предыдущий период</Badge>}<span className="font-medium">{event.contract_no}</span> · {event.source_type === "loan_payment" ? `платёж #${event.source_id}` : ({close: "Закрытие обязательств", terms_change: "Изменение условий", debt_change: "Изменение задолженности", collateral_change: "Изменение обеспечения", guarantor_change: "Изменение поручительства", guarantor_debt_change: "Задолженность поручителя"} as Record<string, string>)[event.event_kind] || event.event_kind}{event.source_type === "loan_payment" && <> · {event.payment_date || "дата неизвестна"} · {event.payment.amount ?? "—"} ₽</>}
              <details className="mt-1"><summary className="cursor-pointer text-xs text-muted-foreground">Реквизиты и учётные данные</summary><div className="text-xs text-muted-foreground">УИД {event.uid || "не сопоставлен"} · время {event.event_occurred_at ? new Date(event.event_occurred_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " МСК" : "не установлено"} · снимок {event.has_posting_snapshot ? "сохранён" : "для старого платежа отсутствует"} · {event.source_type === "loan_payment" ? (event.components_match ? "части платежа сходятся" : "проверить части платежа") : "операция CRM"}</div></details>
              <div className="mt-1 text-xs">
                <Badge variant={event.status === "accepted" ? "default" : "secondary"}>{({ accepted: "Принято НБКИ", exported: "Ожидает ticket2", rejected: "Отклонено НБКИ", new: "Новое" } as Record<string, string>)[event.status] || event.status}</Badge>
                {event.delivery.file && <span className="ml-2">Файл {event.delivery.file}</span>}
                {event.source_type !== "loan_payment" && ["new","rejected"].includes(event.status) && <Button size="sm" variant="outline" className="ml-2" onClick={async () => { try { await api.loans.nbkiRefreshEvent(event.id); await loadEventPeriod(); } catch (err) { setBatchResult(err instanceof Error ? err.message : "Не удалось обновить реквизиты"); } }}>Обновить исправленные реквизиты</Button>}
                {event.delivery.errors.map((err, index) => <div key={index} className="text-destructive">{err.block} · {err.field}: {err.message}{err.value ? ` (значение: ${err.value})` : ""}</div>)}
                {event.status === "rejected" && event.readiness.can_generate_xml && <div>Данные изменены и проверены генератором; проверьте замечания НБКИ перед повторной отправкой</div>}

                {event.readiness.can_generate_xml ? "XML можно сформировать" : "XML заблокирован"}
                {event.readiness.xsd_status === "valid" && " · XSD пройдена"}
                {event.readiness.xsd_status === "accepted_deviations" && " · XSD: исключения sizeCode/scheduleCode; строгая проверка не пройдена"}
                {event.readiness.can_generate_xml && !event.readiness.ready_to_send && " · требуется проверка перед отправкой"}
                {event.readiness.blockers.map(reason => <div key={reason} className="text-destructive">{reason}</div>)}
              </div>
              <details className="mt-2"><summary className="cursor-pointer text-xs text-muted-foreground">Скачать XML этого события</summary><Button className="mt-2" size="sm" variant="outline" onClick={() => void downloadEvent23(event.id)} disabled={!event.readiness.can_generate_xml || buildingEventId !== null || buildingEventBatch}>
                {buildingEventId === event.id ? "Формирую XML…" : "Скачать XML без отправки"}
              </Button></details>
            </div>)}
            {crmEvents && !crmEvents.total && <p className="text-muted-foreground">Непринятых событий за выбранный период и более ранние даты нет.</p>}
          </div>
        </CardContent>
      </Card>

      </div>
      <NbkiExchangePanel view={view} periodPending={periodPending} onSettings={()=>setView('settings')} eventIds={(crmEvents?.rows||[]).filter(e=>e.readiness.can_generate_xml).map(e=>e.id)} onChange={()=>void refresh()} />
      {view==='operations'&&!!summary?.files.length&&<section className="rounded-lg border p-4 space-y-3" aria-label="Последние результаты">
        <div className="flex flex-wrap justify-between items-center gap-2"><h3 className="font-semibold text-sm">Последние результаты обработки</h3><Button variant="ghost" size="sm" onClick={()=>setView('history')}>Вся история</Button></div>
        {summary.files.slice(0,3).map(file=><div key={file.reg_number} className="text-sm border-t pt-2">
          <div className="break-all text-xs text-muted-foreground">{file.reg_number}</div>
          <div className="mt-1">{receiptLabel[file.receipt_status]||file.receipt_status}{['accepted','partial','rejected'].includes(file.receipt_status)&&` · принято ${file.events_accepted}, отклонено ${file.events_rejected}`}</div>
          {file.errors.length>0&&<button className="text-destructive underline text-xs" onClick={()=>setView('history')}>Посмотреть ошибки в истории</button>}
        </div>)}
      </section>}
      <div hidden={view!=='history'} className="space-y-5">
      <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Ручная загрузка XML и квитанций</summary>
      <Card className="mt-3 border-0 shadow-none">
        <CardHeader><CardTitle className="text-base">Файлы, отправленные вне CRM</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Используйте только для отправки через личный кабинет НБКИ или переноса старых файлов. При автоматическом обмене XML и квитанции сохраняются сами. Загрузите отправленный XML и полученные ticket1 / ticket2 вместе или по отдельности — CRM сопоставит их по регистрационному номеру.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">Отправленный XML
              <input className="block w-full rounded-md border p-2 text-sm" key={`xml-${uploadVersion}`} type="file" accept=".xml,text/xml,application/xml" multiple onChange={event => setXmlFiles(Array.from(event.target.files || []))} />
            </label>
            <label className="space-y-1 text-sm">Квитанции XML или ZIP
              <input className="block w-full rounded-md border p-2 text-sm" key={`receipt-${uploadVersion}`} type="file" accept=".xml,.zip,text/xml,application/xml,application/zip" multiple onChange={event => setReceiptFiles(Array.from(event.target.files || []))} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={(!xmlFiles.length && !receiptFiles.length) || confirmingReceipt} onClick={() => void confirmReceipt()}>{confirmingReceipt ? "Сопоставляем…" : "Загрузить и обработать"}</Button>
            <span className="text-xs text-muted-foreground">Выбрано: {xmlFiles.length} XML, {receiptFiles.length} квитанций</span>
          </div>
          {importResult && <p role="status" className="text-sm">Обработано файлов: {importResult.files}. Принято: {importResult.event_results.accepted ?? 0}; отклонено: {importResult.event_results.rejected ?? 0}; ожидают квитанцию: {importResult.event_results.pending ?? 0}.{importResult.unmatched_events > 0 && ` Не сопоставлено с событиями CRM: ${importResult.unmatched_events}. Статусы этих событий CRM не изменены.`}</p>}
        </CardContent>
      </Card>

      </details>
      <Card>
        <CardHeader><CardTitle className="text-base">Результаты обработки файлов</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!summary?.files.length && <p className="text-sm text-muted-foreground">История пока пуста. Здесь появятся отправленные файлы и результаты их обработки.</p>}
          {summary?.files.map(file => (
            <div key={file.reg_number} className="border-b py-2 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="break-all font-mono text-xs">{file.reg_number}</div>
                  <div className="text-xs text-muted-foreground">Схема {file.schema_version} · {file.subjects_count} субъектов · {file.events_count} событий</div>
                </div>
                <div className="text-right">
                  <Badge variant={file.receipt_status === "accepted" ? "default" : "secondary"}>{receiptLabel[file.receipt_status] || file.receipt_status}</Badge>
                  {["accepted", "partial", "rejected"].includes(file.receipt_status) && <div className="mt-1 text-xs text-muted-foreground">Принято {file.events_accepted}, отклонено {file.events_rejected}</div>}
                  {!file.receipt_signature_verified && file.receipt_status !== "unknown" && <div className="text-xs text-amber-700">Подпись квитанции требует проверки CryptoPro</div>}
                </div>
              </div>
              {file.errors.length > 0 && <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-destructive">Ошибки квитанции: {file.errors.length}</summary>
                <div className="mt-1 space-y-1 text-xs">
                  {file.errors.map((err, index) => <div key={index} className="rounded border border-destructive/30 bg-destructive/5 p-1.5">
                    <span className="font-mono">{err.error_code}</span>{err.uid && <> · УИД {err.uid}</>}{err.block_name && <> · блок {err.block_name}</>}{err.field_name && <> · поле {err.field_name}{err.field_value ? ` = ${err.field_value}` : ""}</>}
                    {err.error_message && <div className="text-muted-foreground">{err.error_message}</div>}
                  </div>)}
                </div>
              </details>}
            </div>
          ))}
        </CardContent>
      </Card>
      </div>
    </div>
  );
};

export default AdminNbkiTab;
