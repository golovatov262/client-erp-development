import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { SavingDetail } from "@/lib/api";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";

interface SavingsActionDialogsProps {
  detail: SavingDetail | null;
  saving: boolean;
  
  showDeposit: boolean;
  setShowDeposit: (v: boolean) => void;
  depositForm: { amount: string; date: string; is_cash: boolean };
  setDepositForm: (v: { amount: string; date: string; is_cash: boolean }) => void;
  handleDeposit: () => void;
  
  showInterest: boolean;
  setShowInterest: (v: boolean) => void;
  interestForm: { amount: string; date: string };
  setInterestForm: (v: { amount: string; date: string }) => void;
  handleInterestPayout: () => void;
  
  showWithdrawal: boolean;
  setShowWithdrawal: (v: boolean) => void;
  withdrawalForm: { amount: string; date: string };
  setWithdrawalForm: (v: { amount: string; date: string }) => void;
  handleWithdrawal: () => void;
  
  showClose: boolean;
  setShowClose: (v: boolean) => void;
  handleEarlyClose: () => void;
  handleCloseByTerm: () => void;
  
  showModifyTerm: boolean;
  setShowModifyTerm: (v: boolean) => void;
  modifyTermForm: { new_term: string; effective_date: string };
  setModifyTermForm: (v: { new_term: string; effective_date: string }) => void;
  handleModifyTerm: () => void;
  
  showBackfill: boolean;
  setShowBackfill: (v: boolean) => void;
  backfillForm: { date_from: string; date_to: string; mode: string };
  setBackfillForm: (v: { date_from: string; date_to: string; mode: string }) => void;
  handleBackfill: () => void;
  
  showRateChange: boolean;
  setShowRateChange: (v: boolean) => void;
  rateChangeForm: { new_rate: string; effective_date: string; reason: string };
  setRateChangeForm: (v: { new_rate: string; effective_date: string; reason: string }) => void;
  handleRateChange: () => void;
  
  showEditTx: boolean;
  setShowEditTx: (v: boolean) => void;
  editTxForm: { transaction_id: number; amount: string; transaction_date: string; description: string };
  setEditTxForm: (v: { transaction_id: number; amount: string; transaction_date: string; description: string }) => void;
  handleEditTx: () => void;
}

