import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { LoanDetail, ScheduleItem } from "@/lib/api";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
const toNumber = (v: string) => Number(String(v || "0").replace(',', '.')) || 0;
const fmtDate = (d: string) => { if (!d) return ""; const p = d.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d; };

interface LoansActionDialogsProps {
  detail: LoanDetail | null;
  saving: boolean;

  showPayment: boolean;
  setShowPayment: (v: boolean) => void;
  payForm: { amount: string; date: string; manual: boolean; principal: string; interest: string; penalty: string };
  setPayForm: (v: { amount: string; date: string; manual: boolean; principal: string; interest: string; penalty: string }) => void;
  handlePayment: (strategy?: string) => void;

  showEarly: boolean;
  setShowEarly: (v: boolean) => void;
  earlyForm: { amount: string; repayment_type: string; date: string };
  setEarlyForm: (v: { amount: string; repayment_type: string; date: string }) => void;
  earlyPreview: ScheduleItem[] | null;
  earlyMonthly: number;
  handleEarlyPreview: () => void;
  handleEarlyRepay: () => void;

  showModify: boolean;
  setShowModify: (v: boolean) => void;
  modifyForm: { new_rate: string; new_term: string; new_amount: string; effective_date: string };
  setModifyForm: (v: { new_rate: string; new_term: string; new_amount: string; effective_date: string }) => void;
  modifyPreview: ScheduleItem[] | null;
  modifyMonthly: number;
  handleModifyPreview: () => void;
  handleModify: () => void;

  showEditPayment: boolean;
  setShowEditPayment: (v: boolean) => void;
  editPayForm: { payment_id: number; payment_date: string; amount: string; principal_part: string; interest_part: string; penalty_part: string; manual_distribution: boolean };
  setEditPayForm: (v: { payment_id: number; payment_date: string; amount: string; principal_part: string; interest_part: string; penalty_part: string; manual_distribution: boolean }) => void;
  handleEditPayment: () => void;

  showOverpayChoice: boolean;
  setShowOverpayChoice: (v: boolean) => void;
  overpayOptions: Record<string, { new_monthly: number; new_term: number; description: string }>;
  overpayInfo: { overpay_amount: number; current_payment: number; total_amount: number };
  handlePayment: (strategy?: string) => void;
}

