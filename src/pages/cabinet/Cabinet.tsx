import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, { CabinetOverview, CabinetOrgInfo, LoanDetail, CabinetSavingDetail, Loan, Saving, ShareAccount, ScheduleItem, SavingsScheduleItem, InterestPayout, SavingTransaction } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";
import { buildPaymentQRString } from "@/lib/payment-qr";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " \u20BD";
const fmtDate = (d: string) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };

const statusLabel: Record<string, string> = { active: "Активен", overdue: "Просрочен", closed: "Закрыт", pending: "Ожидается", paid: "Оплачен", partial: "Частично" };
const statusVariant = (s: string) => s === "active" || s === "paid" ? "default" : s === "overdue" ? "destructive" : "secondary";

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

const Cabinet = () => {
  const [data, setData] = useState<CabinetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [loanDetail, setLoanDetail] = useState<LoanDetail | null>(null);
  const [savingDetail, setSavingDetail] = useState<CabinetSavingDetail | null>(null);
  const [showLoan, setShowLoan] = useState(false);
  const [showSaving, setShowSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ old: "", new_pw: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const token = localStorage.getItem("cabinet_token") || "";

  useEffect(() => {
    if (!token) { navigate("/cabinet/login"); return; }
    const user = localStorage.getItem("cabinet_user");
    if (user) { try { setUserName(JSON.parse(user).name); } catch { /* skip */ } }
    api.cabinet.overview(token).then(setData).catch(() => {
      localStorage.removeItem("cabinet_token");
      localStorage.removeItem("cabinet_user");
      navigate("/cabinet/login");
    }).finally(() => setLoading(false));
  }, [token, navigate]);

  const handleLogout = async () => {
    await api.auth.logout(token);
    localStorage.removeItem("cabinet_token");
    localStorage.removeItem("cabinet_user");
    navigate("/cabinet/login");
  };

  const openLoan = async (loan: Loan) => {
    const d = await api.cabinet.loanDetail(token, loan.id);
    setLoanDetail(d);
    setShowLoan(true);
  };

  const openSaving = async (s: Saving) => {
    const d = await api.cabinet.savingDetail(token, s.id);
    setSavingDetail(d);
    setShowSaving(true);
  };

  const handleChangePassword = async () => {
    if (pwForm.new_pw.length < 6) {
      toast({ title: "Пароль должен быть не менее 6 символов", variant: "destructive" });
      return;
    }
    if (pwForm.new_pw !== pwForm.confirm) {
      toast({ title: "Пароли не совпадают", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    try {
      const res = await api.auth.changePassword(token, pwForm.old, pwForm.new_pw);
      if (res.success) {
        toast({ title: "Пароль изменён" });
        setShowPassword(false);
        setPwForm({ old: "", new_pw: "", confirm: "" });
      }
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSavingPw(false);
    }
  };

  const orgGroups = useMemo(() => {
    if (!data) return [];
    const orgMap = new Map<number, string>();
    [...data.loans, ...data.savings, ...data.shares].forEach(item => {
      const oid = item.org_id;
      const oname = item.org_short_name || item.org_name;
      if (oid && oname) orgMap.set(oid, oname);
    });
    return Array.from(orgMap.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
      <Icon name="Loader2" size={40} className="animate-spin text-primary" />
    </div>
  );

  if (!data) return null;

  const totalLoanBalance = data.loans.filter(l => l.status === "active").reduce((s, l) => s + l.balance, 0);
  const totalSavings = data.savings.filter(s => s.status === "active").reduce((s, i) => s + (i.current_balance || i.amount), 0);
  const totalShares = data.shares.reduce((s, a) => s + a.balance, 0);

  const orgsMap = data.organizations || {};

  const renderLoanCards = (loans: typeof data.loans) => (
    loans.length === 0 ? (
      <Card className="p-6 sm:p-8 text-center text-muted-foreground text-sm">У вас нет договоров займа</Card>
    ) : loans.map(loan => (
      <Card key={loan.id} className="hover:shadow-md transition-shadow active:scale-[0.99]">
        <CardContent className="p-3 sm:p-4">
          <div className="cursor-pointer" onClick={() => openLoan(loan)}>
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
          <div className="cursor-pointer" onClick={() => openSaving(s)}>
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
                <div className="font-medium text-green-600">{fmt(s.total_daily_accrued || s.accrued_interest)}</div>
                {(s.total_daily_accrued || 0) - (s.paid_interest || 0) > 0 && (
                  <div className="text-[10px] text-amber-600">не выплачено: {fmt((s.total_daily_accrued || 0) - (s.paid_interest || 0))}</div>
                )}
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Icon name="Shield" size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{userName}</div>
              <div className="text-xs text-muted-foreground">{data.info.member_no}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:hidden" onClick={() => { setPwForm({ old: "", new_pw: "", confirm: "" }); setShowPassword(true); }}>
              <Icon name="Lock" size={16} />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:hidden text-destructive" onClick={handleLogout}>
              <Icon name="LogOut" size={16} />
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs hidden sm:inline-flex" onClick={() => { setPwForm({ old: "", new_pw: "", confirm: "" }); setShowPassword(true); }}>
              <Icon name="Lock" size={14} />Сменить пароль
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-destructive hidden sm:inline-flex" onClick={handleLogout}>
              <Icon name="LogOut" size={14} />Выход
            </Button>
          </div>
        </div>
      </header>

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
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0"><Icon name="PiggyBank" size={20} className="text-green-600" /></div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Сбережения</div>
                <div className="text-lg font-bold truncate">{fmt(totalSavings)}</div>
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><Icon name="Wallet" size={20} className="text-blue-600" /></div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Паевые взносы</div>
                <div className="text-lg font-bold truncate">{fmt(totalShares)}</div>
              </div>
            </div>
          </Card>
        </div>

        {orgGroups.length <= 1 ? (
          renderProductTabs(data.loans, data.savings, data.shares)
        ) : (
          <Tabs defaultValue={String(orgGroups[0]?.id)} className="space-y-4">
            <TabsList className="w-full flex flex-wrap">
              {orgGroups.map(og => (
                <TabsTrigger key={og.id} value={String(og.id)} className="flex-1 gap-1 text-xs sm:text-sm sm:gap-1.5">
                  <Icon name="Building2" size={14} className="hidden sm:block" />{og.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {orgGroups.map(og => {
              const orgLoans = data.loans.filter(l => l.org_id === og.id);
              const orgSavings = data.savings.filter(s => s.org_id === og.id);
              const orgShares = data.shares.filter(a => a.org_id === og.id);
              return (
                <TabsContent key={og.id} value={String(og.id)} className="space-y-4">
                  {renderProductTabs(orgLoans, orgSavings, orgShares)}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </main>

      <Dialog open={showLoan} onOpenChange={setShowLoan}>
        <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] sm:w-auto max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-base sm:text-lg">Договор {loanDetail?.contract_no}</DialogTitle></DialogHeader>
          {loanDetail && <LoanDetailView loan={loanDetail} />}
        </DialogContent>
      </Dialog>

      <Dialog open={showSaving} onOpenChange={setShowSaving}>
        <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] sm:w-auto max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-base sm:text-lg">Договор {savingDetail?.contract_no}</DialogTitle></DialogHeader>
          {savingDetail && <SavingDetailView saving={savingDetail} />}
        </DialogContent>
      </Dialog>

      <Dialog open={showPassword} onOpenChange={setShowPassword}>
        <DialogContent className="max-w-md w-[calc(100vw-1rem)] sm:w-auto">
          <DialogHeader><DialogTitle>Смена пароля</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Текущий пароль</Label>
              <Input type="password" value={pwForm.old} onChange={e => setPwForm(p => ({ ...p, old: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Новый пароль</Label>
              <Input type="password" value={pwForm.new_pw} onChange={e => setPwForm(p => ({ ...p, new_pw: e.target.value }))} placeholder="Минимум 6 символов" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Подтвердите новый пароль</Label>
              <Input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleChangePassword()} />
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPassword(false)} className="w-full sm:w-auto">Отмена</Button>
              <Button onClick={handleChangePassword} disabled={savingPw || pwForm.new_pw.length < 6} className="gap-2 w-full sm:w-auto">
                {savingPw ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Lock" size={16} />}
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const MobileRow = ({ label, value, className }: { label: string; value: string; className?: string }) => (
  <div className="flex justify-between items-baseline py-1.5 border-b border-muted/40 last:border-0">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-sm font-medium text-right ${className || ""}`}>{value}</span>
  </div>
);

const LoanDetailView = ({ loan }: { loan: LoanDetail }) => (
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
    </Tabs>
  </div>
);

const SavingDetailView = ({ saving }: { saving: CabinetSavingDetail }) => (
  <div className="space-y-4">
    <div className="hidden sm:grid grid-cols-5 gap-3">
      <div><div className="text-xs text-muted-foreground">Сумма вклада</div><div className="text-sm font-medium">{fmt(saving.amount)}</div></div>
      <div><div className="text-xs text-muted-foreground">Ставка</div><div className="text-sm font-medium">{saving.rate}%</div></div>
      <div>
        <div className="text-xs text-muted-foreground">Начислено %{saving.last_accrual_date ? ` на ${fmtDate(saving.last_accrual_date)}` : ""}</div>
        <div className="text-sm font-medium text-green-600">{fmt(saving.total_daily_accrued || 0)}</div>
        {(saving.total_daily_accrued || 0) - (saving.paid_interest || 0) > 0 && (
          <div className="text-[11px] text-amber-600 mt-0.5">не выплачено: {fmt((saving.total_daily_accrued || 0) - (saving.paid_interest || 0))}</div>
        )}
      </div>
      <div><div className="text-xs text-muted-foreground">Выплачено %</div><div className="text-sm font-medium">{fmt(saving.paid_interest)}</div></div>
      <div><div className="text-xs text-muted-foreground">Баланс</div><div className="text-sm font-bold text-primary">{fmt(saving.current_balance || saving.amount)}</div></div>
    </div>
    <div className="sm:hidden">
      <MobileRow label="Сумма вклада" value={fmt(saving.amount)} />
      <MobileRow label="Ставка" value={`${saving.rate}%`} />
      <MobileRow label={`Начислено %${saving.last_accrual_date ? ` на ${fmtDate(saving.last_accrual_date)}` : ""}`} value={fmt(saving.total_daily_accrued || 0)} className="text-green-600" />
      {(saving.total_daily_accrued || 0) - (saving.paid_interest || 0) > 0 && (
        <MobileRow label="⤷ не выплачено" value={fmt((saving.total_daily_accrued || 0) - (saving.paid_interest || 0))} className="text-amber-600 text-xs" />
      )}
      <MobileRow label="Выплачено %" value={fmt(saving.paid_interest)} />
      <MobileRow label="Баланс" value={fmt(saving.current_balance || saving.amount)} className="font-bold text-primary" />
    </div>
    <div className="text-xs text-muted-foreground">
      {fmtDate(saving.start_date)} — {fmtDate(saving.end_date)} / {saving.term_months} мес. / {saving.payout_type === "monthly" ? "Ежемес. выплата %" : "Выплата % в конце срока"}
    </div>

    <Tabs defaultValue="payouts">
      <TabsList className="w-full flex">
        <TabsTrigger value="payouts" className="flex-1 text-xs sm:text-sm">Выплаты %</TabsTrigger>
        <TabsTrigger value="operations" className="flex-1 text-xs sm:text-sm">Операции</TabsTrigger>
        <TabsTrigger value="schedule" className="flex-1 text-xs sm:text-sm">График</TabsTrigger>
      </TabsList>

      <TabsContent value="payouts" className="mt-3">
        {!saving.interest_payouts?.length ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">Выплат процентов пока не было</Card>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto max-h-80 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0"><tr className="text-xs text-muted-foreground">
                  <th className="text-left py-2 px-3">Дата</th>
                  <th className="text-right py-2 px-3">Сумма</th>
                  <th className="text-left py-2 px-3">Примечание</th>
                </tr></thead>
                <tbody>{saving.interest_payouts.map((p: InterestPayout) => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="py-2 px-3">{fmtDate(p.transaction_date)}</td>
                    <td className="py-2 px-3 text-right font-medium text-green-600">{fmt(p.amount)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{p.description || "—"}</td>
                  </tr>
                ))}</tbody>
                <tfoot className="bg-muted/30 border-t font-medium">
                  <tr>
                    <td className="py-2 px-3 text-xs text-muted-foreground">Итого</td>
                    <td className="py-2 px-3 text-right text-green-600">{fmt(saving.interest_payouts.reduce((s: number, p: InterestPayout) => s + p.amount, 0))}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="sm:hidden space-y-2 max-h-[60vh] overflow-y-auto">
              {saving.interest_payouts.map((p: InterestPayout) => (
                <div key={p.id} className="py-2 border-b border-muted/40 last:border-0">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{fmtDate(p.transaction_date)}</span>
                    <span className="text-sm font-medium text-green-600">+{fmt(p.amount)}</span>
                  </div>
                  {p.description && <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>}
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t font-medium">
                <span className="text-xs text-muted-foreground">Итого выплачено</span>
                <span className="text-sm text-green-600">{fmt(saving.interest_payouts.reduce((s: number, p: InterestPayout) => s + p.amount, 0))}</span>
              </div>
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="operations" className="mt-3">
        {!saving.transactions?.length ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">Пополнений и изъятий не было</Card>
        ) : (
          <>
            <div className="hidden sm:block overflow-x-auto max-h-80 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0"><tr className="text-xs text-muted-foreground">
                  <th className="text-left py-2 px-3">Дата</th>
                  <th className="text-left py-2 px-3">Тип</th>
                  <th className="text-right py-2 px-3">Сумма</th>
                  <th className="text-left py-2 px-3">Примечание</th>
                </tr></thead>
                <tbody>{saving.transactions.map((t: SavingTransaction) => (
                  <tr key={t.id} className="border-t hover:bg-muted/30">
                    <td className="py-2 px-3">{fmtDate(t.transaction_date)}</td>
                    <td className="py-2 px-3">{t.transaction_type === "deposit" ? "Пополнение" : "Изъятие"}</td>
                    <td className={`py-2 px-3 text-right font-medium ${t.transaction_type === "deposit" ? "text-green-600" : "text-red-600"}`}>{t.transaction_type === "deposit" ? "+" : "−"}{fmt(Math.abs(t.amount))}</td>
                    <td className="py-2 px-3 text-muted-foreground">{t.description || "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="sm:hidden space-y-2 max-h-[60vh] overflow-y-auto">
              {saving.transactions.map((t: SavingTransaction) => (
                <div key={t.id} className="py-2 border-b border-muted/40 last:border-0">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{fmtDate(t.transaction_date)} · {t.transaction_type === "deposit" ? "Пополнение" : "Изъятие"}</span>
                    <span className={`text-sm font-medium ${t.transaction_type === "deposit" ? "text-green-600" : "text-red-600"}`}>{t.transaction_type === "deposit" ? "+" : "−"}{fmt(Math.abs(t.amount))}</span>
                  </div>
                  {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </TabsContent>

      <TabsContent value="schedule" className="mt-3">
        <p className="text-xs text-muted-foreground mb-2">Фактические проценты начисляются ежедневно на остаток.</p>
        <div className="hidden sm:block overflow-x-auto max-h-80 overflow-y-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0"><tr className="text-xs text-muted-foreground">
              <th className="text-left py-2 px-3">N</th><th className="text-left py-2 px-3">Период</th>
              <th className="text-right py-2 px-3">Проценты</th><th className="text-right py-2 px-3">Накоплено</th>
              <th className="text-right py-2 px-3">Баланс</th>
            </tr></thead>
            <tbody>{saving.schedule.map((r: SavingsScheduleItem) => (
              <tr key={r.period_no} className="border-t hover:bg-muted/30">
                <td className="py-2 px-3">{r.period_no}</td>
                <td className="py-2 px-3">{fmtDate(r.period_start)} — {fmtDate(r.period_end)}</td>
                <td className="py-2 px-3 text-right font-medium text-green-600">{fmt(r.interest_amount)}</td>
                <td className="py-2 px-3 text-right">{fmt(r.cumulative_interest)}</td>
                <td className="py-2 px-3 text-right font-medium">{fmt(r.balance_after)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="sm:hidden space-y-2 max-h-[60vh] overflow-y-auto">
          {saving.schedule.map((r: SavingsScheduleItem) => (
            <div key={r.period_no} className="py-2 border-b border-muted/40 last:border-0">
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-muted-foreground">#{r.period_no} · {fmtDate(r.period_end)}</span>
                <span className="text-sm font-medium text-green-600">+{fmt(r.interest_amount)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Накоплено: {fmt(r.cumulative_interest)}</span>
                <span>Баланс: {fmt(r.balance_after)}</span>
              </div>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  </div>
);

export default Cabinet;