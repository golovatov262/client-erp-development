import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import api, { LoanApplication, toNum } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: LoanApplication | null;
  onApproved: () => void;
};

const LoanApplicationApproveDialog = ({ open, onOpenChange, item, onApproved }: Props) => {
  const [rate, setRate] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleType, setScheduleType] = useState("annuity");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setRate("");
      setStartDate(new Date().toISOString().slice(0, 10));
      setScheduleType("annuity");
    }
  }, [open]);

  if (!item) return null;

  const handleApprove = async () => {
    if (!rate) {
      toast({ title: "Укажите ставку", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await api.loanApplications.approve(item.id, {
        rate: toNum(rate),
        start_date: startDate,
        schedule_type: scheduleType,
      });
      toast({ title: "Заявка одобрена", description: `Создан договор ${res.contract_no}, платёж: ${res.monthly_payment.toFixed(2)} ₽` });
      onApproved();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Одобрить заявку {item.application_no}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-muted/40 rounded text-sm space-y-1">
            <div><strong>Заёмщик:</strong> {item.full_name || item.member_name || "—"}</div>
            <div><strong>Сумма:</strong> {item.amount?.toLocaleString("ru-RU")} ₽</div>
            <div><strong>Срок:</strong> {item.term_months} мес.</div>
            {!item.member_id && <div className="text-amber-700 text-xs mt-2">Пайщик будет создан автоматически на основе данных заявки.</div>}
          </div>

          <div className="space-y-1">
            <Label>Ставка, % годовых</Label>
            <Input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="Напр.: 18" />
          </div>
          <div className="space-y-1">
            <Label>Дата начала</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Тип графика</Label>
            <Select value={scheduleType} onValueChange={setScheduleType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annuity">Аннуитетный</SelectItem>
                <SelectItem value="end_of_term">В конце срока</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleApprove} disabled={saving}>
            {saving ? "Одобряем..." : "Одобрить и создать договор"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoanApplicationApproveDialog;
