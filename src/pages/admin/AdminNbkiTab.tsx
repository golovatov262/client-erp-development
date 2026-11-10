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
  unknown: "Квитанция не загружена",
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
  const [syncingFacts, setSyncingFacts] = useState(false);
  const [factsResult, setFactsResult] = useState("");
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
  const [importResult, setImportResult] = useState<NbkiImportResult | null>(null);

  const refresh = async () => {
    try {
      const [nextSummary, events] = await Promise.all([
        api.nbki.summary(),
        api.nbki.crmEvents(eventPeriodFrom, eventPeriodTo),
      ]);
      setSummary(nextSummary);
      setCrmEvents(events);
      setLoadedEventPeriod({ from: eventPeriodFrom, to: eventPeriodTo });
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

  const sync1CFacts = async () => {
    setSyncingFacts(true);
    setError("");
    try {
      const result = await api.nbki.sync1CFacts();
      setFactsResult(`Последний отчёт 1С: ${result.source_last_event_time}. Действующих договоров с однозначным сопоставлением: ${result.matched_active}; заполнено: ${result.created}, обновлено: ${result.updated}, без изменений: ${result.unchanged}. Конфликтов: ${result.conflict}.`);
    } catch (e) { setError(humanizeError(e)); }
    finally { setSyncingFacts(false); }
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
    const ids = (crmEvents?.rows || []).filter(event => event.source_type === "loan_payment").map(event => event.id);
    if (!ids.length) return;
    setBuildingEventBatch(true);
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
      setFactsResult(`Пакет XML 2.3: сформировано ${result.events.length} событий по ${new Set(result.events.map(event => event.uid)).size} заёмщикам; исключено для проверки: ${result.excluded.length}.${excludedNote}`);
    } catch (e) { setError(humanizeError(e)); }
    finally { setBuildingEventBatch(false); }
  };

  const confirmReceipt = async () => {
    if (!xmlFiles.length || !receiptFiles.length) return;
    setConfirmingReceipt(true);
    setError("");
    setImportResult(null);
    try {
      const xml = await Promise.all(xmlFiles.map(gzipFile));
      const receipts = await Promise.all(receiptFiles.map(async file => toBase64(await file.arrayBuffer())));
      const result = await api.nbki.importHistorical(xml, receipts);
      setImportResult(result);
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
          <p className="text-muted-foreground">Очередь берётся из CRM: включённые договоры со статусом «активный», «просроченный» или «кредитные каникулы». Пакет проходит проверку XSD 5.1; исключённые события показываются с номером договора и причиной. Скачанный XML нужно подписать и зашифровать локально CryptoPro и отправить в НБКИ самостоятельно.</p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">События с (МСК)<input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" type="date" value={eventPeriodFrom} onChange={event => setEventPeriodFrom(event.target.value)} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">по (МСК)<input className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" type="date" value={eventPeriodTo} onChange={event => setEventPeriodTo(event.target.value)} /></label>
            <Button variant="outline" onClick={() => void loadEventPeriod()} disabled={eventPeriodLoading || !eventPeriodFrom || !eventPeriodTo || eventPeriodFrom > eventPeriodTo}>
              {eventPeriodLoading ? "Загружаю события…" : "Показать период"}
            </Button>
            <Button variant="outline" onClick={() => void downloadEvent23Batch()} disabled={!crmEvents?.rows.some(event => event.source_type === "loan_payment") || buildingEventId !== null || buildingEventBatch || eventPeriodFrom !== loadedEventPeriod.from || eventPeriodTo !== loadedEventPeriod.to}>
              {buildingEventBatch ? "Формирую пакет XML…" : "Сформировать XML 2.3 за период"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Период: {loadedEventPeriod.from} — {loadedEventPeriod.to}; в очереди {crmEvents?.total ?? "…"} событий.</p>
          <div className="max-h-96 overflow-y-auto">
            {crmEvents?.rows.map(event => <div key={event.id} className="border-b py-2">
              <span className="font-medium">{event.contract_no}</span> · платёж #{event.source_id} · {event.payment_date || "дата неизвестна"} · {event.payment.amount ?? "—"} ₽
              <div className="text-xs text-muted-foreground">УИД {event.uid || "не сопоставлен"} · время {event.event_occurred_at ? new Date(event.event_occurred_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " МСК" : "не установлено"} · снимок {event.has_posting_snapshot ? "сохранён" : "для старого платежа отсутствует"} · {event.components_match ? "части платежа сходятся" : "проверить части платежа"}</div>
              <Button className="mt-2" size="sm" variant="outline" onClick={() => void downloadEvent23(event.id)} disabled={!event.uid || !event.event_occurred_at || buildingEventId !== null}>
                {buildingEventId === event.id ? "Формирую XML…" : "Сформировать XML 2.3"}
              </Button>
            </div>)}
            {crmEvents && !crmEvents.total && <p className="text-muted-foreground">Новых событий после запуска журнала пока нет.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Показатели 1С для новых займов</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Переносит показатели из уже загруженного отчёта событий 1С (ПСК, признак блоков ФЛ_22/ФЛ_55) в карточки займов, впервые получивших сопоставленный УИД. Учётные суммы, даты и платежи при этом не изменяются.</p>
          <Button variant="outline" disabled={syncingFacts} onClick={() => void sync1CFacts()}>{syncingFacts ? "Переношу…" : "Перенести показатели 1С в карточки"}</Button>
          {factsResult && <p role="status" className="whitespace-pre-wrap text-sm">{factsResult}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Подтвердить приём нового файла</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">После отправки сформированного здесь файла в НБКИ и получения квитанции — загрузите сюда тот же XML и расшифрованную ZIP-квитанцию к нему, чтобы зафиксировать результат приёма. Если в квитанции есть отказы — готовьте корректировочный файл по требованиям НБКИ отдельно.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">Отправленный XML
              <input className="block w-full rounded-md border p-2 text-sm" type="file" accept=".xml,text/xml,application/xml" multiple onChange={event => setXmlFiles(Array.from(event.target.files || []))} />
            </label>
            <label className="space-y-1 text-sm">ZIP-квитанция
              <input className="block w-full rounded-md border p-2 text-sm" type="file" accept=".zip,application/zip" multiple onChange={event => setReceiptFiles(Array.from(event.target.files || []))} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!xmlFiles.length || !receiptFiles.length || confirmingReceipt} onClick={() => void confirmReceipt()}>{confirmingReceipt ? "Сопоставляем…" : "Подтвердить приём"}</Button>
            <span className="text-xs text-muted-foreground">Выбрано: {xmlFiles.length} XML, {receiptFiles.length} квитанций</span>
          </div>
          {importResult && <p role="status" className="text-sm">Обработано {importResult.unique_deals} УИД: {importResult.matched} сопоставлено. По квитанциям принято {importResult.reported_accepted_deals} договоров.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Исходные выгрузки и квитанции</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!summary?.files.length && <p className="text-sm text-muted-foreground">Файлы пока не импортированы.</p>}
          {summary?.files.map(file => (
            <div key={file.reg_number} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-b-0">
              <div className="min-w-0">
                <div className="break-all font-mono text-xs">{file.reg_number}</div>
                <div className="text-xs text-muted-foreground">Схема {file.schema_version} · {file.subjects_count} субъектов · {file.events_count} событий</div>
              </div>
              <div className="text-right">
                <Badge variant={file.receipt_status === "accepted" ? "default" : "secondary"}>{receiptLabel[file.receipt_status] || file.receipt_status}</Badge>
                {file.receipt_status === "accepted" && <div className="mt-1 text-xs text-muted-foreground">Принято {file.events_accepted}, отклонено {file.events_rejected}</div>}
                {!file.receipt_signature_verified && file.receipt_status !== "unknown" && <div className="text-xs text-amber-700">Подпись квитанции требует проверки CryptoPro</div>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminNbkiTab;
