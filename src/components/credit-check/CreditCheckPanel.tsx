import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import funcUrls from "../../../backend/func2url.json";
import { fmtLabel, fmtValue, isTechField } from "./formatters";

const CREDIT_CHECK_URL = (funcUrls as Record<string, string>)["credit-check"];

export type CreditCheckInput = {
  last_name: string;
  first_name: string;
  middle_name?: string | null;
  birth_date: string;
  passport_series: string;
  passport_number: string;
  passport_issue_date?: string | null;
  passport_issuer_code?: string | null;
  inn?: string | null;
  snils?: string | null;
  gender?: string | null;
  phone?: string | null;
  reg_addr_full?: string | null;
  member_id?: number | null;
};

type CheckStatus = {
  check_id: string;
  status: string;
  score?: number | null;
  decision?: string | null;
  reject_reasons?: string[] | null;
  results?: Record<string, unknown> | null;
  errors?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  upstream_check_id?: string | null;
};

const normalizeStatus = (data: CheckStatus): CheckStatus => {
  const inner = (data.result || {}) as Record<string, unknown>;
  return {
    ...data,
    status: data.status || (inner.status as string) || "pending",
    score: (data.score ?? (inner.score as number)) ?? null,
    decision: (data.decision ?? (inner.decision as string)) ?? null,
    reject_reasons: (data.reject_reasons ?? (inner.reject_reasons as string[])) ?? null,
    results: (data.results ?? (inner.results as Record<string, unknown>)) ?? null,
    errors: (data.errors ?? (inner.errors as Record<string, unknown>)) ?? null,
    completed_at: (data.completed_at ?? (inner.completed_at as string)) ?? null,
  };
};

const SOURCES: { key: string; label: string; icon: string }[] = [
  { key: "passport", label: "Паспорт МВД", icon: "CreditCard" },
  { key: "fssp", label: "ФССП — исп. производства", icon: "Scale" },
  { key: "bankruptcy", label: "Банкротство (Федресурс)", icon: "FileWarning" },
  { key: "rfm", label: "РФМ — санкционные списки", icon: "ShieldAlert" },
  { key: "mvd_wanted", label: "Розыск МВД", icon: "Search" },
  { key: "mvd_rkl", label: "Реестр контролируемых лиц МВД", icon: "Users" },
  { key: "flmob", label: "Мобилизация / ИП / НПД", icon: "Briefcase" },
  { key: "fines", label: "Штрафы ГИБДД", icon: "Car" },
  { key: "gisgmp", label: "ГИС ГМП — гос. начисления", icon: "Landmark" },
  { key: "client_debt", label: "База должников", icon: "AlertCircle" },
];

const fmtDateTime = (s?: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU") + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const decisionBadge = (d?: string | null) => {
  if (!d) return null;
  const low = String(d).toLowerCase();
  if (["approve", "approved", "ok", "pass", "одобрен"].includes(low)) return <Badge className="bg-green-600 hover:bg-green-700">Одобрено</Badge>;
  if (["reject", "rejected", "fail", "отказ"].includes(low)) return <Badge variant="destructive">Отказ</Badge>;
  if (["review", "manual", "check", "проверка"].includes(low)) return <Badge variant="warning">Требует проверки</Badge>;
  return <Badge variant="secondary">{d}</Badge>;
};

const sourceStatus = (raw: unknown): { label: string; color: string } => {
  if (!raw || typeof raw !== "object") return { label: "Нет данных", color: "text-muted-foreground" };
  const r = raw as Record<string, unknown>;
  const status = String(r.status || r.state || r.result || "").toLowerCase();
  if (["ok", "valid", "clean", "not_found", "no", "pass", "passed"].includes(status)) return { label: "Чисто", color: "text-green-600" };
  if (["found", "fail", "invalid", "blocked", "warning", "match"].includes(status)) return { label: "Найдено", color: "text-red-600" };
  if (["pending", "running", "wait"].includes(status)) return { label: "Ожидание", color: "text-yellow-600" };
  if (["error"].includes(status)) return { label: "Ошибка", color: "text-red-600" };
  if (Object.keys(r).length === 0) return { label: "Нет данных", color: "text-muted-foreground" };
  return { label: "Получено", color: "text-blue-600" };
};

const renderKV = (obj: Record<string, unknown>) => {
  const entries = Object.entries(obj).filter(([k]) => !isTechField(k));
  if (entries.length === 0) return <div className="text-xs text-muted-foreground">Нет данных</div>;
  return (
    <div className="space-y-1 text-xs">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-2 items-start">
          <span className="text-muted-foreground min-w-[160px]">{fmtLabel(k)}:</span>
          <span className="break-words flex-1">{fmtValue(k, v)}</span>
        </div>
      ))}
    </div>
  );
};

