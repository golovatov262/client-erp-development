import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Icon from "@/components/ui/icon";
import { CabinetOverview, CabinetOrgInfo, Loan, Saving } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";
import { buildPaymentQRString } from "@/lib/payment-qr";
import { fmt, fmtDate, statusLabel, statusVariant } from "./cabinet-utils";

const getNextPaymentInfo = (loan: Loan & { next_payment_date?: string }): { date: string; daysLeft: number; isOverdue: boolean } | null => {
  if (!loan.next_payment_date) return null;
  const parts = loan.next_payment_date.split("-");
  if (parts.length !== 3) return null;
  const payDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((payDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return { date: `${parts[2]}.${parts[1]}.${parts[0]}`, daysLeft: diff, isOverdue: diff < 0 };
};

const PaymentQR = ({ org, payerName, contractNo, sum, label }: {
  org: CabinetOrgInfo | undefined;
  payerName: string;
  contractNo: string;
  sum: number;
  label: string;
}) => {
  const [showQR, setShowQR] = useState(false);

  if (!org || !org.rs || !org.bik || !org.bank_name) return null;

  const qrString = buildPaymentQRString({
    name: org.name,
    personalAcc: org.rs,
    bankName: org.bank_name,
    bik: org.bik,
    corrAcc: org.ks || "",
    payeeINN: org.inn || "",
    kpp: org.kpp || "",
    lastName: payerName,
    purpose: `${label} по договору ${contractNo}. ${payerName}`,
    sum,
  });

  return (
    <div className="mt-2" onClick={e => e.stopPropagation()}>
      <button
        className="flex items-center gap-1.5 text-xs text-primary hover:underline py-1"
        onClick={() => setShowQR(!showQR)}
      >
        <Icon name="QrCode" size={14} />
        {showQR ? "Скрыть QR" : `QR для оплаты · ${fmt(sum)}`}
      </button>
      {showQR && (
        <div className="mt-2 p-3 bg-white rounded-lg border flex flex-col items-center gap-2">
          <QRCodeSVG value={qrString} size={180} level="M" />
          <div className="text-xs text-muted-foreground text-center">
            Отсканируйте QR в мобильном банке
          </div>
          <div className="text-xs text-center font-medium">{fmt(sum)}</div>
        </div>
      )}
    </div>
  );
};

interface CabinetDashboardProps {
  data: CabinetOverview;
  userName: string;
  onOpenLoan: (loan: Loan) => void;
  onOpenSaving: (saving: Saving) => void;
}

const CabinetDashboard = ({ data, userName, onOpenLoan, onOpenSaving }: CabinetDashboardProps) => {
  const totalLoanBalance = data.loans.filter(l => l.status === "active" || l.status === "overdue").reduce((s, l) => s + l.balance, 0);
  const totalSavings = data.savings.filter(s => s.status === "active").reduce((s, i) => s + (i.current_balance || i.amount), 0);
  const totalShares = data.shares.reduce((s, a) => s + a.balance, 0);

  const orgsMap = data.organizations || {};

  const renderLoanCards = (loans: typeof data.loans) => (
    loans.length === 0 ? (
      <Card className="p-6 sm:p-8 text-center text-muted-foreground text-sm">У вас нет договоров займа</Card>
    ) : loans.map(loan => (
      <Card key={loan.id} className="hover:shadow-md transition-shadow active:scale-[0.99]">
        <CardContent className="p-3 sm:p-4">
          <div className="cursor-pointer" onClick={() => onOpenLoan(loan)}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="FileText" size={16} className="text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm truncate">{loan.contract_no}</span>
              </div>
              <Badge variant={statusVariant(loan.status) as "default"|"destructive"|"secondary"} className="text-xs shrink-0 ml-2">{statusLabel[loan.status] || loan.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Сумма</div><div className="font-medium">{fmt(loan.amount)}</div></div>
              <div><div className="text-xs text-muted-foreground">Ставка</div><div className="font-medium">{loan.rate}%</div></div>
              <div><div className="text-xs text-muted-foreground">Платёж</div><div className="font-medium">{fmt(loan.monthly_payment)}</div></div>
              <div><div className="text-xs text-muted-foreground">Остаток</div><div className="font-bold text-primary">{fmt(loan.balance)}</div></div>
            </div>
            {(() => {
              const next = getNextPaymentInfo(loan);
              if (!next) return null;
              const urgent = next.daysLeft <= 3;
              const soon = next.daysLeft <= 7;
              return (
                <div className={`mt-3 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold ${
                  urgent
                    ? "bg-red-50 text-red-600 border border-red-200 animate-pulse"
                    : soon
                      ? "bg-orange-50 text-orange-600 border border-orange-200"
                      : "bg-blue-50 text-blue-600 border border-blue-200"
                }`}>
                  <Icon name={urgent ? "AlertTriangle" : "Calendar"} size={16} className="shrink-0" />
                  <span>Оплатить до <span className="font-bold">{next.date}</span></span>
                  {next.daysLeft === 0 && <span className="text-xs ml-auto">(сегодня!)</span>}
                  {next.daysLeft === 1 && <span className="text-xs ml-auto">(завтра)</span>}
                  {next.daysLeft > 1 && next.daysLeft <= 7 && <span className="text-xs ml-auto">({next.daysLeft} дн.)</span>}
                </div>
              );
            })()}
            <div className="text-xs text-muted-foreground mt-2">{fmtDate(loan.start_date)} — {fmtDate(loan.end_date)} / {loan.term_months} мес.</div>
          </div>
          {(loan.status === "active" || loan.status === "overdue") && loan.org_id && (
            <PaymentQR
              org={orgsMap[String(loan.org_id)]}
              payerName={userName}
              contractNo={loan.contract_no}
              sum={loan.monthly_payment}
              label="Оплата займа"
            />
          )}
        </CardContent>
      </Card>
    ))
  );

  const renderSavingCards = (savings: typeof data.savings) => (
    savings.length === 0 ? (
      <Card className="p-6 sm:p-8 text-center text-muted-foreground text-sm">У вас нет договоров сбережений</Card>
    ) : savings.map(s => (
      <Card key={s.id} className="hover:shadow-md transition-shadow active:scale-[0.99]">
        <CardContent className="p-3 sm:p-4">
          <div className="cursor-pointer" onClick={() => onOpenSaving(s)}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Icon name="PiggyBank" size={16} className="text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm truncate">{s.contract_no}</span>
              </div>
              <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-xs shrink-0 ml-2">{s.status === "active" ? "Активен" : "Закрыт"}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Сумма вклада</div><div className="font-medium">{fmt(s.amount)}</div></div>
              <div><div className="text-xs text-muted-foreground">Ставка</div><div className="font-medium">{s.rate}%</div></div>
              <div>
                <div className="text-xs text-muted-foreground">Начислено %{s.last_accrual_date ? ` на ${fmtDate(s.last_accrual_date)}` : ""}</div>
                <div className="font-medium text-green-600">{fmt((s.total_daily_accrued || 0) - (s.paid_interest || 0))}</div>
              </div>
              <div><div className="text-xs text-muted-foreground">Баланс</div><div className="font-bold text-primary">{fmt(s.current_balance || s.amount)}</div></div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">{fmtDate(s.start_date)} — {fmtDate(s.end_date)} / {s.term_months} мес. / {s.payout_type === "monthly" ? "Ежемесячно" : "В конце срока"}</div>
          </div>
          {s.status === "active" && s.org_id && (
            <PaymentQR
              org={orgsMap[String(s.org_id)]}
              payerName={userName}
              contractNo={s.contract_no}
              sum={10000}
              label="Пополнение сбережений"
            />
          )}
        </CardContent>
      </Card>
    ))
  );

  const renderShareCards = (shares: typeof data.shares) => (
    shares.length === 0 ? (
      <Card className="p-6 sm:p-8 text-center text-muted-foreground text-sm">У вас нет паевых счетов</Card>
    ) : shares.map(a => (
      <Card key={a.id}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Icon name="Wallet" size={16} className="text-muted-foreground shrink-0" />
              <span className="font-semibold text-sm truncate">{a.account_no}</span>
            </div>
            <Badge variant="default" className="text-xs shrink-0 ml-2">Активен</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 text-sm">
            <div><div className="text-xs text-muted-foreground">Баланс</div><div className="font-bold text-primary">{fmt(a.balance)}</div></div>
            <div><div className="text-xs text-muted-foreground">Внесено</div><div className="font-medium">{fmt(a.total_in)}</div></div>
            <div><div className="text-xs text-muted-foreground">Выплачено</div><div className="font-medium">{fmt(a.total_out)}</div></div>
          </div>
        </CardContent>
      </Card>
    ))
  );

  const renderProductTabs = (loans: typeof data.loans, savings: typeof data.savings, shares: typeof data.shares) => (
    <Tabs defaultValue="loans" className="space-y-4">
      <TabsList className="w-full flex">
        <TabsTrigger value="loans" className="flex-1 gap-1 text-xs sm:text-sm sm:gap-1.5"><Icon name="FileText" size={14} className="hidden sm:block" />Займы ({loans.length})</TabsTrigger>
        <TabsTrigger value="savings" className="flex-1 gap-1 text-xs sm:text-sm sm:gap-1.5"><Icon name="PiggyBank" size={14} className="hidden sm:block" />Сбережения ({savings.length})</TabsTrigger>
        <TabsTrigger value="shares" className="flex-1 gap-1 text-xs sm:text-sm sm:gap-1.5"><Icon name="Wallet" size={14} className="hidden sm:block" />Паевые ({shares.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="loans" className="space-y-3">{renderLoanCards(loans)}</TabsContent>
      <TabsContent value="savings" className="space-y-3">{renderSavingCards(savings)}</TabsContent>
      <TabsContent value="shares" className="space-y-3">{renderShareCards(shares)}</TabsContent>
    </Tabs>
  );

  return (
    <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0"><Icon name="TrendingDown" size={20} className="text-red-500" /></div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Задолженность</div>
              <div className="text-lg font-bold truncate">{fmt(totalLoanBalance)}</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs leading-tight text-red-500">Своевременный платёж — залог положительной кредитной истории</div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0"><Icon name="PiggyBank" size={20} className="text-green-600" /></div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Сбережения</div>
              <div className="text-lg font-bold truncate">{fmt(totalSavings)}</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs leading-tight text-green-600">Сбережения растут каждый день! Пополняйте — ускоряйте рост</div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Icon name="Wallet" size={20} className="text-blue-600" /></div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Паевые взносы</div>
              <div className="text-lg font-bold truncate">{fmt(totalShares)}</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] sm:text-xs leading-tight text-blue-600">Увеличьте участие в фонде — повысьте доход по итогам года!</div>
        </Card>
      </div>

      {renderProductTabs(data.loans, data.savings, data.shares)}
    </main>
  );
};

export default CabinetDashboard;