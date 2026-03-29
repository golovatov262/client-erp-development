import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Icon from "@/components/ui/icon";
import { PushSettings } from "@/lib/api";

interface PushTemplatesTabProps {
  settings: PushSettings;
  setSettings: (settings: PushSettings) => void;
  savingSettings: boolean;
  handleSaveSettings: () => void;
}

const PushTemplatesTab = ({ settings, setSettings, savingSettings, handleSaveSettings }: PushTemplatesTabProps) => {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          Используйте переменные: <code className="bg-muted px-1 rounded text-xs">{"{contract_no}"}</code> — номер договора, <code className="bg-muted px-1 rounded text-xs">{"{amount}"}</code> — сумма, <code className="bg-muted px-1 rounded text-xs">{"{days}"}</code> — количество дней (только для шаблона «за N дней»)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="CalendarClock" size={18} />
            Напоминание о платеже — в день платежа
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Заголовок</Label>
            <Input value={settings.tpl_payment_today_title || "Платёж сегодня"} onChange={e => setSettings({ ...settings, tpl_payment_today_title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Текст</Label>
            <Textarea rows={2} value={settings.tpl_payment_today_body || "Сегодня дата платежа по займу {contract_no}. Сумма: {amount} руб."} onChange={e => setSettings({ ...settings, tpl_payment_today_body: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="CalendarClock" size={18} />
            Напоминание о платеже — за 1 день
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Заголовок</Label>
            <Input value={settings.tpl_payment_tomorrow_title || "Платёж завтра"} onChange={e => setSettings({ ...settings, tpl_payment_tomorrow_title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Текст</Label>
            <Textarea rows={2} value={settings.tpl_payment_tomorrow_body || "До даты платежа по займу {contract_no} остался 1 день. Сумма: {amount} руб."} onChange={e => setSettings({ ...settings, tpl_payment_tomorrow_body: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="CalendarClock" size={18} />
            Напоминание о платеже — за N дней
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Заголовок</Label>
            <Input value={settings.tpl_payment_days_title || "Платёж через {days} дн."} onChange={e => setSettings({ ...settings, tpl_payment_days_title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Текст</Label>
            <Textarea rows={2} value={settings.tpl_payment_days_body || "До даты платежа по займу {contract_no} осталось {days} дн. Сумма: {amount} руб."} onChange={e => setSettings({ ...settings, tpl_payment_days_body: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="AlertTriangle" size={18} className="text-red-500" />
            Уведомление о просрочке
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Заголовок</Label>
            <Input value={settings.tpl_overdue_title || "Просрочка платежа"} onChange={e => setSettings({ ...settings, tpl_overdue_title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Текст</Label>
            <Textarea rows={2} value={settings.tpl_overdue_body || "Платёж по займу {contract_no} просрочен. Сумма: {amount} руб. Во избежание пени оплатите как можно скорее."} onChange={e => setSettings({ ...settings, tpl_overdue_body: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="PiggyBank" size={18} />
            Сбережения — в день окончания
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Заголовок</Label>
            <Input value={settings.tpl_savings_today_title || "Договор сбережений истекает сегодня"} onChange={e => setSettings({ ...settings, tpl_savings_today_title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Текст</Label>
            <Textarea rows={2} value={settings.tpl_savings_today_body || "Сегодня истекает срок договора сбережений {contract_no}. Сумма: {amount} руб."} onChange={e => setSettings({ ...settings, tpl_savings_today_body: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="PiggyBank" size={18} />
            Сбережения — за 1 день
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Заголовок</Label>
            <Input value={settings.tpl_savings_tomorrow_title || "Договор сбережений истекает завтра"} onChange={e => setSettings({ ...settings, tpl_savings_tomorrow_title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Текст</Label>
            <Textarea rows={2} value={settings.tpl_savings_tomorrow_body || "Завтра истекает срок договора сбережений {contract_no}. Сумма: {amount} руб."} onChange={e => setSettings({ ...settings, tpl_savings_tomorrow_body: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="PiggyBank" size={18} />
            Сбережения — за N дней
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Заголовок</Label>
            <Input value={settings.tpl_savings_days_title || "Окончание договора сбережений через {days} дн."} onChange={e => setSettings({ ...settings, tpl_savings_days_title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Текст</Label>
            <Textarea rows={2} value={settings.tpl_savings_days_body || "Через {days} дн. истекает срок договора сбережений {contract_no}. Сумма: {amount} руб."} onChange={e => setSettings({ ...settings, tpl_savings_days_body: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSaveSettings} disabled={savingSettings}>
        {savingSettings ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Save" size={16} className="mr-2" />}
        Сохранить шаблоны
      </Button>
    </div>
  );
};

export default PushTemplatesTab;
