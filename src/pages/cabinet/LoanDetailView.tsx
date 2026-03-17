import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, { LoanDetail, ScheduleItem } from "@/lib/api";
import { fmt, fmtDate, statusLabel, statusVariant, MobileRow } from "./cabinet-utils";

const LoanDetailView = ({ loan }: { loan: LoanDetail }) => {
  const [certFrom, setCertFrom] = useState(loan.start_date || "");
  const [certTo, setCertTo] = useState(new Date().toISOString().slice(0, 10));
  const [certLoading, setCertLoading] = useState(false);
  const [closureLoading, setClosureLoading] = useState(false);
  const { toast } = useToast();
  const token = localStorage.getItem("cabinet_token") || "";

  const downloadCertificate = async () => {
    if (!certFrom || !certTo) { toast({ title: "Укажите период", variant: "destructive" }); return; }
    setCertLoading(true);
    try {
      await api.cabinet.loanCertificate(token, loan.id, certFrom, certTo);
      toast({ title: "Справка скачана" });
    } catch {
      toast({ title: "Ошибка формирования справки", variant: "destructive" });
    } finally {
      setCertLoading(false);
    }
  };

  const downloadClosure = async () => {
    setClosureLoading(true);
    try {
      await api.cabinet.loanClosure(token, loan.id);
      toast({ title: "Справка скачана" });
    } catch {
      toast({ title: "Ошибка формирования справки", variant: "destructive" });
    } finally {
      setClosureLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="hidden sm:grid grid-cols-5 gap-3">
        <div><div className="text-xs text-muted-foreground">Сумма</div><div className="text-sm font-medium">{fmt(loan.amount)}</div></div>
        <div><div className="text-xs text-muted-foreground">Ставка</div><div className="text-sm font-medium">{loan.rate}%</div></div>
        <div><div className="text-xs text-muted-foreground">Срок</div><div className="text-sm font-medium">{loan.term_months} мес.</div></div>
        <div><div className="text-xs text-muted-foreground">Платёж</div><div className="text-sm font-medium">{fmt(loan.monthly_payment)}</div></div>
        <div><div className="text-xs text-muted-foreground">Остаток</div><div className="text-sm font-bold text-primary">{fmt(loan.balance)}</div></div>
      </div>
      <div className="sm:hidden">
        <MobileRow label="Сумма" value={fmt(loan.amount)} />
        <MobileRow label="Ставка" value={`${loan.rate}%`} />
        <MobileRow label="Срок" value={`${loan.term_months} мес.`} />
        <MobileRow label="Ежемес. платёж" value={fmt(loan.monthly_payment)} />
        <MobileRow label="Остаток" value={fmt(loan.balance)} className="font-bold text-primary" />
      </div>

      <Tabs defaultValue="schedule">
        <TabsList className="w-full flex">
          <TabsTrigger value="schedule" className="flex-1 text-xs sm:text-sm">График</TabsTrigger>
          <TabsTrigger value="payments" className="flex-1 text-xs sm:text-sm">Платежи ({loan.payments.length})</TabsTrigger>
          <TabsTrigger value="docs" className="flex-1 text-xs sm:text-sm">Справки</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="mt-3">
          <div className="hidden sm:block overflow-x-auto max-h-96 overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0"><tr className="text-xs text-muted-foreground">
                <th className="text-left py-2 px-3">N</th><th className="text-left py-2 px-3">Дата</th>
                <th className="text-right py-2 px-3">Платёж</th><th className="text-right py-2 px-3">Осн. долг</th>
                <th className="text-right py-2 px-3">Проценты</th><th className="text-right py-2 px-3">Остаток</th>
                <th className="text-center py-2 px-3">Статус</th>
              </tr></thead>
              <tbody>{loan.schedule.map((r: ScheduleItem) => (
                <tr key={r.payment_no} className="border-t hover:bg-muted/30">
                  <td className="py-2 px-3">{r.payment_no}</td>
                  <td className="py-2 px-3">{fmtDate(r.payment_date)}</td>
                  <td className="py-2 px-3 text-right font-medium">{fmt(r.payment_amount)}</td>
                  <td className="py-2 px-3 text-right">{fmt(r.principal_amount)}</td>
                  <td className="py-2 px-3 text-right">{fmt(r.interest_amount)}</td>
                  <td className="py-2 px-3 text-right">{fmt(r.balance_after)}</td>
                  <td className="py-2 px-3 text-center">
                    <Badge variant={statusVariant(r.status || "pending") as "default"|"destructive"|"secondary"} className="text-xs">
                      {statusLabel[r.status || "pending"] || r.status}
                    </Badge>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="sm:hidden space-y-2 max-h-[60vh] overflow-y-auto">
            {loan.schedule.map((r: ScheduleItem) => (
              <Card key={r.payment_no} className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">#{r.payment_no} · {fmtDate(r.payment_date)}</span>
                  <Badge variant={statusVariant(r.status || "pending") as "default"|"destructive"|"secondary"} className="text-xs">
                    {statusLabel[r.status || "pending"] || r.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                  <MobileRow label="Платёж" value={fmt(r.payment_amount)} />
                  <MobileRow label="Осн. долг" value={fmt(r.principal_amount)} />
                  <MobileRow label="Проценты" value={fmt(r.interest_amount)} />
                  <MobileRow label="Остаток" value={fmt(r.balance_after)} />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="payments" className="mt-3">
          {loan.payments.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground text-sm">Платежей пока нет</Card>
          ) : (
            <>
              <div className="hidden sm:block overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr className="text-xs text-muted-foreground">
                    <th className="text-left py-2 px-3">Дата</th><th className="text-right py-2 px-3">Сумма</th>
                    <th className="text-right py-2 px-3">Осн. долг</th><th className="text-right py-2 px-3">Проценты</th>
                    <th className="text-right py-2 px-3">Штрафы</th>
                  </tr></thead>
                  <tbody>{loan.payments.map(p => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2 px-3">{fmtDate(p.payment_date)}</td>
                      <td className="py-2 px-3 text-right font-medium">{fmt(p.amount)}</td>
                      <td className="py-2 px-3 text-right">{fmt(p.principal_part)}</td>
                      <td className="py-2 px-3 text-right">{fmt(p.interest_part)}</td>
                      <td className="py-2 px-3 text-right">{fmt(p.penalty_part)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="sm:hidden space-y-2 max-h-[60vh] overflow-y-auto">
                {loan.payments.map(p => (
                  <Card key={p.id} className="p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">{fmtDate(p.payment_date)}</span>
                      <span className="text-sm font-semibold">{fmt(p.amount)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      <div><span className="text-muted-foreground">ОД:</span> {fmt(p.principal_part)}</div>
                      <div><span className="text-muted-foreground">%:</span> {fmt(p.interest_part)}</div>
                      <div><span className="text-muted-foreground">Штр:</span> {fmt(p.penalty_part)}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="docs" className="mt-3 space-y-3">
          <Card className="p-3 sm:p-4">
            <div className="text-sm font-medium mb-2">Справка о выплаченных процентах за период</div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1">
                <Label className="text-xs">С</Label>
                <Input type="date" value={certFrom} onChange={e => setCertFrom(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex-1">
                <Label className="text-xs">По</Label>
                <Input type="date" value={certTo} onChange={e => setCertTo(e.target.value)} className="h-8 text-sm" />
              </div>
              <Button size="sm" onClick={downloadCertificate} disabled={certLoading} className="h-8 gap-1.5">
                <Icon name={certLoading ? "Loader2" : "Download"} size={14} className={certLoading ? "animate-spin" : ""} />
                {certLoading ? "Формирование..." : "Скачать PDF"}
              </Button>
            </div>
          </Card>
          {loan.status === "closed" && (
            <Card className="p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">Справка о погашении займа</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Подтверждение полного погашения и закрытия договора</div>
                </div>
                <Button size="sm" onClick={downloadClosure} disabled={closureLoading} className="h-8 gap-1.5 shrink-0">
                  <Icon name={closureLoading ? "Loader2" : "Download"} size={14} className={closureLoading ? "animate-spin" : ""} />
                  {closureLoading ? "Формирование..." : "Скачать PDF"}
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LoanDetailView;
