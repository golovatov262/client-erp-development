import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Icon from "@/components/ui/icon";
import DataTable, { Column } from "@/components/ui/data-table";
import api, { LoanDetail, LoanPayment, ScheduleItem, Organization } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { QRCodeSVG } from "qrcode.react";
import { buildPaymentQRString } from "@/lib/payment-qr";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
const fmtDate = (d: string) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };

const statusLabel: Record<string, string> = { active: "Активен", overdue: "Просрочен", closed: "Закрыт", holiday: "Кредитные каникулы", holiday_pending: "Кредитные каникулы", pending: "Ожидается", paid: "Оплачен", partial: "Частично оплачен" };
const statusVariant = (s: string) => {
  if (s === "active" || s === "paid") return "default";
  if (s === "overdue") return "destructive";
  if (s === "partial") return "warning";
  if (s === "holiday" || s === "holiday_pending") return "secondary";
  return "secondary";
};

interface LoansDetailDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detail: LoanDetail | null;
  isAdmin: boolean;
  isManager: boolean;
  orgs?: Organization[];
  onPayment: () => void;
  onEarlyRepay: () => void;
  onModify: () => void;
  onEditPayment: (p: LoanPayment) => void;
  onDeletePayment: (id: number) => void;
  onDeleteContract: () => void;
  onRebuildSchedule: () => void;
  onCheckStatus: () => void;
  onRecalcStatuses: () => void;
  onReconciliation: () => void;
  onFixSchedule: () => void;
  onEditLoan: () => void;
  onHoliday: () => void;
}

