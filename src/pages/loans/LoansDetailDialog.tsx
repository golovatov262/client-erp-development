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
import LoanCollateralTab from "./LoanCollateralTab";

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
  onEditPayment: (payment: LoanPayment) => void;
}

const LoanDocumentsContent = ({ loan }: { loan: LoanDetail }) => {
  const [certFrom, setCertFrom] = useState(loan.start_date || "");
  const [certTo, setCertTo] = useState(new Date().toISOString().slice(0, 10));
  const [certLoading, setCertLoading] = useState<"pdf" | "docx" | null>(null);
  const [closureLoading, setClosureLoading] = useState<"pdf" | "docx" | null>(null);
  const { toast } = useToast();

  const downloadCertificate = async (format: "pdf" | "docx") => {
    if (!certFrom || !certTo) { toast({ title: "Укажите период", variant: "destructive" }); return; }
    if (certFrom > certTo) { toast({ title: "Дата начала позже даты окончания", variant: "destructive" }); return; }
    setCertLoading(format);
    try {
      await api.export.download("loan_certificate", loan.id, format, { date_from: certFrom, date_to: certTo });
      toast({ title: "Справка скачана" });
    } catch {
      toast({ title: "Ошибка формирования справки", variant: "destructive" });
    } finally {
      setCertLoading(null);
    }
  };

  const downloadClosure = async (format: "pdf" | "docx") => {
    setClosureLoading(format);
    try {
      await api.export.download("loan_closure", loan.id, format);
      toast({ title: "Справка скачана" });
    } catch {
      toast({ title: "Ошибка формирования справки", variant: "destructive" });
    } finally {
      setClosureLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="rounded-md border px-3 py-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 self-center text-sm font-medium">Справка о выплаченных процентах за период</div>
          <div className="w-[136px]">
            <Label className="text-xs">С</Label>
            <Input type="date" value={certFrom} onChange={e => setCertFrom(e.target.value)} className="h-8 px-2 text-xs" />
          </div>
          <div className="w-[136px]">
            <Label className="text-xs">По</Label>
            <Input type="date" value={certTo} onChange={e => setCertTo(e.target.value)} className="h-8 px-2 text-xs" />
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => downloadCertificate("pdf")} disabled={!!certLoading} className="h-8 px-3" aria-label="Скачать справку о процентах в PDF">PDF</Button>
            <Button size="sm" variant="outline" onClick={() => downloadCertificate("docx")} disabled={!!certLoading} className="h-8 px-3" aria-label="Скачать справку о процентах в DOCX">DOCX</Button>
          </div>
        </div>
      </div>
      {loan.status === "closed" && (
        <div className="rounded-md border px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">Справка о погашении займа</div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={() => downloadClosure("pdf")} disabled={!!closureLoading} className="h-8 px-3" aria-label="Скачать справку о погашении в PDF">PDF</Button>
              <Button size="sm" variant="outline" onClick={() => downloadClosure("docx")} disabled={!!closureLoading} className="h-8 px-3" aria-label="Скачать справку о погашении в DOCX">DOCX</Button>
            </div>
          </div>
        </div>
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
      <button type="button" title="Редактировать платёж" onClick={() => props.onEditPayment(p)} className="p-1 rounded hover:bg-muted">
        <Icon name="Pencil" size={14} />
      </button>
    ) : null },
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

        <div className="grid md:grid-cols-4 gap-2 text-sm">
            <div><span className="text-muted-foreground">Ставка:</span> <span className="font-medium">{detail.rate}%</span></div>
            <div><span className="text-muted-foreground">Срок:</span> <span className="font-medium">{detail.term_months} мес.</span></div>
            <div><span className="text-muted-foreground">Начало:</span> <span className="font-medium">{fmtDate(detail.start_date)}</span></div>
            <div><span className="text-muted-foreground">Окончание:</span> <span className="font-medium">{fmtDate(detail.end_date)}</span></div>
        </div>

        {detail.nbki_uid && <div className="rounded-md border px-3 py-2 text-sm">
          <span className="text-muted-foreground">УИД НБКИ: </span><span className="break-all font-mono">{detail.nbki_uid}</span>
          <div className="text-xs text-muted-foreground">{detail.nbki_acceptance_basis === "operator_assumed" ? "События учтены по указанию; квитанция НБКИ отсутствует" : detail.nbki_acceptance_basis === "ticket2_unverified" ? "Есть квитанция НБКИ; подпись не проверена" : "Нет квитанции о приеме"}</div>
        </div>}

        {(isAdmin || isManager) && (
          (detail.status === "active" || detail.status === "overdue") && <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={props.onPayment}><Icon name="DollarSign" size={14} className="mr-1" />Внести платёж</Button>
            <Button size="sm" onClick={props.onEarlyRepay}><Icon name="Zap" size={14} className="mr-1" />Досрочное погашение</Button>
          </div>
        )}

        <Tabs defaultValue="schedule">
          <TabsList>
            <TabsTrigger value="schedule">График</TabsTrigger>
            <TabsTrigger value="payments">Платежи</TabsTrigger>
            <TabsTrigger value="collateral">Обеспечение</TabsTrigger>
            {(isAdmin || isManager) && <TabsTrigger value="docs">Справки</TabsTrigger>}
          </TabsList>

          <TabsContent value="schedule">
            <DataTable columns={scheduleCols} data={detail.schedule || []} />
          </TabsContent>

          <TabsContent value="payments">
            <DataTable columns={paymentCols} data={detail.payments || []} />
          </TabsContent>

          <TabsContent value="collateral">
            <LoanCollateralTab loanId={detail.id} />
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
