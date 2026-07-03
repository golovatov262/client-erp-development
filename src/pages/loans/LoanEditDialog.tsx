import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import Icon from "@/components/ui/icon";
import api, { toNum, LoanDetail, ScheduleItem, Member, Organization, humanizeError } from "@/lib/api";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";

interface LoanEditDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  detail: LoanDetail;
  members: Member[];
  orgs: Organization[];
  onSaved: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  toast: (opts: { title: string; description?: string; variant?: "default" | "destructive" }) => void;
}

const LoanEditDialog = ({ open, onOpenChange, detail, members, orgs, onSaved, saving, setSaving, toast }: LoanEditDialogProps) => {
  const [form, setForm] = useState({
    contract_no: "",
    member_id: "",
    amount: "",
    rate: "",
    term_months: "",
    schedule_type: "annuity",
    start_date: "",
    org_id: "none",
  });
  const [preview, setPreview] = useState<ScheduleItem[] | null>(null);
  const [previewMonthly, setPreviewMonthly] = useState(0);

  useEffect(() => {
    if (open && detail) {
      setForm({
        contract_no: detail.contract_no,
        member_id: String(detail.member_id),
        amount: String(detail.amount),
        rate: String(detail.rate),
        term_months: String(detail.term_months),
        schedule_type: detail.schedule_type,
        start_date: detail.start_date,
        org_id: detail.org_id ? String(detail.org_id) : "none",
      });
      setPreview(null);
      setPreviewMonthly(0);
    }
  }, [open, detail]);

  const handlePreview = async () => {
    if (!form.amount || !form.rate || !form.term_months || !form.start_date) return;
    try {
      const res = await api.loans.calcSchedule(
        toNum(form.amount), toNum(form.rate), toNum(form.term_months),
        form.schedule_type, form.start_date
      );
      setPreview(res.schedule);
      setPreviewMonthly(res.monthly_payment);
    } catch (e) {
      toast({ title: "Ошибка предпросмотра", description: humanizeError(e), variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!form.amount || !form.rate || !form.term_months || !form.start_date) {
      toast({ title: "Заполните все обязательные поля", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await api.loans.updateLoan({
        loan_id: detail.id,
        contract_no: form.contract_no,
        member_id: Number(form.member_id),
        amount: toNum(form.amount),
        rate: toNum(form.rate),
        term_months: toNum(form.term_months),
        schedule_type: form.schedule_type,
        start_date: form.start_date,
        org_id: form.org_id && form.org_id !== "none" ? Number(form.org_id) : null,
      });
      toast({ title: "Договор обновлён, график пересчитан" });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const up = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Редактирование договора займа</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Номер договора</Label>
            <Input value={form.contract_no} onChange={e => up("contract_no", e.target.value)} />
          </div>
          <div>
            <Label>Пайщик</Label>
            <Select value={form.member_id} onValueChange={v => up("member_id", v)}>
              <SelectTrigger><SelectValue placeholder="Выберите пайщика" /></SelectTrigger>
              <SelectContent>{members.map(m => <SelectItem key={m.id} value={String(m.id)}>{m.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Сумма займа</Label>
            <Input type="number" value={form.amount} onChange={e => up("amount", e.target.value)} />
          </div>
          <div>
            <Label>Ставка (%)</Label>
            <Input type="number" step="0.01" value={form.rate} onChange={e => up("rate", e.target.value)} />
          </div>
          <div>
            <Label>Срок (мес.)</Label>
            <Input type="number" value={form.term_months} onChange={e => up("term_months", e.target.value)} />
          </div>
          <div>
            <Label>Тип графика</Label>
            <Select value={form.schedule_type} onValueChange={v => up("schedule_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="annuity">Аннуитетный</SelectItem>
                <SelectItem value="end_of_term">В конце срока</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Дата начала</Label>
            <Input type="date" value={form.start_date} onChange={e => up("start_date", e.target.value)} />
          </div>
          {orgs.length > 0 && (
            <div>
              <Label>Организация</Label>
              <Select value={form.org_id} onValueChange={v => up("org_id", v)}>
                <SelectTrigger><SelectValue placeholder="Без организации" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без организации</SelectItem>
                  {orgs.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.short_name || o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-md p-2">
          <Icon name="AlertTriangle" size={16} />
          <span>График будет полностью пересчитан. Существующие платежи будут переразнесены по новому графику.</span>
        </div>

        <Button variant="outline" size="sm" className="w-full" onClick={handlePreview}
          disabled={!form.amount || !form.rate || !form.term_months || !form.start_date}>
          <Icon name="Eye" size={14} className="mr-1" />Предпросмотр нового графика
        </Button>

        {preview && (
          <Card className="p-3 text-sm space-y-1">
            <div className="font-medium">Новый график:</div>
            <div>Ежемесячный платёж: <span className="font-bold">{fmt(previewMonthly)}</span></div>
            <div>Периодов: {preview.length}</div>
            <div>Итого к выплате: {fmt(preview.reduce((s, i) => s + i.payment_amount, 0))}</div>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить и пересчитать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LoanEditDialog;