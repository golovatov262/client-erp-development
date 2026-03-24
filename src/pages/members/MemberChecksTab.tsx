import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import api, { MemberCheck } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const CHECK_TYPES: Record<string, { label: string; icon: string }> = {
  passport: { label: "Паспорт", icon: "CreditCard" },
  fssp: { label: "ФССП", icon: "Scale" },
  scoring: { label: "Скоринг", icon: "BarChart3" },
  terrorist: { label: "Террористы / экстремисты", icon: "ShieldAlert" },
  bankruptcy: { label: "Банкротство", icon: "FileWarning" },
  other: { label: "Другое", icon: "ClipboardCheck" },
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "warning" | "destructive" }> = {
  pending: { label: "Ожидает", variant: "secondary" },
  ok: { label: "Пройдена", variant: "default" },
  warning: { label: "Внимание", variant: "warning" },
  fail: { label: "Не пройдена", variant: "destructive" },
};

const fmtDate = (d: string) => {
  if (!d) return "";
  const dt = new Date(d);
  return dt.toLocaleDateString("ru-RU") + " " + dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const renderPassportResult = (result: Record<string, unknown>) => {
  if (!result || Object.keys(result).length === 0) return null;

  const inner = (result.result || result) as Record<string, unknown>;
  const status = (inner.status || result.state || "") as string;
  const reason = (inner.reason || inner.message || "") as string;
  const requestId = (result.request_id || result.requestId || inner.request_id || "") as string;

  return (
    <div className="mt-2 p-2.5 bg-muted/50 rounded-md text-xs space-y-1">
      <div className="font-medium text-foreground">Данные СМЭВ3:</div>
      {status && (
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">Статус:</span>
          <span className={
            ["valid", "VALID", "действителен"].includes(status) ? "text-green-600 font-medium" :
            ["invalid", "INVALID", "недействителен"].includes(status) ? "text-red-600 font-medium" :
            "text-yellow-600 font-medium"
          }>
            {["valid", "VALID", "действителен"].includes(status) ? "Действителен" :
             ["invalid", "INVALID", "недействителен"].includes(status) ? "Недействителен" :
             ["not_found", "NOT_FOUND"].includes(status) ? "Не найден" : status}
          </span>
        </div>
      )}
      {reason && (
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">Причина:</span>
          <span>{reason}</span>
        </div>
      )}
      {requestId && (
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">ID запроса:</span>
          <span className="font-mono">{String(requestId).slice(0, 24)}...</span>
        </div>
      )}
    </div>
  );
};

interface Props {
  memberId: number;
  isAdmin: boolean;
}

const MemberChecksTab = ({ memberId, isAdmin }: Props) => {
  const [checks, setChecks] = useState<MemberCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [passportChecking, setPassportChecking] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ check_type: "", status: "pending", comment: "" });
  const { toast } = useToast();

  const loadChecks = () => {
    setLoading(true);
    api.memberChecks.list(memberId).then(setChecks).finally(() => setLoading(false));
  };

  useEffect(() => { loadChecks(); }, [memberId]);

  const resetForm = () => {
    setForm({ check_type: "", status: "pending", comment: "" });
    setShowAdd(false);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!form.check_type) {
      toast({ title: "Выберите тип проверки", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.memberChecks.update({ member_id: memberId, id: editId, status: form.status, comment: form.comment });
        toast({ title: "Проверка обновлена" });
      } else {
        await api.memberChecks.create({ member_id: memberId, check_type: form.check_type, status: form.status, comment: form.comment });
        toast({ title: "Проверка добавлена" });
      }
      resetForm();
      loadChecks();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (check: MemberCheck) => {
    if (!confirm(`Удалить проверку "${CHECK_TYPES[check.check_type]?.label || check.check_type}"?`)) return;
    try {
      await api.memberChecks.delete(memberId, check.id);
      toast({ title: "Проверка удалена" });
      loadChecks();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const startEdit = (check: MemberCheck) => {
    setForm({ check_type: check.check_type, status: check.status, comment: check.comment || "" });
    setEditId(check.id);
    setShowAdd(true);
  };

  const handlePassportAutoCheck = async () => {
    if (!confirm("Запустить автоматическую проверку паспорта через СМЭВ3?\n\nБудут использованы паспортные данные из карточки пайщика.")) return;
    setPassportChecking(true);
    try {
      const result = await api.memberChecks.passportAutoCheck(memberId);
      if (result.error) {
        toast({ title: "Ошибка проверки", description: result.error, variant: "destructive" });
      } else if (result.status === "pending") {
        toast({ title: "Запрос отправлен", description: result.message || "Ожидается ответ от СМЭВ3. Обновите через минуту." });
      } else {
        const statusLabel = result.status === "ok" ? "Пройдена" : result.status === "fail" ? "Не пройдена" : "Внимание";
        toast({ title: `Проверка: ${statusLabel}`, description: result.comment });
      }
      loadChecks();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setPassportChecking(false);
    }
  };

  const handlePollPending = async (check: MemberCheck) => {
    const reqId = check.result?.request_id || check.result?.requestId;
    if (!reqId) {
      toast({ title: "Нет request_id для повторного запроса", variant: "destructive" });
      return;
    }
    setPassportChecking(true);
    try {
      const result = await api.memberChecks.passportPoll(memberId, String(reqId), check.id);
      if (result.error) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      } else if (result.status === "pending") {
        toast({ title: "Ответ ещё не готов", description: "Попробуйте повторить через минуту" });
      } else {
        toast({ title: "Результат получен", description: result.comment });
      }
      loadChecks();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setPassportChecking(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Icon name="Zap" size={18} className="text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Автоматическая проверка паспорта</div>
          <div className="text-xs text-blue-700 dark:text-blue-300">Проверка через СМЭВ3 (Kvell). Использует паспортные данные из карточки пайщика.</div>
        </div>
        <Button
          size="sm"
          onClick={handlePassportAutoCheck}
          disabled={passportChecking}
          className="gap-1.5 shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
        >
          {passportChecking ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Search" size={14} />}
          {passportChecking ? "Проверка..." : "Проверить"}
        </Button>
      </div>

      {checks.length === 0 && !showAdd && (
        <div className="text-center py-6 text-muted-foreground">
          <Icon name="ShieldCheck" size={40} className="mx-auto mb-3 opacity-40" />
          <div className="text-sm">Проверки ещё не проводились</div>
        </div>
      )}

      {checks.map((check) => {
        const typeInfo = CHECK_TYPES[check.check_type] || { label: check.check_type, icon: "ClipboardCheck" };
        const statusInfo = STATUS_MAP[check.status] || STATUS_MAP.pending;
        const isPendingPassport = check.check_type === "passport" && check.status === "pending" && check.result?.request_id;
        return (
          <Card key={check.id} className={check.check_type === "passport" ? "border-l-2 border-l-blue-400" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    <Icon name={typeInfo.icon} size={18} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{typeInfo.label}</span>
                      <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                      {check.check_type === "passport" && check.result && Object.keys(check.result).length > 0 && (
                        <Badge variant="outline" className="text-xs">СМЭВ3</Badge>
                      )}
                    </div>
                    {check.comment && (
                      <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{check.comment}</div>
                    )}
                    {check.check_type === "passport" && check.result && Object.keys(check.result).length > 0 && (
                      renderPassportResult(check.result)
                    )}
                    <div className="text-xs text-muted-foreground mt-1.5">
                      {fmtDate(check.created_at)}
                      {check.checked_by_name && <span> · {check.checked_by_name}</span>}
                      {check.updated_at !== check.created_at && <span> · обновлено {fmtDate(check.updated_at)}</span>}
                    </div>
                    {isPendingPassport && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePollPending(check)}
                        disabled={passportChecking}
                        className="mt-2 gap-1.5 text-xs h-7"
                      >
                        {passportChecking ? <Icon name="Loader2" size={12} className="animate-spin" /> : <Icon name="RefreshCw" size={12} />}
                        Обновить результат
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => startEdit(check)} className="p-1.5 rounded hover:bg-muted" title="Редактировать">
                    <Icon name="Pencil" size={14} />
                  </button>
                  {isAdmin && (
                    <button onClick={() => handleDelete(check)} className="p-1.5 rounded hover:bg-muted text-red-600" title="Удалить">
                      <Icon name="Trash2" size={14} />
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {showAdd && (
        <Card className="border-dashed">
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-medium">{editId ? "Редактировать проверку" : "Новая проверка"}</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Тип проверки</Label>
                <Select value={form.check_type} onValueChange={(v) => setForm(prev => ({ ...prev, check_type: v }))} disabled={!!editId}>
                  <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CHECK_TYPES).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Статус</Label>
                <Select value={form.status} onValueChange={(v) => setForm(prev => ({ ...prev, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_MAP).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Комментарий</Label>
              <Textarea
                value={form.comment}
                onChange={(e) => setForm(prev => ({ ...prev, comment: e.target.value }))}
                placeholder="Результаты проверки, ссылки на документы..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={resetForm}>Отмена</Button>
              <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Check" size={14} />}
                {editId ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!showAdd && (
        <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 w-full">
          <Icon name="Plus" size={14} />
          Добавить проверку вручную
        </Button>
      )}
    </div>
  );
};

export default MemberChecksTab;