const renderRecord = (rec: Record<string, unknown>, idx: number, total: number) => (
  <div key={idx} className="border rounded-md p-2.5 bg-muted/30">
    {total > 1 && <div className="text-[11px] font-semibold text-muted-foreground mb-1.5">Запись №{idx + 1}</div>}
    {renderKV(rec)}
  </div>
);

const renderSourceDetails = (data: unknown) => {
  if (!data) return <div className="text-xs text-muted-foreground">Нет данных</div>;
  if (typeof data === "string") return <div className="text-xs whitespace-pre-wrap">{data}</div>;
  if (typeof data !== "object") return <div className="text-xs">{String(data)}</div>;
  const obj = data as Record<string, unknown>;
  const entries = Object.entries(obj).filter(([k]) => !isTechField(k));
  if (entries.length === 0) return <div className="text-xs text-muted-foreground">Нет данных</div>;

  const records = Array.isArray(obj.records) ? (obj.records as unknown[]) : null;
  const otherEntries = entries.filter(([k]) => k !== "records");

  return (
    <div className="space-y-3">
      {otherEntries.length > 0 && (
        <div className="space-y-1 text-xs">
          {otherEntries.map(([k, v]) => {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              return (
                <div key={k} className="border-l-2 border-muted pl-2 py-1">
                  <div className="text-muted-foreground font-medium mb-1">{fmtLabel(k)}:</div>
                  <div className="pl-1">{renderKV(v as Record<string, unknown>)}</div>
                </div>
              );
            }
            return (
              <div key={k} className="flex gap-2 items-start">
                <span className="text-muted-foreground min-w-[160px]">{fmtLabel(k)}:</span>
                <span className="break-words flex-1">{fmtValue(k, v)}</span>
              </div>
            );
          })}
        </div>
      )}
      {records && records.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Найдено записей: {records.length}
          </div>
          {records.map((rec, i) =>
            rec && typeof rec === "object"
              ? renderRecord(rec as Record<string, unknown>, i, records.length)
              : <div key={i} className="text-xs">{String(rec)}</div>
          )}
        </div>
      )}
      {records && records.length === 0 && (
        <div className="text-xs text-green-600">Записей не найдено</div>
      )}
    </div>
  );
};

interface Props {
  buildInput: () => CreditCheckInput | { error: string };
}

