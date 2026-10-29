import { useEffect, useState } from "react";
import api, { NbkiChangeCandidate, NbkiDeal, NbkiDraft, NbkiEventDeal, NbkiEventImportResult, NbkiImportResult, NbkiInspection, NbkiPaymentCandidates, NbkiReadinessReport, NbkiReconciliationReport, NbkiSummary, humanizeError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statuses = [
  { value: "all", label: "Все" },
  { value: "matched", label: "Сопоставлены" },
  { value: "review", label: "Проверить" },
  { value: "not_in_crm", label: "Нет в CRM" },
  { value: "guarantor", label: "Поручители" },
];

const receiptLabel: Record<string, string> = {
  accepted: "Все события приняты",
  partial: "Принята часть событий",
  received: "Файл получен",
  rejected: "Отклонён",
  unknown: "Квитанция не загружена",
};

const changeLabels: Record<string, string> = {
  loan_fields: "договор",
  member_fields: "заёмщик",
  uid_changed: "УИД",
  payments: "платежи",
  schedule: "график",
  collateral: "обеспечение",
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

const AdminNbkiTab = () => {
  const [summary, setSummary] = useState<NbkiSummary | null>(null);
  const [deals, setDeals] = useState<NbkiDeal[]>([]);
  const [eventDeals, setEventDeals] = useState<NbkiEventDeal[]>([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [eventStatus, setEventStatus] = useState("all");
  const [eventOffset, setEventOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<NbkiImportResult | null>(null);
  const [eventFile, setEventFile] = useState<File | null>(null);
  const [eventImportResult, setEventImportResult] = useState<NbkiEventImportResult | null>(null);
  const [loanId, setLoanId] = useState("");
  const [inspection, setInspection] = useState<NbkiInspection | null>(null);
  const [drafts, setDrafts] = useState<NbkiDraft[]>([]);
  const [changeCandidates, setChangeCandidates] = useState<NbkiChangeCandidate[]>([]);
  const [changeCandidateTotal, setChangeCandidateTotal] = useState(0);
  const [readinessReport, setReadinessReport] = useState<NbkiReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState("");
  const [factsResult, setFactsResult] = useState("");
  const [reconciliation, setReconciliation] = useState<NbkiReconciliationReport | null>(null);
  const [paymentCandidates, setPaymentCandidates] = useState<NbkiPaymentCandidates | null>(null);

  const refreshOutbox = async () => {
    try {
      const [outbox, candidates, payments] = await Promise.all([api.nbki.outbox(), api.nbki.changeCandidates(), api.nbki.paymentCandidates()]);
      setDrafts(outbox.rows);
      setChangeCandidates(candidates.rows);
      setChangeCandidateTotal(candidates.total);
      setPaymentCandidates(payments);
    }
    catch (e) { setError(humanizeError(e)); }
  };

  useEffect(() => { void refreshOutbox(); }, []);

  const loadReadiness = async () => {
    setReadinessLoading(true);
    setError("");
    try { setReadinessReport(await api.nbki.readinessReport()); }
    catch (e) { setError(humanizeError(e)); }
    finally { setReadinessLoading(false); }
  };

  const sync1CFacts = async () => {
    setImporting(true);
    setError("");
    try {
      const result = await api.nbki.sync1CFacts();
      setFactsResult(`Последний отчёт 1С: ${result.source_last_event_time}. Действующих договоров с однозначным сопоставлением: ${result.matched_active}; заполнено: ${result.created}, обновлено: ${result.updated}, без изменений: ${result.unchanged}. Конфликтов: ${result.conflict}.`);
      await loadReadiness();
    } catch (e) { setError(humanizeError(e)); }
    finally { setImporting(false); }
  };

  const loadReconciliation = async () => {
    setReadinessLoading(true);
    setError("");
    try { setReconciliation(await api.nbki.reconciliationReport()); }
    catch (e) { setError(humanizeError(e)); }
    finally { setReadinessLoading(false); }
  };

  const inspect = async (save: boolean) => {
    const id = Number(loanId);
    if (!Number.isInteger(id) || id <= 0) { setError("Укажите номер займа CRM (ID)"); return; }
    setOutboxLoading(true);
    setError("");
    try {
      if (save) {
        await api.nbki.createDraft(id);
        await refreshOutbox();
      }
      setInspection(await api.nbki.inspectLoan(id));
    } catch (e) { setError(humanizeError(e)); }
    finally { setOutboxLoading(false); }
  };

  const createAll = async () => {
    setOutboxLoading(true);
    setError("");
    try {
      const result = await api.nbki.createAllDrafts();
      setBulkResult(`Проверено ${result.total} действующих займов (активные, просроченные, каникулы): создано ${result.created} снимков, ${result.unchanged} без изменений, ${result.with_crm_issues} с замечаниями CRM. Новых кандидатов изменений: ${result.change_candidates}. К отправке: 0.`);
      await refreshOutbox();
    } catch (e) { setError(humanizeError(e)); }
    finally { setOutboxLoading(false); }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, nextDeals, nextEventDeals] = await Promise.all([
        api.nbki.summary(),
        api.nbki.deals(status, offset),
        api.nbki.eventDeals(eventStatus, eventOffset),
      ]);
      setSummary(nextSummary);
      setDeals(nextDeals.rows);
      setTotal(nextDeals.total);
      setEventDeals(nextEventDeals.rows);
      setEventTotal(nextEventDeals.total);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, offset, eventStatus, eventOffset]);

  const importFiles = async () => {
    if (!xmlFiles.length) return;
    setImporting(true);
    setError("");
    setImportResult(null);
    try {
      const xml = await Promise.all(xmlFiles.map(gzipFile));
      const receipts = await Promise.all(receiptFiles.map(async file => toBase64(await file.arrayBuffer())));
      const result = await api.nbki.importHistorical(xml, receipts);
      setImportResult(result);
      await load();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setImporting(false);
    }
  };

  const importEventFile = async () => {
    if (!eventFile) return;
    setImporting(true);
    setError("");
    setEventImportResult(null);
    try {
      const result = await api.nbki.importEvents(await gzipFile(eventFile), eventFile.name);
      setEventImportResult(result);
      await load();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setImporting(false);
    }
  };

  const exportRegistry = async (targetStatus: "review" | "not_in_crm" | "missing_uid" | "readiness" | "reconciliation") => {
    setExporting(true);
    setError("");
    try {
      const { file_name, content_base64 } = await api.nbki.exportRegistry(targetStatus);
      const binary = atob(content_base64);
      const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = file_name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">НБКИ · Эксперт Финанс</h2>
          <p className="text-sm text-muted-foreground">Исторические УИД и результаты сопоставления с договорами CRM</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportRegistry("missing_uid")} disabled={exporting}>Excel · Без УИД</Button>
          <Button variant="outline" onClick={() => void exportRegistry("readiness")} disabled={exporting}>Excel · Готовность XML</Button>
          <Button variant="outline" onClick={() => void exportRegistry("reconciliation")} disabled={exporting}>Excel · Сверка 1С / CRM</Button>
          <Button variant="outline" onClick={() => void exportRegistry("review")} disabled={exporting}>Excel · Проверить</Button>
          <Button variant="outline" onClick={() => void exportRegistry("not_in_crm")} disabled={exporting}>Excel · Нет в CRM</Button>
          <Button variant="outline" onClick={() => void load()} disabled={loading}>Обновить</Button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-base">Черновики будущей выгрузки</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Проверка реквизитов и фиксация снимка договора. Это ещё не XML ГУТДФ: схема и правила НБКИ не подтверждены, файл для отправки здесь не формируется.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className="w-40 rounded-md border p-2 text-sm" type="number" min="1" placeholder="ID займа CRM" value={loanId} onChange={event => setLoanId(event.target.value)} />
            <Button variant="outline" disabled={outboxLoading} onClick={() => void inspect(false)}>Проверить</Button>
            <Button disabled={outboxLoading} onClick={() => void inspect(true)}>Сохранить черновик</Button>
            <Button variant="outline" disabled={outboxLoading} onClick={() => void createAll()}>Черновики всех займов</Button>
          </div>
          {bulkResult && <p role="status" className="text-sm">{bulkResult}</p>}
          {inspection && <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">{inspection.contract_no} · УИД {inspection.uid || "не подтвержден"}</div>
            <div className="mt-1">{inspection.checks.crm_issues.length ? inspection.checks.crm_issues.join("; ") : "Базовые данные CRM заполнены"}</div>
            <div className="mt-1 text-muted-foreground">Проверка XSD и правил НБКИ ещё не выполнена; отправка заблокирована.</div>
            <div className="mt-2 font-medium">Не хватает для XML: {inspection.readiness.missing_fields.length}</div>
            <ul className="ml-5 list-disc text-muted-foreground">{inspection.readiness.missing_fields.map(field => <li key={field}>{field}</li>)}</ul>
            {inspection.historical_context && <details className="mt-3 border-t pt-2">
              <summary className="cursor-pointer font-medium">Последний исторический XML 1С · {inspection.historical_context.reg_number}</summary>
              <p className="mt-1 text-muted-foreground">Событие {inspection.historical_context.event_name}, {inspection.historical_context.event_time || "время не указано"}; квитанция: {receiptLabel[inspection.historical_context.receipt_status] || inspection.historical_context.receipt_status}; подпись {inspection.historical_context.receipt_signature_verified ? "проверена" : "не проверена"}. Значения ниже — только для сравнения, не текущие данные CRM.</p>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">{Object.entries(inspection.historical_context.values).filter(([, value]) => value).map(([key, value]) => <div key={key}><span className="text-muted-foreground">{key}: </span>{value}</div>)}</div>
            </details>}
          </div>}
          <div className="max-h-60 overflow-y-auto text-sm">
            {drafts.map(draft => <div key={draft.id} className="flex flex-wrap justify-between gap-2 border-b py-2">
              <span>#{draft.id} · {draft.contract_no} · займ CRM №{draft.loan_id}<span className="ml-2 font-mono text-xs text-muted-foreground" title={draft.snapshot_sha256}>SHA-256 {draft.snapshot_sha256.slice(0, 12)}…</span></span>
              <span className="text-muted-foreground">{draft.status === 'excluded' ? 'Исключён: договор закрыт' : `Заблокирован · ${draft.checks.crm_issues.length} замечаний CRM`}</span>
            </div>)}
            {!drafts.length && <p className="text-muted-foreground">Черновиков пока нет.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Готовность исходных данных</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Отчёт по активным, просроченным и договорам на каникулах. Отсутствующие расчётные показатели не заменяются предположениями из графика или старого XML.</p>
          <Button variant="outline" disabled={readinessLoading} onClick={() => void loadReadiness()}>{readinessLoading ? "Проверяем…" : "Проверить все договоры"}</Button>
          {readinessReport && <>
            <p className="text-sm">Договоров: {readinessReport.total} · с УИД: {readinessReport.with_uid} · с замечаниями CRM: {readinessReport.with_crm_issues} · готовых XML: {readinessReport.xml_ready}</p>
            <div className="max-h-72 overflow-y-auto text-sm">
              {readinessReport.rows.map(row => <details key={row.loan_id} className="border-b py-2">
                <summary className="cursor-pointer">{row.contract_no} · {row.status} · {row.uid ? "УИД есть" : "без УИД"} · пробелов {row.missing_fields.length}</summary>
                <ul className="ml-5 mt-2 list-disc text-muted-foreground">{row.missing_fields.map(field => <li key={field}>{field}</li>)}</ul>
              </details>)}
            </div>
          </>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Новые платежи CRM после последнего события 1С · {paymentCandidates?.total ?? "…"}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Только действующие договоры с однозначным УИД. Даты и суммы берутся из CRM. Это очередь кандидатов, не готовые события ГУТДФ и не XML для отправки; платежи в дату последнего события требуют отдельной проверки.</p>
          <Button variant="outline" disabled={outboxLoading} onClick={() => void refreshOutbox()}>Обновить очередь</Button>
          <div className="max-h-60 overflow-y-auto text-sm">
            {paymentCandidates?.rows.map(payment => <div key={payment.payment_id} className="border-b py-2">
              <span className="font-medium">{payment.contract_no}</span> · {payment.payment_date} · {Number(payment.amount).toLocaleString("ru-RU")} ₽ · платёж CRM #{payment.payment_id}
              <div className="text-xs text-muted-foreground">УИД {payment.uid} · последнее событие 1С {payment.baseline_event_time.slice(0, 10)} · кандидат события {payment.event_code_candidate}, код не подтверждён</div>
              <details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Предварительная проверка: {payment.crm_issues.length} замечаний CRM, {payment.missing_fields.length} блокирующих пунктов</summary>
                <p className="mt-1">{payment.event_code_candidate_basis}</p>
                <p className="mt-1">По журналу CRM: основной долг до платежа {payment.accounting_snapshot.principal_before ?? "не рассчитан"} ₽, после {payment.accounting_snapshot.principal_after ?? "не рассчитан"} ₽; сумма частей платежа {payment.accounting_snapshot.components_total ?? "не рассчитана"} ₽. {payment.accounting_snapshot.status === "checked" ? "Внутренние арифметические проверки пройдены." : "Есть арифметические замечания."} Это не расчёт задолженности для НБКИ.</p>
                <p>Распределение v2: {payment.allocation_audit.status === "checked" ? "проверено" : payment.allocation_audit.status === "unavailable" ? "нет данных" : "требует проверки"}; проценты {payment.allocation_audit.components.interest ?? "—"} ₽, основной долг {payment.allocation_audit.components.principal ?? "—"} ₽, досрочно {payment.allocation_audit.components.early_principal ?? "—"} ₽.</p>
                {payment.accounting_snapshot.issues.map((issue, index) => <p key={`accounting-${payment.payment_id}-${index}`} className="text-destructive">{issue}</p>)}
                {payment.allocation_audit.issues.map((issue, index) => <p key={`allocation-${payment.payment_id}-${index}`} className="text-destructive">{issue}</p>)}
                <ul className="ml-5 mt-1 list-disc">{[...payment.crm_issues, ...payment.missing_fields].map((issue, index) => <li key={`${payment.payment_id}-${index}`}>{issue}</li>)}</ul>
              </details>
            </div>)}
            {paymentCandidates && !paymentCandidates.total && <p className="text-muted-foreground">Новых платежей по сопоставленным договорам нет.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Изменения CRM для НБКИ · {changeCandidateTotal}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">При сохранении нового снимка сопоставленного договора фиксируются отличия от предыдущего: реквизиты, платежи, график и обеспечение. Это кандидаты на события, а не готовые файлы ГУТДФ; тип события и корректность данных ещё нужно определить.</p>
          <div className="max-h-60 overflow-y-auto text-sm">
            {changeCandidates.map(candidate => <div key={candidate.id} className="flex flex-wrap justify-between gap-2 border-b py-2">
              <span>{candidate.contract_no} · УИД {candidate.uid} · {Object.keys(candidate.change_summary).map(key => changeLabels[key] || key).join(", ")}</span>
              <span className="text-muted-foreground">{new Date(candidate.created_at).toLocaleString("ru-RU")} · ожидает определения события</span>
            </div>)}
            {!changeCandidates.length && <p className="text-muted-foreground">Изменений после исходных снимков пока нет.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Загрузить историю из 1С</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Выберите исходные XML и расшифрованные ZIP-квитанции к ним. Импорт сопоставит УИД, сохранит события и покажет расхождения. Подпись квитанций проверяется отдельно через CryptoPro.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm">XML-файлы
              <input className="block w-full rounded-md border p-2 text-sm" type="file" accept=".xml,text/xml,application/xml" multiple onChange={event => setXmlFiles(Array.from(event.target.files || []))} />
            </label>
            <label className="space-y-1 text-sm">ZIP-квитанции
              <input className="block w-full rounded-md border p-2 text-sm" type="file" accept=".zip,application/zip" multiple onChange={event => setReceiptFiles(Array.from(event.target.files || []))} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!xmlFiles.length || importing} onClick={() => void importFiles()}>{importing ? "Сопоставляем…" : "Импортировать и сопоставить"}</Button>
            <span className="text-xs text-muted-foreground">Выбрано: {xmlFiles.length} XML, {receiptFiles.length} квитанций</span>
          </div>
          {importResult && <p role="status" className="text-sm">Обработано {importResult.unique_deals} УИД: {importResult.matched} сопоставлено, {importResult.review} требуют проверки, {importResult.not_in_crm} договоров заемщиков не найдены в CRM, {importResult.guarantors} поручителей. По квитанциям принято {importResult.reported_accepted_deals} договоров.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">События 1С (MXL)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">События хранятся отдельно от XML. По вашему указанию они считаются принятыми для учета в CRM, но это не подтверждение НБКИ: без квитанции и проверки подписи фактический прием неизвестен. Показатели последнего события можно перенести в отдельный раздел карточки сопоставленного займа. Учетные суммы, даты и платежи при этом не перезаписываются.</p>
          <input className="block w-full rounded-md border p-2 text-sm" type="file" accept=".mxl" onChange={event => setEventFile(event.target.files?.[0] || null)} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!eventFile || importing} onClick={() => void importEventFile()}>{importing ? "Сопоставляем…" : "Импортировать события"}</Button>
            <Button variant="outline" disabled={importing} onClick={() => void sync1CFacts()}>Перенести показатели 1С в карточки</Button>
          </div>
          {factsResult && <p role="status" className="text-sm">{factsResult}</p>}
          <Button variant="outline" disabled={readinessLoading} onClick={() => void loadReconciliation()}>Сверить с CRM</Button>
          {reconciliation && <div className="rounded-md border p-3 text-sm">
            <p>Сопоставлено {reconciliation.total_loans} договоров; по {reconciliation.resolved_crm_loans} различиям принято общее правило: для выгрузки использовать CRM. Неурегулированных платёжных вопросов: {reconciliation.review_loans}. Различие дат окончания (договор 1С / график CRM): {reconciliation.different_end_dates}, показано справочно. Учётные данные не меняются; приём НБКИ не подтверждается.</p>
            <div className="mt-2 max-h-56 overflow-y-auto">
              {reconciliation.rows.filter(row => row.checks.some(check => check.field === "last_payment" && check.status !== "same")).map(row => <div key={row.loan_id} className="border-t py-2">
                <span className="font-medium">{row.contract_no}</span> · событие {row.event_time.slice(0, 10)} · {row.checks.find(check => check.field === "last_payment")?.status === "resolved_crm" ? "решено: CRM" : row.checks.find(check => check.field === "last_payment")?.status === "date_shift_candidate" ? "вероятно, отличается дата" : row.checks.find(check => check.field === "last_payment")?.status === "adjacent_sum_candidate" ? "вероятно, платёж разнесён на два дня" : "сумма требует проверки"}
              </div>)}
            </div>
          </div>}
          {eventImportResult && <p role="status" className="text-sm">Обработано {eventImportResult.rows} событий: {eventImportResult.borrower_uids} УИД заемщиков, {eventImportResult.guarantor_uids} УИД поручителей. Сопоставлено {eventImportResult.matched}, требуют проверки {eventImportResult.review}, нет в CRM {eventImportResult.not_in_crm}. Поручительства: дополнено {eventImportResult.guarantees_updated}, добавлено {eventImportResult.guarantees_created}, требуют сверки {eventImportResult.guarantees_pending}.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["События 1С", summary?.event_rows ?? 0],
          ["УИД заемщиков", summary?.event_borrower_uids ?? 0],
          ["Сопоставлены с CRM", summary?.event_matched ?? 0],
          ["УИД поручителей", summary?.event_guarantor_uids ?? 0],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="pt-5"><div className="text-2xl font-semibold">{value}</div><div className="text-sm text-muted-foreground">{label}</div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">УИД из событий 1С</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              ["all", "Все"], ["matched", "Сопоставлены"], ["review", "Проверить"],
              ["not_in_crm", "Нет в CRM"], ["guarantor", "Поручители"],
            ].map(([value, label]) => <Button key={value} size="sm" variant={eventStatus === value ? "default" : "outline"} onClick={() => { setEventStatus(value); setEventOffset(0); }}>{label}</Button>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Договор</th><th className="p-2">Участник</th><th className="p-2">УИД</th><th className="p-2">CRM</th><th className="p-2">Приём</th></tr></thead>
              <tbody>{eventDeals.map(deal => <tr key={deal.uid} className="border-b align-top">
                <td className="p-2 font-medium">{deal.contract_no}<div className="text-xs text-muted-foreground">{deal.deal_date || "Дата не указана"}</div></td>
                <td className="p-2">{deal.subject_name}<div className="text-xs text-muted-foreground">{deal.role === "guarantor" ? "Поручитель" : "Заемщик"}</div></td>
                <td className="break-all p-2 font-mono text-xs">{deal.uid}</td>
                <td className="p-2">{deal.loan_id ? `Займ №${deal.loan_id}` : deal.match_reason || "Не сопоставлен"}</td>
                <td className="p-2">По указанию, без квитанции</td>
              </tr>)}</tbody>
            </table>
            {!loading && !eventDeals.length && <p className="py-6 text-center text-sm text-muted-foreground">Нет записей</p>}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{eventTotal ? `${eventOffset + 1}–${Math.min(eventOffset + eventDeals.length, eventTotal)} из ${eventTotal}` : "0 УИД"}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={eventOffset === 0 || loading} onClick={() => setEventOffset(Math.max(0, eventOffset - 100))}>Назад</Button><Button size="sm" variant="outline" disabled={eventOffset + 100 >= eventTotal || loading} onClick={() => setEventOffset(eventOffset + 100)}>Далее</Button></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["УИД в реестре", summary?.total ?? 0],
          ["Сопоставлены с CRM", summary?.matched ?? 0],
          ["Нужна проверка", summary?.review ?? 0],
          ["Нет займа в CRM", summary?.not_in_crm ?? 0],
        ].map(([label, value]) => (
          <Card key={label}><CardContent className="pt-5"><div className="text-2xl font-semibold">{value}</div><div className="text-sm text-muted-foreground">{label}</div></CardContent></Card>
        ))}
      </div>

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

      <Card>
        <CardHeader><CardTitle className="text-base">Договоры</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {statuses.map(item => <Button key={item.value} size="sm" variant={status === item.value ? "default" : "outline"} onClick={() => { setStatus(item.value); setOffset(0); }}>{item.label}</Button>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Договор</th><th className="p-2">Участник</th><th className="p-2">УИД</th><th className="p-2">CRM</th><th className="p-2">Прием НБКИ</th></tr></thead>
              <tbody>
                {deals.map(deal => <tr key={deal.id} className="border-b align-top">
                  <td className="p-2 font-medium">{deal.contract_no}<div className="text-xs text-muted-foreground">{deal.deal_date || "Дата не указана"}</div></td>
                  <td className="p-2">{deal.subject_name || "—"}<div className="text-xs text-muted-foreground">{deal.deal_role === 'guarantor' ? 'Поручитель' : 'Заемщик'}</div></td>
                  <td className="break-all p-2 font-mono text-xs">{deal.uid}</td>
                  <td className="p-2">{deal.loan_id ? `Займ №${deal.loan_id}` : deal.match_reason || "Не сопоставлен"}</td>
                  <td className="p-2">{deal.reported_accepted ? "Принят по квитанции" : "Нет квитанции о приеме"}</td>
                </tr>)}
              </tbody>
            </table>
            {!loading && deals.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Нет записей</p>}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>{total ? `${offset + 1}–${Math.min(offset + deals.length, total)} из ${total}` : "0 договоров"}</span>
            <div className="flex gap-2"><Button size="sm" variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - 100))}>Назад</Button><Button size="sm" variant="outline" disabled={offset + 100 >= total || loading} onClick={() => setOffset(offset + 100)}>Далее</Button></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminNbkiTab;
