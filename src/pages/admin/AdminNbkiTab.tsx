import { useEffect, useState } from "react";
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
    const ids = (crmEvents?.rows || []).filter(event => event.source_type === "loan_payment" && event.readiness.can_generate_xml).map(event => event.id);
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
      setBatchResult(`Пакет XML 2.3: сформировано ${result.events.length} событий по ${new Set(result.events.map(event => event.uid)).size} заёмщикам; исключено для проверки: ${result.excluded.length}.${excludedNote}`);
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

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">НБКИ · Эксперт Финанс</h2>
          <p className="text-sm text-muted-foreground">Формирование файлов ГУТДФ для НБКИ по данным CRM</p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>Обновить</Button>
      </div>

      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Исходящие события из CRM · {crmEvents?.total ?? "…"}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted-foreground">Очередь берётся из CRM: включённые договоры со статусом «активный», «просроченный» или «кредитные каникулы». Принятые события и события, ожидающие квитанцию, повторно не выгружаются. После отказа исправьте указанные данные: изменённое событие включится в следующий пакет, если пройдёт проверку. Готовность рассчитывается теми же проверками, что используются при формировании XML; исключённые события показываются с номером договора и причиной. Скачанный XML нужно подписать и зашифровать локально CryptoPro и отправить в НБКИ самостоятельно.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">События с (МСК)<input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" type="date" value={eventPeriodFrom} onChange={event => setEventPeriodFrom(event.target.value)} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">по (МСК)<input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" type="date" value={eventPeriodTo} onChange={event => setEventPeriodTo(event.target.value)} /></label>
            <Button variant="outline" onClick={() => void loadEventPeriod()} disabled={eventPeriodLoading || !eventPeriodFrom || !eventPeriodTo || eventPeriodFrom > eventPeriodTo}>
              {eventPeriodLoading ? "Загружаю события…" : "Показать период"}
            </Button>
            <Button variant="outline" onClick={() => void downloadEvent23Batch()} disabled={!crmEvents?.rows.some(event => event.source_type === "loan_payment" && event.readiness.can_generate_xml) || buildingEventId !== null || buildingEventBatch || eventPeriodFrom !== loadedEventPeriod.from || eventPeriodTo !== loadedEventPeriod.to}>
              {buildingEventBatch ? "Формирую пакет XML…" : "Выгрузить новые и исправленные события"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Период: {loadedEventPeriod.from} — {loadedEventPeriod.to}; непринятых событий: {crmEvents?.total ?? "…"}. Незавершённые события до начала периода также показаны.</p>
          {crmEvents?.exported_through && <p className="text-xs text-muted-foreground">Последняя дата событий в отправленных файлах: {crmEvents.exported_through}. Новый период начинается со следующего дня.</p>}
          {batchResult && <p role="status" className="whitespace-pre-wrap text-sm">{batchResult}</p>}
          <div className="max-h-96 overflow-y-auto">
            {crmEvents?.rows.map(event => <div key={event.id} className="border-b py-2">
              {event.earlier_period && <Badge variant="outline" className="mr-2">Предыдущий период</Badge>}<span className="font-medium">{event.contract_no}</span> · платёж #{event.source_id} · {event.payment_date || "дата неизвестна"} · {event.payment.amount ?? "—"} ₽
              <div className="text-xs text-muted-foreground">УИД {event.uid || "не сопоставлен"} · время {event.event_occurred_at ? new Date(event.event_occurred_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " МСК" : "не установлено"} · снимок {event.has_posting_snapshot ? "сохранён" : "для старого платежа отсутствует"} · {event.components_match ? "части платежа сходятся" : "проверить части платежа"}</div>
              <div className="mt-1 text-xs">
                <Badge variant={event.status === "accepted" ? "default" : "secondary"}>{({ accepted: "Принято НБКИ", exported: "Ожидает ticket2", rejected: "Отклонено НБКИ", new: "Новое" } as Record<string, string>)[event.status] || event.status}</Badge>
                {event.delivery.file && <span className="ml-2">Файл {event.delivery.file}</span>}
                {event.delivery.errors.map((err, index) => <div key={index} className="text-destructive">{err.block} · {err.field}: {err.message}{err.value ? ` (значение: ${err.value})` : ""}</div>)}
                {event.status === "rejected" && event.readiness.can_generate_xml && <div>Данные изменены и проверены генератором; проверьте замечания НБКИ перед повторной отправкой</div>}

                {event.readiness.can_generate_xml ? "XML можно сформировать" : "XML заблокирован"}
                {event.readiness.xsd_status === "valid" && " · XSD пройдена"}
                {event.readiness.xsd_status === "accepted_deviations" && " · XSD: исключения sizeCode/scheduleCode; строгая проверка не пройдена"}
                {event.readiness.can_generate_xml && !event.readiness.ready_to_send && " · требуется проверка перед отправкой"}
                {event.readiness.blockers.map(reason => <div key={reason} className="text-destructive">{reason}</div>)}
              </div>
              <Button className="mt-2" size="sm" variant="outline" onClick={() => void downloadEvent23(event.id)} disabled={!event.readiness.can_generate_xml || buildingEventId !== null || buildingEventBatch}>
                {buildingEventId === event.id ? "Формирую XML…" : event.status === "rejected" ? "Повторно выгрузить событие" : "Сформировать XML 2.3"}
              </Button>
            </div>)}
            {crmEvents && !crmEvents.total && <p className="text-muted-foreground">Непринятых событий за выбранный период и более ранние даты нет.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Отправленные файлы и квитанции</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">После отправки в НБКИ загрузите отправленный XML. Когда получите ticket1 или ticket2, загрузите квитанцию отдельно — CRM найдёт файл по регистрационному номеру. Можно загрузить XML и квитанции вместе. Ticket1 подтверждает получение; ticket2 отмечает принятые и отклонённые события.</p>
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

      <Card>
        <CardHeader><CardTitle className="text-base">Исходные выгрузки и квитанции</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!summary?.files.length && <p className="text-sm text-muted-foreground">Файлы пока не импортированы.</p>}
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
  );
};

export default AdminNbkiTab;