const LoansActionDialogs = (props: LoansActionDialogsProps) => {
  const { detail, saving } = props;

  return (
    <>
      <Dialog open={props.showPayment} onOpenChange={props.setShowPayment}>
        <DialogContent>
          <DialogHeader><DialogTitle>Внести платёж</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Остаток: {detail ? fmt(detail.balance) : "—"}</div>
            <div><Label>Сумма</Label><Input type="number" value={props.payForm.amount} onChange={e => props.setPayForm({ ...props.payForm, amount: e.target.value })} /></div>
            <div><Label>Дата</Label><Input type="date" value={props.payForm.date} onChange={e => props.setPayForm({ ...props.payForm, date: e.target.value })} /></div>
            <div className="flex items-center gap-2 py-1">
              <input type="checkbox" id="new_manual_dist" checked={props.payForm.manual} onChange={e => props.setPayForm({ ...props.payForm, manual: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="new_manual_dist" className="cursor-pointer text-sm font-medium">Принудительное распределение по данным 1С</Label>
            </div>
            {props.payForm.manual && <div className="grid grid-cols-3 gap-2">
              <div><Label>Основной долг</Label><Input type="number" value={props.payForm.principal} onChange={e => props.setPayForm({ ...props.payForm, principal: e.target.value })} /></div>
              <div><Label>Проценты</Label><Input type="number" value={props.payForm.interest} onChange={e => props.setPayForm({ ...props.payForm, interest: e.target.value })} /></div>
              <div><Label>Пени</Label><Input type="number" value={props.payForm.penalty} onChange={e => props.setPayForm({ ...props.payForm, penalty: e.target.value })} /></div>
            </div>}
            {props.payForm.manual && Math.abs(toNumber(props.payForm.amount) - toNumber(props.payForm.principal) - toNumber(props.payForm.interest) - toNumber(props.payForm.penalty)) > 0.01 &&
              <div className="text-xs text-red-600">Сумма распределения должна совпадать с суммой платежа</div>}
          </div>
          <DialogFooter><Button onClick={() => props.handlePayment()} disabled={saving || (props.payForm.manual && Math.abs(toNumber(props.payForm.amount) - toNumber(props.payForm.principal) - toNumber(props.payForm.interest) - toNumber(props.payForm.penalty)) > 0.01)}>Внести</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showEarly} onOpenChange={props.setShowEarly}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Досрочное погашение</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Текущий остаток: {detail ? fmt(detail.balance) : "—"}</div>
            <div><Label>Сумма</Label><Input type="number" value={props.earlyForm.amount} onChange={e => props.setEarlyForm({ ...props.earlyForm, amount: e.target.value })} /></div>
            <div><Label>Дата</Label><Input type="date" value={props.earlyForm.date} onChange={e => props.setEarlyForm({ ...props.earlyForm, date: e.target.value })} /></div>
            <div><Label>Тип погашения</Label><Select value={props.earlyForm.repayment_type} onValueChange={v => props.setEarlyForm({ ...props.earlyForm, repayment_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reduce_term">Сократить срок</SelectItem><SelectItem value="reduce_payment">Уменьшить платёж</SelectItem></SelectContent></Select></div>
            <Button onClick={props.handleEarlyPreview} disabled={!props.earlyForm.amount} size="sm" className="w-full">Показать новый график</Button>
            {props.earlyPreview && (
              <Card className="p-3 text-sm">
                <div className="font-medium mb-1">Новый график:</div>
                <div>Новый платёж: {fmt(props.earlyMonthly)}</div>
                <div>Периодов: {props.earlyPreview.length}</div>
              </Card>
            )}
          </div>
          <DialogFooter><Button onClick={props.handleEarlyRepay} disabled={saving}>Погасить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showModify} onOpenChange={props.setShowModify}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Изменить условия</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Текущие: сумма {detail ? fmt(detail.amount) : "—"}, остаток {detail ? fmt(detail.balance) : "—"}, ставка {detail ? detail.rate + "%" : "—"}, срок {detail ? detail.term_months + " мес." : "—"}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Дата изменений *</Label>
                <Input type="date" value={props.modifyForm.effective_date} onChange={e => props.setModifyForm({ ...props.modifyForm, effective_date: e.target.value })} />
              </div>
              <div>
                <Label>Новая сумма займа (доп. транш)</Label>
                <Input type="number" placeholder={detail ? String(detail.amount) : ""} value={props.modifyForm.new_amount} onChange={e => props.setModifyForm({ ...props.modifyForm, new_amount: e.target.value })} />
                {props.modifyForm.new_amount && detail && Number(props.modifyForm.new_amount) > detail.amount && (
                  <div className="text-xs text-green-600 mt-1">Доп. транш: +{fmt(Number(props.modifyForm.new_amount) - detail.amount)}</div>
                )}
                {props.modifyForm.new_amount && detail && Number(props.modifyForm.new_amount) <= detail.amount && (
                  <div className="text-xs text-red-500 mt-1">Сумма должна быть больше текущей ({fmt(detail.amount)})</div>
                )}
              </div>
              <div>
                <Label>Новая ставка (%)</Label>
                <Input type="number" step="0.01" placeholder={detail ? String(detail.rate) : ""} value={props.modifyForm.new_rate} onChange={e => props.setModifyForm({ ...props.modifyForm, new_rate: e.target.value })} />
              </div>
              <div>
                <Label>Новый срок (мес.)</Label>
                <Input type="number" placeholder={detail ? String(detail.term_months) : ""} value={props.modifyForm.new_term} onChange={e => props.setModifyForm({ ...props.modifyForm, new_term: e.target.value })} />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">Оставьте поле пустым, чтобы сохранить текущее значение. График пересчитается с даты изменений.</div>
            <Button onClick={props.handleModifyPreview} disabled={!props.modifyForm.effective_date || (!props.modifyForm.new_rate && !props.modifyForm.new_term && !props.modifyForm.new_amount)} size="sm" className="w-full">Показать новый график</Button>
            {props.modifyPreview && (
              <Card className="p-3 text-sm space-y-1">
                <div className="font-medium">Новый график:</div>
                <div>Ежемесячный платёж: <span className="font-bold">{fmt(props.modifyMonthly)}</span></div>
                <div>Периодов: {props.modifyPreview.length}</div>
                <div>Итого к выплате: {fmt(props.modifyPreview.reduce((s, i) => s + i.payment_amount, 0))}</div>
              </Card>
            )}
          </div>
          <DialogFooter><Button onClick={props.handleModify} disabled={saving || !props.modifyForm.effective_date}>Изменить и пересчитать</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showEditPayment} onOpenChange={props.setShowEditPayment}>
        <DialogContent>
          <DialogHeader><DialogTitle>Редактирование платежа</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Дата</Label><Input type="date" value={props.editPayForm.payment_date} onChange={e => props.setEditPayForm({ ...props.editPayForm, payment_date: e.target.value })} /></div>
            <div><Label>Сумма</Label><Input type="number" value={props.editPayForm.amount} onChange={e => props.setEditPayForm({ ...props.editPayForm, amount: e.target.value })} /></div>
            <div className="flex items-center gap-2 py-1">
              <input type="checkbox" id="manual_dist" checked={props.editPayForm.manual_distribution} onChange={e => props.setEditPayForm({ ...props.editPayForm, manual_distribution: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              <Label htmlFor="manual_dist" className="cursor-pointer text-sm font-medium">Ручное распределение средств</Label>
            </div>
            {props.editPayForm.manual_distribution && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Распределение будет сохранено как есть и не будет пересчитано автоматически
              </div>
            )}
            <div><Label>Основной долг</Label><Input type="number" value={props.editPayForm.principal_part} onChange={e => props.setEditPayForm({ ...props.editPayForm, principal_part: e.target.value })} /></div>
            <div><Label>Проценты</Label><Input type="number" value={props.editPayForm.interest_part} onChange={e => props.setEditPayForm({ ...props.editPayForm, interest_part: e.target.value })} /></div>
            <div><Label>Штрафы</Label><Input type="number" value={props.editPayForm.penalty_part} onChange={e => props.setEditPayForm({ ...props.editPayForm, penalty_part: e.target.value })} /></div>
            {props.editPayForm.manual_distribution && (() => {
              const total = parseFloat(props.editPayForm.amount || "0");
              const parts = parseFloat(props.editPayForm.principal_part || "0") + parseFloat(props.editPayForm.interest_part || "0") + parseFloat(props.editPayForm.penalty_part || "0");
              const diff = Math.abs(total - parts);
              return diff > 0.01 ? (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                  Сумма частей ({parts.toFixed(2)} ₽) не совпадает с общей суммой ({total.toFixed(2)} ₽). Разница: {diff.toFixed(2)} ₽
                </div>
              ) : null;
            })()}
          </div>
          <DialogFooter><Button onClick={props.handleEditPayment} disabled={saving}>Сохранить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showOverpayChoice} onOpenChange={props.setShowOverpayChoice}>
        <DialogContent>
          <DialogHeader><DialogTitle>Выберите стратегию переплаты</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm">
              <div>Сумма платежа: <span className="font-medium">{fmt(props.overpayInfo.total_amount)}</span></div>
              <div>Текущий платёж: <span className="font-medium">{fmt(props.overpayInfo.current_payment)}</span></div>
              <div className="text-green-600">Переплата: <span className="font-bold">{fmt(props.overpayInfo.overpay_amount)}</span></div>
            </div>
            <div className="space-y-2">
              {Object.entries(props.overpayOptions).map(([key, opt]) => (
                <Button key={key} variant="outline" className="w-full justify-start h-auto p-3" onClick={() => props.handlePayment(key)}>
                  <div className="text-left">
                    <div className="font-medium">{opt.description}</div>
                    <div className="text-xs text-muted-foreground">Новый платёж: {fmt(opt.new_monthly)} · Срок: {opt.new_term} мес.</div>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default LoansActionDialogs;
