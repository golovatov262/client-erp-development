import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import Icon from "@/components/ui/icon";
import { PushSettings } from "@/lib/api";

interface PushSettingsTabProps {
  settings: PushSettings;
  setSettings: (settings: PushSettings) => void;
  savingSettings: boolean;
  handleSaveSettings: () => void;
}

const PushSettingsTab = ({ settings, setSettings, savingSettings, handleSaveSettings }: PushSettingsTabProps) => {
  const reminderDays = settings.reminder_days.split(",").map(d => d.trim()).filter(Boolean);
  const toggleDay = (day: string) => {
    const current = new Set(reminderDays);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    const sorted = Array.from(current).map(Number).sort((a, b) => b - a).map(String);
    setSettings({ ...settings, reminder_days: sorted.join(",") });
  };

  const savingsReminderDays = (settings.savings_reminder_days || "30,15,7").split(",").map(d => d.trim()).filter(Boolean);
  const toggleSavingsDay = (day: string) => {
    const current = new Set(savingsReminderDays);
    if (current.has(day)) current.delete(day);
    else current.add(day);
    const sorted = Array.from(current).map(Number).sort((a, b) => b - a).map(String);
    setSettings({ ...settings, savings_reminder_days: sorted.join(",") });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="Settings" size={18} />
          Автоматические напоминания о платежах
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-sm">Автоматические push-напоминания</div>
            <div className="text-xs text-muted-foreground">Клиенты получают уведомления о предстоящих и просроченных платежах</div>
          </div>
          <Switch checked={settings.enabled === "true"} onCheckedChange={v => setSettings({ ...settings, enabled: v ? "true" : "false" })} />
        </div>

        {settings.enabled === "true" && (
          <>
            <div className="space-y-2">
              <Label>За сколько дней напоминать</Label>
              <div className="flex flex-wrap gap-2">
                {["7", "5", "3", "2", "1", "0"].map(day => (
                  <Button key={day} variant={reminderDays.includes(day) ? "default" : "outline"} size="sm" onClick={() => toggleDay(day)} className="min-w-[80px]">
                    {day === "0" ? "В день платежа" : `За ${day} дн.`}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Выбрано: {reminderDays.length === 0 ? "ничего" : reminderDays.map(d => d === "0" ? "в день платежа" : `за ${d} дн.`).join(", ")}</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Уведомлять о просрочке</div>
                <div className="text-xs text-muted-foreground">Отправлять push при появлении просроченного платежа</div>
              </div>
              <Switch checked={settings.overdue_notify === "true"} onCheckedChange={v => setSettings({ ...settings, overdue_notify: v ? "true" : "false" })} />
            </div>

            <div className="space-y-2">
              <Label>Время отправки</Label>
              <Input type="time" value={settings.remind_time} onChange={e => setSettings({ ...settings, remind_time: e.target.value })} className="w-32" />
              <p className="text-xs text-muted-foreground">Время по Москве, в которое будут отправляться напоминания</p>
            </div>
          </>
        )}

        <div className="border-t pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">Напоминания по сбережениям</div>
              <div className="text-xs text-muted-foreground">Уведомления об окончании срока договоров сбережений</div>
            </div>
            <Switch checked={settings.savings_enabled === "true"} onCheckedChange={v => setSettings({ ...settings, savings_enabled: v ? "true" : "false" })} />
          </div>
        </div>

        {settings.savings_enabled === "true" && (
          <>
            <div className="space-y-2">
              <Label>За сколько дней напоминать</Label>
              <div className="flex flex-wrap gap-2">
                {["30", "25", "15", "7", "3", "1", "0"].map(day => (
                  <Button key={day} variant={savingsReminderDays.includes(day) ? "default" : "outline"} size="sm" onClick={() => toggleSavingsDay(day)} className="min-w-[80px]">
                    {day === "0" ? "В день окончания" : `За ${day} дн.`}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Выбрано: {savingsReminderDays.length === 0 ? "ничего" : savingsReminderDays.map(d => d === "0" ? "в день окончания" : `за ${d} дн.`).join(", ")}</p>
            </div>

            <div className="space-y-2">
              <Label>Время отправки</Label>
              <Input type="time" value={settings.savings_remind_time || "09:00"} onChange={e => setSettings({ ...settings, savings_remind_time: e.target.value })} className="w-32" />
              <p className="text-xs text-muted-foreground">Время по Москве, в которое будут отправляться напоминания о сбережениях</p>
            </div>
          </>
        )}

        <Button onClick={handleSaveSettings} disabled={savingSettings}>
          {savingSettings ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Save" size={16} className="mr-2" />}
          Сохранить настройки
        </Button>
      </CardContent>
    </Card>
  );
};

export default PushSettingsTab;