const LoanDocumentsContent = ({ loan }: { loan: LoanDetail }) => {
  const [certFrom, setCertFrom] = useState(loan.start_date || "");
  const [certTo, setCertTo] = useState(new Date().toISOString().slice(0, 10));
  const [certLoading, setCertLoading] = useState(false);
  const [closureLoading, setClosureLoading] = useState(false);
  const { toast } = useToast();

  const downloadCertificate = async () => {
    if (!certFrom || !certTo) { toast({ title: "Укажите период", variant: "destructive" }); return; }
    setCertLoading(true);
    try {
      await api.export.download("loan_certificate", loan.id, "pdf", { date_from: certFrom, date_to: certTo });
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
      await api.export.download("loan_closure", loan.id, "pdf");
      toast({ title: "Справка скачана" });
    } catch {
      toast({ title: "Ошибка формирования справки", variant: "destructive" });
    } finally {
      setClosureLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-3">Справка о выплаченных процентах за период</div>
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
        </CardContent>
      </Card>
      {loan.status === "closed" && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Справка о погашении займа</div>
                <div className="text-xs text-muted-foreground mt-0.5">Подтверждение полного погашения задолженности и закрытия договора</div>
              </div>
              <Button size="sm" onClick={downloadClosure} disabled={closureLoading} className="h-8 gap-1.5 shrink-0 ml-4">
                <Icon name={closureLoading ? "Loader2" : "Download"} size={14} className={closureLoading ? "animate-spin" : ""} />
                {closureLoading ? "Формирование..." : "Скачать PDF"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const LoanPaymentQR = ({ detail, orgs }: { detail: LoanDetail; orgs?: Organization[] }) => {
  const [showQR, setShowQR] = useState(false);
  if (detail.status === "closed" || !detail.org_id || !orgs) return null;
  const org = orgs.find(o => o.id === detail.org_id);
  if (!org || !org.rs || !org.bik || !org.bank_name) return null;
  const qrString = buildPaymentQRString({
    name: org.name,
    personalAcc: org.rs,
    bankName: org.bank_name,
    bik: org.bik,
    corrAcc: org.ks || "",
    payeeINN: org.inn || "",
    kpp: org.kpp || "",
    lastName: detail.member_name,
    purpose: `Оплата займа по договору ${detail.contract_no}. ${detail.member_name}`,
    sum: detail.monthly_payment,
  });
  return (
    <div className="mt-2">
      <button
        className="flex items-center gap-1.5 text-xs text-primary hover:underline py-1"
        onClick={() => setShowQR(!showQR)}
      >
        <Icon name="QrCode" size={13} />
        {showQR ? "Скрыть QR" : "QR для оплаты"}
      </button>
      {showQR && (
        <div className="mt-2 p-3 bg-white rounded-lg border flex flex-col items-center gap-2">
          <QRCodeSVG value={qrString} size={160} level="M" />
          <div className="text-xs text-muted-foreground text-center">Отсканируйте в мобильном банке</div>
        </div>
      )}
    </div>
  );
};

const LoansDetailDialog = (props: LoansDetailDialogProps) => {
  const { open, onOpenChange, detail, isAdmin, isManager } = props;

  if (!detail) return null;

  const scheduleCols: Column<ScheduleItem>[] = [
    { key: "period_no", label: "№" },
    { key: "payment_date", label: "Дата", render: (s: ScheduleItem) => fmtDate(s.payment_date) },
    { key: "payment_amount", label: "Платёж", render: (s: ScheduleItem) => fmt(s.payment_amount) },
    { key: "principal_amount", label: "Осн. долг", render: (s: ScheduleItem) => fmt(s.principal_amount) },
    { key: "interest_amount", label: "Проценты", render: (s: ScheduleItem) => fmt(s.interest_amount) },
    { key: "balance_after", label: "Остаток", render: (s: ScheduleItem) => fmt(s.balance_after) },
    { key: "status", label: "Статус", render: (s: ScheduleItem) => {
      const debt = (s.status === "partial" || s.status === "overdue") ? s.payment_amount - (s.paid_amount ?? 0) : 0;
      return (
        <div className="flex flex-col gap-0.5">
          <Badge variant={statusVariant(s.status) as "default"|"destructive"|"secondary"|"warning"} className="text-xs w-fit">{statusLabel[s.status] || s.status}</Badge>
          {debt > 0.01 && <span className="text-xs text-red-500 font-medium">−{fmt(debt)}</span>}
        </div>
      );
    }},
  ];

  const paymentCols: Column<LoanPayment>[] = [
    { key: "payment_date", label: "Дата", render: (p: LoanPayment) => fmtDate(p.payment_date) },
    { key: "amount", label: "Сумма", render: (p: LoanPayment) => fmt(p.amount) },
    { key: "principal_part", label: "Осн. долг", render: (p: LoanPayment) => fmt(p.principal_part) },
    { key: "interest_part", label: "Проценты", render: (p: LoanPayment) => fmt(p.interest_part) },
    { key: "penalty_part", label: "Штрафы", render: (p: LoanPayment) => p.penalty_part > 0 ? fmt(p.penalty_part) : "—" },
    { key: "description", label: "Примечание", render: (p: LoanPayment) => <span className="text-xs text-muted-foreground">{p.description || "—"}</span> },
    { key: "id", label: "", render: (p: LoanPayment) => (isAdmin || isManager) ? (
      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
        <button onClick={() => props.onEditPayment(p)} className="p-1 rounded hover:bg-muted"><Icon name="Pencil" size={14} /></button>
        {(isAdmin || isManager) && <button onClick={() => props.onDeletePayment(p.id)} className="p-1 rounded hover:bg-muted text-red-600"><Icon name="Trash2" size={14} /></button>}
      </div>
    ) : null }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-start justify-between">
          <div>
            <DialogTitle>{detail.contract_no}</DialogTitle>
            <div className="text-sm text-muted-foreground mt-1">{detail.member_name}</div>
          </div>
          <Badge variant={statusVariant(detail.status) as "default"|"destructive"|"secondary"|"warning"}>{statusLabel[detail.status] || detail.status}</Badge>
        </DialogHeader>

        <div className="grid md:grid-cols-3 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Сумма займа</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(detail.amount)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Остаток</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(detail.balance)}</div></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Ежемесячный платёж</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{fmt(detail.monthly_payment)}</div><LoanPaymentQR detail={detail} orgs={props.orgs} /></CardContent></Card>
        </div>

        {detail.status === "holiday" && detail.holiday_start && detail.holiday_end && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <Icon name="Umbrella" size={16} className="text-blue-600 shrink-0" />
            <span className="text-blue-800 font-medium">Кредитные каникулы:</span>
            <span className="text-blue-700">{fmtDate(detail.holiday_start)} — {fmtDate(detail.holiday_end)} ({detail.holiday_months} мес.)</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="grid md:grid-cols-4 gap-2 text-sm flex-1">
            <div><span className="text-muted-foreground">Ставка:</span> <span className="font-medium">{detail.rate}%</span></div>
            <div><span className="text-muted-foreground">Срок:</span> <span className="font-medium">{detail.term_months} мес.</span></div>
            <div><span className="text-muted-foreground">Начало:</span> <span className="font-medium">{fmtDate(detail.start_date)}</span></div>
            <div><span className="text-muted-foreground">Окончание:</span> <span className="font-medium">{fmtDate(detail.end_date)}</span></div>
          </div>
          {(isAdmin || isManager) && (
            <button onClick={props.onEditLoan} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Редактировать параметры">
              <Icon name="Pencil" size={16} />
            </button>
          )}
        </div>

        {(isAdmin || isManager) && (
          <div className="flex flex-wrap gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              {(detail.status === "active" || detail.status === "overdue") && <>
                <Button size="sm" onClick={props.onPayment}><Icon name="DollarSign" size={14} className="mr-1" />Внести платёж</Button>
                <Button size="sm" onClick={props.onEarlyRepay}><Icon name="Zap" size={14} className="mr-1" />Досрочное погашение</Button>
                <Button size="sm" onClick={props.onModify}><Icon name="Settings" size={14} className="mr-1" />Изменить условия</Button>
              </>}
              {(detail.status === "active" || detail.status === "overdue" || detail.status === "holiday") && (
                <Button size="sm" variant="outline" onClick={props.onHoliday}>
                  <Icon name="Umbrella" size={14} className="mr-1" />
                  {detail.status === "holiday" ? "Изменить каникулы" : "Кредитные каникулы"}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={props.onReconciliation}>
                <Icon name="FileSearch" size={14} className="mr-1" />Сверка платежей
              </Button>
              {(isAdmin || isManager) && <Button size="sm" variant="outline" onClick={props.onRecalcStatuses}><Icon name="RotateCw" size={14} className="mr-1" />Пересчитать статусы</Button>}
              {isAdmin && <>
                <Button size="sm" variant="outline" onClick={props.onFixSchedule}><Icon name="Wrench" size={14} className="mr-1" />Исправить дубли</Button>
                <Button size="sm" variant="outline" onClick={props.onCheckStatus}><Icon name="Bug" size={14} className="mr-1" />Проверить статусы</Button>
                <Button size="sm" variant="outline" onClick={props.onRebuildSchedule}><Icon name="RefreshCw" size={14} className="mr-1" />Пересоздать график</Button>
              </>}
              {(isAdmin || isManager) && <Button size="sm" variant="destructive" onClick={props.onDeleteContract}><Icon name="Trash2" size={14} className="mr-1" />Удалить договор</Button>}
            </div>
          </div>
        )}

        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule">График</TabsTrigger>
            <TabsTrigger value="payments">Платежи</TabsTrigger>
            {(isAdmin || isManager) && <TabsTrigger value="docs">Справки</TabsTrigger>}
          </TabsList>

          <TabsContent value="schedule">
            <DataTable columns={scheduleCols} data={detail.schedule || []} />
          </TabsContent>

          <TabsContent value="payments">
            <DataTable columns={paymentCols} data={detail.payments || []} />
          </TabsContent>

          {(isAdmin || isManager) && (
            <TabsContent value="docs">
              <LoanDocumentsContent loan={detail} />
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default LoansDetailDialog;