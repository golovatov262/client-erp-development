import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import api, { RfmCheck, RfmCheckDetail, RfmFoundEntry } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("ru-RU") + " " + dt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const LIST_LABELS: Record<string, string> = {
  TERRORIST: "Террористы / экстремисты (РФМ)",
  MVK: "Перечень МВК — заморозка средств",
  OON_RUS: "Санкционный список СБ ООН",
};

const PodftTab = () => {
  const [history, setHistory] = useState<RfmCheck[]>([]);
  const [lastCheck, setLastCheck] = useState<RfmCheckDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<RfmCheckDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [hist, last] = await Promise.all([
        api.podft.history(),
        api.podft.last(),
      ]);
      setHistory(hist);
      if (last && "id" in last) {
        setLastCheck(last as RfmCheckDetail);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRun = async () => {
    if (!confirm("Запустить проверку всех действующих пайщиков по перечням РФМ?\n\nПроверяются 3 списка: террористы/экстремисты, МВК (заморозка средств), санкции СБ ООН.\n\nПроверка может занять несколько минут.")) return;
    setRunning(true);
    try {
      const result = await api.podft.run();
      if (result.error) {
        toast({ title: "Ошибка", description: result.error, variant: "destructive" });
      } else {
        const foundText = result.found > 0
          ? `Найдено совпадений: ${result.found}!`
          : "Совпадений не найдено.";
        toast({
          title: "Проверка завершена",
          description: `Проверено ${result.checked} из ${result.total_members} пайщиков. ${foundText}`,
          variant: result.found > 0 ? "destructive" : "default",
        });
      }
      load();
    } catch (e) {
      toast({ title: "Ошибка проверки", description: String(e), variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const openDetail = async (id: number) => {
    setDetailId(id);
    setDetailLoading(true);
    try {
      const data = await api.podft.detail(id);
      setDetailData(data as RfmCheckDetail);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  };

  const renderFoundEntry = (entry: RfmFoundEntry, idx: number) => (
    <div key={idx} className="p-3 border rounded-lg bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-sm text-red-900 dark:text-red-100">
            {entry.member_name}
          </div>
          <div className="text-xs text-red-700 dark:text-red-300 mt-0.5">
            Пайщик №{entry.member_no} (ID: {entry.member_id})
          </div>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          {entry.lists?.map((list, i) => (
            <Badge key={i} variant="destructive" className="text-[10px] whitespace-nowrap">
              {LIST_LABELS[list] || list}
            </Badge>
          ))}
        </div>
      </div>
      {entry.matches && entry.matches.length > 0 && (
        <div className="mt-2 space-y-1">
          {entry.matches.slice(0, 5).map((match, mi) => (
            <div key={mi} className="text-xs text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/30 rounded px-2 py-1">
              {(match as Record<string, unknown>).name && (
                <span className="font-medium">{String((match as Record<string, unknown>).name)}</span>
              )}
              {(match as Record<string, unknown>).birth_date && (
                <span className="ml-2 text-red-600">д.р. {String((match as Record<string, unknown>).birth_date)}</span>
              )}
              {(match as Record<string, unknown>).list_name && (
                <span className="ml-2 opacity-70">[{String((match as Record<string, unknown>).list_name)}]</span>
              )}
            </div>
          ))}
          {entry.matches.length > 5 && (
            <div className="text-xs text-red-600">...и ещё {entry.matches.length - 5} совпадений</div>
          )}
        </div>
      )}
    </div>
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Icon name="Loader2" size={32} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/40 shrink-0">
              <Icon name="ShieldAlert" size={28} className="text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-orange-900 dark:text-orange-100">Проверка по перечням РФМ</div>
              <div className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                Массовая проверка всех действующих пайщиков по трём санкционным перечням в рамках 115-ФЗ:
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300">
                  <Icon name="AlertTriangle" size={10} className="mr-1" />Террористы / экстремисты
                </Badge>
                <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300">
                  <Icon name="Ban" size={10} className="mr-1" />МВК — заморозка средств
                </Badge>
                <Badge variant="outline" className="text-xs border-orange-300 text-orange-700 dark:border-orange-700 dark:text-orange-300">
                  <Icon name="Globe" size={10} className="mr-1" />Санкции СБ ООН
                </Badge>
              </div>
            </div>
            <Button
              onClick={handleRun}
              disabled={running}
              className="gap-2 shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {running ? (
                <>
                  <Icon name="Loader2" size={16} className="animate-spin" />
                  Проверка...
                </>
              ) : (
                <>
                  <Icon name="ScanSearch" size={16} />
                  Проверить всех
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastCheck && lastCheck.found_count > 0 && (
        <Card className="border-red-300 dark:border-red-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-300">
              <Icon name="AlertOctagon" size={18} />
              Обнаружены совпадения ({lastCheck.found_count})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lastCheck.results?.map((entry, idx) => renderFoundEntry(entry, idx))}
          </CardContent>
        </Card>
      )}

      {lastCheck && lastCheck.found_count === 0 && (
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/40">
                <Icon name="CheckCircle2" size={24} className="text-green-600" />
              </div>
              <div>
                <div className="font-medium text-green-900 dark:text-green-100">Совпадений не обнаружено</div>
                <div className="text-sm text-green-700 dark:text-green-300">
                  Последняя проверка: {fmtDate(lastCheck.completed_at)} · Проверено {lastCheck.checked_count} пайщиков
                  {lastCheck.started_by && <span> · {lastCheck.started_by}</span>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="History" size={18} />
            История проверок
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Icon name="FileSearch" size={40} className="mx-auto mb-3 opacity-40" />
              <div className="text-sm">Проверки ещё не проводились</div>
              <div className="text-xs mt-1">Нажмите «Проверить всех» для запуска первой проверки</div>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((check) => (
                <div
                  key={check.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => openDetail(check.id)}
                >
                  <div className={`p-1.5 rounded-full ${
                    check.status === "running" ? "bg-blue-100 dark:bg-blue-900/40" :
                    check.found_count > 0 ? "bg-red-100 dark:bg-red-900/40" :
                    "bg-green-100 dark:bg-green-900/40"
                  }`}>
                    <Icon
                      name={check.status === "running" ? "Loader2" : check.found_count > 0 ? "AlertTriangle" : "CheckCircle2"}
                      size={16}
                      className={`${
                        check.status === "running" ? "text-blue-600 animate-spin" :
                        check.found_count > 0 ? "text-red-600" :
                        "text-green-600"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{fmtDate(check.created_at)}</span>
                      {check.status === "running" && <Badge variant="secondary" className="text-xs">В процессе</Badge>}
                      {check.status === "completed" && check.found_count > 0 && (
                        <Badge variant="destructive" className="text-xs">{check.found_count} совпадений</Badge>
                      )}
                      {check.status === "completed" && check.found_count === 0 && (
                        <Badge variant="default" className="text-xs">Чисто</Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Проверено: {check.checked_count}/{check.total_members}
                      {check.started_by && <span> · {check.started_by}</span>}
                    </div>
                  </div>
                  <Icon name="ChevronRight" size={16} className="text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {detailId && (
        <Card className="border-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Детали проверки #{detailId}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setDetailId(null); setDetailData(null); }}>
                <Icon name="X" size={16} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {detailLoading ? (
              <div className="flex items-center justify-center py-6"><Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" /></div>
            ) : detailData ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-2 rounded bg-muted text-center">
                    <div className="text-xs text-muted-foreground">Проверено</div>
                    <div className="font-semibold">{detailData.checked_count}/{detailData.total_members}</div>
                  </div>
                  <div className={`p-2 rounded text-center ${detailData.found_count > 0 ? "bg-red-50 dark:bg-red-950/30" : "bg-green-50 dark:bg-green-950/30"}`}>
                    <div className="text-xs text-muted-foreground">Совпадения</div>
                    <div className={`font-semibold ${detailData.found_count > 0 ? "text-red-600" : "text-green-600"}`}>{detailData.found_count}</div>
                  </div>
                  <div className="p-2 rounded bg-muted text-center">
                    <div className="text-xs text-muted-foreground">Статус</div>
                    <div className="font-semibold">{detailData.status === "completed" ? "Завершено" : detailData.status}</div>
                  </div>
                </div>
                {detailData.results && detailData.results.length > 0 ? (
                  <div className="space-y-2">
                    {detailData.results.map((entry, idx) => renderFoundEntry(entry, idx))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-green-600">
                    <Icon name="CheckCircle2" size={24} className="mx-auto mb-2" />
                    <div className="text-sm font-medium">Совпадений не обнаружено</div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PodftTab;
