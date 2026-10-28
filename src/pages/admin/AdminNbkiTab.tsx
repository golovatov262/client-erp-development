import { useEffect, useState } from "react";
import api, { NbkiDeal, NbkiSummary, humanizeError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statuses = [
  { value: "all", label: "Все" },
  { value: "matched", label: "Сопоставлены" },
  { value: "review", label: "Проверить" },
  { value: "not_in_crm", label: "Нет в CRM" },
];

const receiptLabel: Record<string, string> = {
  accepted: "Все события приняты",
  partial: "Принята часть событий",
  received: "Файл получен",
  rejected: "Отклонён",
  unknown: "Квитанция не загружена",
};

const AdminNbkiTab = () => {
  const [summary, setSummary] = useState<NbkiSummary | null>(null);
  const [deals, setDeals] = useState<NbkiDeal[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, nextDeals] = await Promise.all([
        api.nbki.summary(),
        api.nbki.deals(status, offset),
      ]);
      setSummary(nextSummary);
      setDeals(nextDeals.rows);
      setTotal(nextDeals.total);
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [status, offset]);

  return (
    <div className="space-y-5 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">НБКИ · Эксперт Финанс</h2>
          <p className="text-sm text-muted-foreground">Исторические УИД и результаты сопоставления с договорами CRM</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>Обновить</Button>
      </div>

      {error && <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["УИД в реестре", summary?.total ?? 0],
          ["Сопоставлены с CRM", summary?.matched ?? 0],
          ["Нужна проверка", summary?.review ?? 0],
          ["Не найдены в CRM", summary?.not_in_crm ?? 0],
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
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Договор</th><th className="p-2">Заемщик</th><th className="p-2">УИД</th><th className="p-2">CRM</th><th className="p-2">Прием НБКИ</th></tr></thead>
              <tbody>
                {deals.map(deal => <tr key={deal.id} className="border-b align-top">
                  <td className="p-2 font-medium">{deal.contract_no}<div className="text-xs text-muted-foreground">{deal.deal_date || "Дата не указана"}</div></td>
                  <td className="p-2">{deal.subject_name || "—"}</td>
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