const SavingsActionDialogs = (props: SavingsActionDialogsProps) => {
  const { detail, saving } = props;

  return (
    <>
      <Dialog open={props.showDeposit} onOpenChange={props.setShowDeposit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Пополнение</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Сумма</Label><Input value={props.depositForm.amount} onChange={e => props.setDepositForm({ ...props.depositForm, amount: e.target.value })} /></div>
            <div><Label>Дата</Label><Input type="date" value={props.depositForm.date} onChange={e => props.setDepositForm({ ...props.depositForm, date: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Checkbox checked={props.depositForm.is_cash} onCheckedChange={v => props.setDepositForm({ ...props.depositForm, is_cash: v })} /><Label>Наличный</Label></div>
          </div>
          <DialogFooter><Button onClick={props.handleDeposit} disabled={saving}>Провести</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showInterest} onOpenChange={props.setShowInterest}>
        <DialogContent>
          <DialogHeader><DialogTitle>Выплата процентов</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Начислено: {detail ? fmt(detail.accrued_interest) : "—"}</div>
            <div><Label>Сумма (оставить пустым = всё)</Label><Input value={props.interestForm.amount} onChange={e => props.setInterestForm({ ...props.interestForm, amount: e.target.value })} /></div>
            <div><Label>Дата</Label><Input type="date" value={props.interestForm.date} onChange={e => props.setInterestForm({ ...props.interestForm, date: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={props.handleInterestPayout} disabled={saving}>Выплатить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showWithdrawal} onOpenChange={props.setShowWithdrawal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Частичное изъятие</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Доступно: {detail ? fmt(detail.current_balance) : "—"}</div>
            <div><Label>Сумма</Label><Input value={props.withdrawalForm.amount} onChange={e => props.setWithdrawalForm({ ...props.withdrawalForm, amount: e.target.value })} /></div>
            <div><Label>Дата</Label><Input type="date" value={props.withdrawalForm.date} onChange={e => props.setWithdrawalForm({ ...props.withdrawalForm, date: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={props.handleWithdrawal} disabled={saving}>Изъять</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showClose} onOpenChange={props.setShowClose}>
        <DialogContent>
          <DialogHeader><DialogTitle>Закрытие договора</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Выберите тип закрытия договора:</div>
            <div className="grid gap-2">
              <div className="border rounded-lg p-4 space-y-2">
                <div className="font-medium text-sm">Закрыть по сроку</div>
                <div className="text-xs text-muted-foreground">Пайщику выплачивается тело вклада + все начисленные проценты. Без пересчёта.</div>
                {detail && <div className="text-xs">К выплате: <span className="font-medium">{fmt(detail.current_balance + detail.accrued_interest)}</span></div>}
                <Button onClick={props.handleCloseByTerm} disabled={saving} size="sm" className="w-full">Закрыть по сроку</Button>
              </div>
              <div className="border border-destructive/30 rounded-lg p-4 space-y-2">
                <div className="font-medium text-sm text-destructive">Досрочно с пересчётом</div>
                <div className="text-xs text-muted-foreground">Проценты пересчитываются по штрафной ставке (0.1% от суммы). Переплата удерживается из тела вклада.</div>
                <Button onClick={props.handleEarlyClose} disabled={saving} size="sm" variant="destructive" className="w-full">Закрыть досрочно</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showModifyTerm} onOpenChange={props.setShowModifyTerm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Изменение срока</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Текущий срок: {detail ? detail.term_months + " мес." : "—"}</div>
            <div><Label>Новый срок (мес.)</Label><Input value={props.modifyTermForm.new_term} onChange={e => props.setModifyTermForm({ ...props.modifyTermForm, new_term: e.target.value })} /></div>
            <div><Label>Дата вступления в силу</Label><Input type="date" value={props.modifyTermForm.effective_date} onChange={e => props.setModifyTermForm({ ...props.modifyTermForm, effective_date: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={props.handleModifyTerm} disabled={saving}>Изменить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showBackfill} onOpenChange={props.setShowBackfill}>
        <DialogContent>
          <DialogHeader><DialogTitle>Доначисление процентов</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>С даты (включительно)</Label><Input type="date" value={props.backfillForm.date_from} onChange={e => props.setBackfillForm({ ...props.backfillForm, date_from: e.target.value })} /></div>
            <div><Label>До даты (включительно)</Label><Input type="date" value={props.backfillForm.date_to} onChange={e => props.setBackfillForm({ ...props.backfillForm, date_to: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Режим</Label>
              <div className="grid grid-cols-1 gap-2">
                <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${props.backfillForm.mode === 'add_missing' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" className="mt-0.5" checked={props.backfillForm.mode === 'add_missing'} onChange={() => props.setBackfillForm({ ...props.backfillForm, mode: 'add_missing' })} />
                  <div>
                    <div className="font-medium text-sm">Только добавить пропущенные</div>
                    <div className="text-xs text-muted-foreground">Начислит проценты за дни, которые ещё не записаны. Существующие начисления не трогает.</div>
                  </div>
                </label>
                <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${props.backfillForm.mode === 'verify_fix' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <input type="radio" className="mt-0.5" checked={props.backfillForm.mode === 'verify_fix'} onChange={() => props.setBackfillForm({ ...props.backfillForm, mode: 'verify_fix' })} />
                  <div>
                    <div className="font-medium text-sm">Проверить и исправить всё</div>
                    <div className="text-xs text-muted-foreground">Пересчитает каждый день по правильным ставкам из истории изменений, исправит ошибочные суммы и добавит пропущенные.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={props.handleBackfill} disabled={saving}>Запустить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showRateChange} onOpenChange={props.setShowRateChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Изменение ставки</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Текущая ставка: {detail ? detail.rate + "%" : "—"}</div>
            <div><Label>Новая ставка (%)</Label><Input value={props.rateChangeForm.new_rate} onChange={e => props.setRateChangeForm({ ...props.rateChangeForm, new_rate: e.target.value })} /></div>
            <div><Label>Дата вступления в силу</Label><Input type="date" value={props.rateChangeForm.effective_date} onChange={e => props.setRateChangeForm({ ...props.rateChangeForm, effective_date: e.target.value })} /></div>
            <div><Label>Примечание</Label><Textarea value={props.rateChangeForm.reason} onChange={e => props.setRateChangeForm({ ...props.rateChangeForm, reason: e.target.value })} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={props.handleRateChange} disabled={saving}>Изменить</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={props.showEditTx} onOpenChange={props.setShowEditTx}>
        <DialogContent>
          <DialogHeader><DialogTitle>Редактирование транзакции</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div><Label>Сумма</Label><Input value={props.editTxForm.amount} onChange={e => props.setEditTxForm({ ...props.editTxForm, amount: e.target.value })} /></div>
            <div><Label>Дата</Label><Input type="date" value={props.editTxForm.transaction_date} onChange={e => props.setEditTxForm({ ...props.editTxForm, transaction_date: e.target.value })} /></div>
            <div><Label>Примечание</Label><Input value={props.editTxForm.description} onChange={e => props.setEditTxForm({ ...props.editTxForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter><Button onClick={props.handleEditTx} disabled={saving}>Сохранить</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SavingsActionDialogs;