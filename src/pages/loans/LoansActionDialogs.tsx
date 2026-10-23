import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EarlyRepaymentPreview, LoanDetail } from "@/lib/api";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";
const toNumber = (v: string) => Number(String(v || "0").replace(",", ".")) || 0;

interface LoansActionDialogsProps {
  detail: LoanDetail | null;
  saving: boolean;
  showPayment: boolean;
  setShowPayment: (v: boolean) => void;
  payForm: { amount: string; date: string; manual: boolean; principal: string; interest: string; penalty: string };
  setPayForm: (v: { amount: string; date: string; manual: boolean; principal: string; interest: string; penalty: string }) => void;
  handlePayment: () => void;
  showEarly: boolean;
  setShowEarly: (v: boolean) => void;
  earlyForm: { mode: "partial" | "full"; amount: string; repayment_type: string; date: string };
  setEarlyForm: (v: { mode: "partial" | "full"; amount: string; repayment_type: string; date: string }) => void;
  earlyPreview: EarlyRepaymentPreview | null;
  calculatingEarly: boolean;
  calculateEarly: () => void;
  handleEarlyRepay: () => void;
  showEditPayment: boolean;
  setShowEditPayment: (v: boolean) => void;
  editPayForm: { payment_id: number; payment_date: string; amount: string; principal_part: string; interest_part: string; penalty_part: string; manual_distribution: boolean };
  setEditPayForm: (v: { payment_id: number; payment_date: string; amount: string; principal_part: string; interest_part: string; penalty_part: string; manual_distribution: boolean }) => void;
  handleEditPayment: () => void;
}

const LoansActionDialogs = (props: LoansActionDialogsProps) => {
  const { detail, saving } = props;
  const distributionMismatch = props.payForm.manual && Math.abs(
    toNumber(props.payForm.amount) - toNumber(props.payForm.principal) -
    toNumber(props.payForm.interest) - toNumber(props.payForm.penalty)
  ) > 0.01;
  const editMismatch = Math.abs(toNumber(props.editPayForm.amount) - toNumber(props.editPayForm.principal_part) -
    toNumber(props.editPayForm.interest_part) - toNumber(props.editPayForm.penalty_part)) > 0.01;

  return <>
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
          {distributionMismatch && <div className="text-xs text-red-600">Сумма распределения должна совпадать с суммой платежа</div>}
        </div>
        <DialogFooter><Button onClick={props.handlePayment} disabled={saving || distributionMismatch}>Внести</Button></DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={props.showEarly} onOpenChange={props.setShowEarly}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Досрочное погашение</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Текущий остаток: {detail ? fmt(detail.balance) : "—"}</div>
          <div>
            <Label>Вид погашения</Label>
            <Select value={props.earlyForm.mode} onValueChange={(v: "partial" | "full") => props.setEarlyForm({ ...props.earlyForm, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="partial">Частичное — прогноз графика</SelectItem>
                <SelectItem value="full">Полное — сумма к закрытию</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {props.earlyForm.mode === "partial" && <div><Label>Планируемая сумма</Label><Input type="number" min="0.01" step="0.01" value={props.earlyForm.amount} onChange={e => props.setEarlyForm({ ...props.earlyForm, amount: e.target.value })} /></div>}
          <div><Label>Дата</Label><Input type="date" value={props.earlyForm.date} onChange={e => props.setEarlyForm({ ...props.earlyForm, date: e.target.value })} /></div>
          {props.earlyForm.mode === "partial" && <div>
            <Label>После погашения</Label>
            <Select value={props.earlyForm.repayment_type} onValueChange={v => props.setEarlyForm({ ...props.earlyForm, repayment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reduce_payment">Уменьшить платёж, сохранить срок</SelectItem>
                <SelectItem value="reduce_term">Сохранить платёж, сократить срок</SelectItem>
              </SelectContent>
            </Select>
          </div>}
          {props.earlyPreview && <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm" aria-live="polite">
            <div className="font-semibold">{props.earlyPreview.is_full ? "Сумма для полного погашения" : "Прогноз после погашения"}: {fmt(props.earlyPreview.amount)}</div>
            <div>Основной долг: {fmt(props.earlyPreview.principal_part)} · Проценты: {fmt(props.earlyPreview.interest_part)}</div>
            {props.earlyPreview.penalty_part > 0 && <div>Пени: {fmt(props.earlyPreview.penalty_part)}</div>}
            {props.earlyPreview.is_full ? <div>Договор будет закрыт {props.earlyPreview.payment_date.split("-").reverse().join(".")}.</div> : <>
              <div>Остаток долга: {fmt(props.earlyPreview.new_balance)}</div>
              {props.earlyForm.repayment_type === "reduce_payment" ?
                <div>Платёж: {fmt(props.earlyPreview.old_monthly)} → {fmt(props.earlyPreview.new_monthly)}. Срок до {props.earlyPreview.new_end_date.split("-").reverse().join(".")}.</div> :
                <div>Срок: до {props.earlyPreview.old_end_date.split("-").reverse().join(".")} → до {props.earlyPreview.new_end_date.split("-").reverse().join(".")}. Платёж: {fmt(props.earlyPreview.new_monthly)}.</div>}
              {props.earlyPreview.next_payment_date && <div>Ближайший платёж по новому графику: {fmt(props.earlyPreview.next_payment_amount || 0)} — {props.earlyPreview.next_payment_date.split("-").reverse().join(".")}.</div>}
            </>}
            <div className="text-xs text-muted-foreground">Расчёт актуален для выбранной даты при неизменной задолженности.</div>
          </div>}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={props.calculateEarly} disabled={saving || props.calculatingEarly || !props.earlyForm.date || (props.earlyForm.mode === "partial" && !(toNumber(props.earlyForm.amount) > 0))}>{props.calculatingEarly ? "Расчёт…" : "Рассчитать"}</Button>
          <Button onClick={props.handleEarlyRepay} disabled={saving || props.calculatingEarly || !props.earlyPreview}>{saving ? "Проведение…" : "Провести погашение"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={props.showEditPayment} onOpenChange={props.setShowEditPayment}>
      <DialogContent>
        <DialogHeader><DialogTitle>Редактирование платежа</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <div><Label>Дата</Label><Input type="date" value={props.editPayForm.payment_date} onChange={e => props.setEditPayForm({ ...props.editPayForm, payment_date: e.target.value })} /></div>
          <div><Label>Сумма</Label><Input type="number" value={props.editPayForm.amount} onChange={e => props.setEditPayForm({ ...props.editPayForm, amount: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Основной долг</Label><Input type="number" value={props.editPayForm.principal_part} onChange={e => props.setEditPayForm({ ...props.editPayForm, principal_part: e.target.value })} /></div>
            <div><Label>Проценты</Label><Input type="number" value={props.editPayForm.interest_part} onChange={e => props.setEditPayForm({ ...props.editPayForm, interest_part: e.target.value })} /></div>
            <div><Label>Штрафы</Label><Input type="number" value={props.editPayForm.penalty_part} onChange={e => props.setEditPayForm({ ...props.editPayForm, penalty_part: e.target.value })} /></div>
          </div>
          <div className="rounded-md border bg-amber-50 p-3 text-xs text-amber-800">Распределение будет сохранено вручную. Сумма частей должна совпадать с общей суммой платежа.</div>
          {editMismatch && <div className="text-xs text-red-600">Сумма частей не совпадает с общей суммой</div>}
        </div>
        <DialogFooter><Button onClick={props.handleEditPayment} disabled={saving || editMismatch || !props.editPayForm.payment_date}>Сохранить</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
};

export default LoansActionDialogs;