const CreditCheckPanel = ({ buildInput }: Props) => {
  const [check, setCheck] = useState<CheckStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pollTimer = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => () => {
    if (pollTimer.current) window.clearTimeout(pollTimer.current);
  }, []);

  const stopPolling = () => {
    if (pollTimer.current) {
      window.clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    setPolling(false);
  };

  const pollResult = async (checkId: string, attempt = 0) => {
    if (attempt > 30) {
      stopPolling();
      toast({ title: "Превышено время ожидания", description: "Попробуйте получить результат позже", variant: "destructive" });
      return;
    }
    try {
      const resp = await fetch(`${CREDIT_CHECK_URL}?check_id=${encodeURIComponent(checkId)}`);
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status}: ${text}`);
      }
      const raw: CheckStatus = await resp.json();
      const data = normalizeStatus(raw);
      setCheck(data);
      if (data.status === "done" || data.status === "completed" || data.status === "error" || data.status === "failed") {
        stopPolling();
        const isError = data.status === "error" || data.status === "failed";
        toast({ title: isError ? "Ошибка проверки" : "Проверка завершена", variant: isError ? "destructive" : "default" });
        return;
      }
      pollTimer.current = window.setTimeout(() => pollResult(checkId, attempt + 1), 5000);
    } catch (e) {
      stopPolling();
      toast({ title: "Ошибка опроса статуса", description: String(e), variant: "destructive" });
    }
  };

  const runCheck = async () => {
    const input = buildInput();
    if ("error" in input) {
      toast({ title: "Недостаточно данных", description: input.error, variant: "destructive" });
      return;
    }
    setLoading(true);
    stopPolling();
    setCheck(null);
    setStartedAt(new Date().toISOString());
    try {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        ...input,
        consent_date: today,
      };
      const resp = await fetch(CREDIT_CHECK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`${resp.status}: ${text}`);
      }
      const raw: CheckStatus = await resp.json();
      const data = normalizeStatus(raw);
      setCheck(data);
      toast({ title: "Проверка запущена", description: `ID: ${data.check_id}` });
      setPolling(true);
      pollTimer.current = window.setTimeout(() => pollResult(data.check_id, 0), 3000);
    } catch (e) {
      toast({ title: "Не удалось запустить проверку", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const refreshOnce = async () => {
    if (!check?.check_id) return;
    setLoading(true);
    try {
      const resp = await fetch(`${CREDIT_CHECK_URL}?check_id=${encodeURIComponent(check.check_id)}`);
      if (!resp.ok) throw new Error(await resp.text());
      const raw: CheckStatus = await resp.json();
      setCheck(normalizeStatus(raw));
    } catch (e) {
      toast({ title: "Ошибка обновления", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const results = (check?.results || {}) as Record<string, unknown>;
  const errors = (check?.errors || {}) as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Icon name="ShieldCheck" size={22} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Комплексная проверка физлица</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Проверка по 10 источникам: паспорт МВД, ФССП, банкротство, РФМ, розыск, реестр КЛ, мобилизация, штрафы ГИБДД, ГИС ГМП, должники.
              </div>
              {startedAt && (
                <div className="text-xs text-muted-foreground mt-1">
                  Запущена: <span className="font-medium text-foreground">{fmtDateTime(startedAt)}</span>
                </div>
              )}
              {check?.completed_at && (
                <div className="text-xs text-muted-foreground">
                  Завершена: <span className="font-medium text-foreground">{fmtDateTime(check.completed_at)}</span>
                </div>
              )}
            </div>
            <Button
              onClick={runCheck}
              disabled={loading || polling}
              className="gap-1.5 shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
              size="sm"
            >
              {loading || polling
                ? <Icon name="Loader2" size={14} className="animate-spin" />
                : <Icon name={check ? "RefreshCw" : "Play"} size={14} />}
              {check ? "Повторить проверку" : "Запустить проверку"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {!check && !loading && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <Icon name="ClipboardCheck" size={36} className="mx-auto mb-2 opacity-40" />
          Нажмите «Запустить проверку», чтобы получить результаты по всем источникам.
        </div>
      )}

      {check && (
        <div className="space-y-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Статус:</span>
                  <Badge variant={check.status === "done" ? "default" : check.status === "error" ? "destructive" : "secondary"}>
                    {check.status === "pending" ? "В очереди" :
                     check.status === "running" ? "Выполняется" :
                     check.status === "done" ? "Готово" :
                     check.status === "error" ? "Ошибка" : check.status}
                  </Badge>
                </div>
                {check.score != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Скоринг:</span>
                    <span className="font-semibold">{check.score}</span>
                  </div>
                )}
                {check.decision && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Решение:</span>
                    {decisionBadge(check.decision)}
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground font-mono">{check.check_id}</span>
                  <Button size="sm" variant="ghost" onClick={refreshOnce} disabled={loading} className="h-7 gap-1">
                    <Icon name="RefreshCw" size={12} className={loading ? "animate-spin" : ""} />
                    Обновить
                  </Button>
                </div>
              </div>
              {check.reject_reasons && check.reject_reasons.length > 0 && (
                <div className="mt-3 p-2.5 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-900">
                  <div className="text-xs font-medium text-red-900 dark:text-red-100 mb-1">Причины отказа:</div>
                  <ul className="text-xs text-red-800 dark:text-red-200 list-disc list-inside space-y-0.5">
                    {check.reject_reasons.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-2">
              <div className="w-full">
                {SOURCES.map(src => {
                  const raw = results[src.key];
                  const err = errors[src.key];
                  const st = err ? { label: "Ошибка", color: "text-red-600" } : sourceStatus(raw);
                  const isOpen = expanded[src.key] || false;
                  return (
                    <div key={src.key} className="border-b last:border-b-0">
                      <button
                        type="button"
                        onClick={() => setExpanded(e => ({ ...e, [src.key]: !e[src.key] }))}
                        className="w-full py-2.5 px-2 hover:bg-muted/50 rounded flex items-center gap-2.5 text-left"
                      >
                        <Icon name={src.icon} size={16} className="text-muted-foreground" />
                        <span className="text-sm font-medium flex-1">{src.label}</span>
                        <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                        <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} size={14} className="text-muted-foreground" />
                      </button>
                      {isOpen && (
                        <div className="px-2 pb-3 pt-1">
                          {err
                            ? <div className="text-xs text-red-600">{typeof err === "string" ? err : JSON.stringify(err)}</div>
                            : renderSourceDetails(raw)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default CreditCheckPanel;