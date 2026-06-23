import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import api from "@/lib/api";

const SavingsAccrualSettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [delDate, setDelDate] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.savings.getAccrualSettings();
      setEnabled(res.auto_accrual_enabled);
    } catch (e) {
      toast({ title: "Ошибка загрузки настроек", description: String(e), variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleToggle = async (v: boolean) => {
    setToggling(true);
    try {
      await api.savings.setAutoAccrual(v);
      setEnabled(v);
      toast({ title: v ? "Автоначисление включено" : "Автоначисление выключено" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
    setToggling(false);
  };

  const handleDelete = async () => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      const res = await api.savings.deleteAccrualsByDate(delDate);
      toast({ title: `Удалено начислений: ${res.deleted}`, description: `На сумму ${res.total.toLocaleString("ru-RU")} ₽ за ${delDate}` });
      setDelDate("");
    } catch (e) {
      toast({ title: "Ошибка удаления", description: String(e), variant: "destructive" });
    }
    setDeleting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="Percent" size={18} />
          Начисление процентов по сбережениям
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Автоматическое начисление процентов</div>
            <div className="text-xs text-muted-foreground">Ежедневное начисление процентов по активным вкладам</div>
          </div>
          <Switch checked={enabled} disabled={loading || toggling} onCheckedChange={handleToggle} />
        </div>

        <div className="border-t pt-6 space-y-2">
          <Label>Удалить начисления за дату</Label>
          <div className="flex flex-wrap items-end gap-2">
            <Input type="date" value={delDate} onChange={e => setDelDate(e.target.value)} className="w-44" />
            <Button
              variant="destructive"
              size="sm"
              disabled={!delDate || deleting}
              onClick={() => setConfirmOpen(true)}
            >
              {deleting ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Trash2" size={16} className="mr-2" />}
              Удалить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Удалит начисленные проценты по всем договорам за выбранный день и откатит накопленные проценты.</p>
        </div>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить начисления за {delDate}?</AlertDialogTitle>
            <AlertDialogDescription>
              Будут удалены проценты, начисленные по всем договорам сбережений за этот день. Действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default SavingsAccrualSettings;
