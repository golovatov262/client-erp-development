import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoanDetail } from "@/lib/api";

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
  earlyForm: { amount: string; repayment_type: string; date: string };
  setEarlyForm: (v: { amount: string; repayment_type: string; date: string }) => void;
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
          <div><Label>Сумма</Label><Input type="number" value={props.earlyForm.amount} onChange={e => props.setEarlyForm({ ...props.earlyForm, amount: e.target.value })} /></div>
          <div><Label>Дата</Label><Input type="date" value={props.earlyForm.date} onChange={e => props.setEarlyForm({ ...props.earlyForm, date: e.target.value })} /></div>
          <div>
            <Label>После погашения</Label>
            <Select value={props.earlyForm.repayment_type} onValueChange={v => props.setEarlyForm({ ...props.earlyForm, repayment_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="reduce_payment">Уменьшить платёж, сохранить срок</SelectItem>
                <SelectItem value="reduce_term">Сохранить платёж, сократить срок</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Сумма сначала погасит начисленные проценты. Только остаток, направленный на основной долг, изменит график.
          </div>
        </div>
        <DialogFooter><Button onClick={props.handleEarlyRepay} disabled={saving || !props.earlyForm.amount || !props.earlyForm.date}>{saving ? "Проведение…" : "Погасить"}</Button></DialogFooter>
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
