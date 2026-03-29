import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import Icon from "@/components/ui/icon";
import { PushStats, PushSubscriber } from "@/lib/api";

interface PushSendTabProps {
  form: { title: string; body: string; url: string; target: string };
  setForm: (form: { title: string; body: string; url: string; target: string }) => void;
  stats: PushStats | null;
  subscribers: PushSubscriber[];
  selectedUsers: number[];
  toggleUser: (userId: number) => void;
  sending: boolean;
  handleSend: () => void;
}

const PushSendTab = ({ form, setForm, stats, subscribers, selectedUsers, toggleUser, sending, handleSend }: PushSendTabProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="Send" size={18} />
          Новая рассылка
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Заголовок</Label>
          <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Напр: Важное уведомление" maxLength={100} />
        </div>
        <div>
          <Label>Текст сообщения</Label>
          <Textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Текст push-уведомления..." rows={3} maxLength={500} />
        </div>
        <div>
          <Label>Ссылка (необязательно)</Label>
          <Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
          <p className="text-xs text-muted-foreground mt-1">Откроется при нажатии на уведомление</p>
        </div>
        <div>
          <Label>Получатели</Label>
          <Select value={form.target} onValueChange={v => setForm({ ...form, target: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все подписчики ({stats?.unique_users || 0})</SelectItem>
              <SelectItem value="selected">Выбранные</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.target === "selected" && (
          <div className="border rounded-md max-h-48 overflow-y-auto">
            {subscribers.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Нет подписчиков</div>
            ) : subscribers.map(s => (
              <label key={s.user_id} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0">
                <Checkbox checked={selectedUsers.includes(s.user_id)} onCheckedChange={() => toggleUser(s.user_id)} />
                <span className="text-sm">{s.name}</span>
                {s.phone && <span className="text-xs text-muted-foreground">{s.phone}</span>}
                <span className="ml-auto text-xs text-muted-foreground">{s.devices} устр.</span>
              </label>
            ))}
          </div>
        )}

        <Button onClick={handleSend} disabled={sending || !form.title || !form.body} className="w-full sm:w-auto">
          {sending ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="Send" size={16} className="mr-2" />}
          Отправить
        </Button>
      </CardContent>
    </Card>
  );
};

export default PushSendTab;
