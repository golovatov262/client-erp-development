import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CabinetSavingDetail, SavingsScheduleItem, InterestPayout, SavingTransaction } from "@/lib/api";
import { fmt, fmtDate, MobileRow } from "./cabinet-utils";

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

export default SavingDetailView;
