import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

interface ApiKey {
  id: number;
  key_prefix: string;
  name: string;
  is_active: boolean;
  created_at: string;
  last_used_at?: string;
  last_used_ip?: string;
  usage_count: number;
}

const AdminApiKeys = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api.apiKeys.list().then(setKeys).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const res = await api.apiKeys.create(name.trim());
      setCreatedKey(res.key);
      setName("");
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await api.apiKeys.toggle(id);
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleDelete = async (id: number, keyName: string) => {
    if (!confirm(`Удалить API-ключ "${keyName}"? Это действие нельзя отменить.`)) return;
    try {
      await api.apiKeys.delete(id);
      toast({ title: "Ключ удалён" });
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast({ title: "Скопировано в буфер" });
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  const fmtDate = (s?: string) => {
    if (!s) return "—";
    const d = new Date(s);
    return d.toLocaleString("ru-RU");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">API-ключи для внешних систем</h3>
          <p className="text-sm text-muted-foreground">Доступ на чтение пайщиков, займов и сбережений</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setCreatedKey(null); setName(""); }} className="gap-2">
          <Icon name="Plus" size={16} />
          Создать ключ
        </Button>
      </div>

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4 text-sm space-y-2">
          <div className="font-semibold flex items-center gap-2"><Icon name="Info" size={16} />Как использовать</div>
          <div>Передавайте ключ в заголовке <code className="bg-white px-1.5 py-0.5 rounded">X-Api-Key</code></div>
          <div className="font-mono text-xs bg-white p-2 rounded border mt-2 overflow-auto">
            GET /?entity=external&resource=members&page=1&limit=100<br/>
            GET /?entity=external&resource=members&id=123<br/>
            GET /?entity=external&resource=loans&member_id=123&status=active<br/>
            GET /?entity=external&resource=loans&id=456<br/>
            GET /?entity=external&resource=savings&member_id=123<br/>
            GET /?entity=external&resource=savings&id=789
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Параметры: <b>resource</b> (members/loans/savings), <b>id</b> (получить одну запись с деталями), <b>member_id</b>, <b>status</b>, <b>page</b>, <b>limit</b> (до 500)
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Icon name="Loader2" size={24} className="animate-spin" /></div>
      ) : keys.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">Нет созданных ключей</Card>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <Card key={k.id}>
              <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{k.name}</span>
                    <Badge variant={k.is_active ? "default" : "secondary"}>
                      {k.is_active ? "Активен" : "Отключён"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{k.key_prefix}••••••••</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Создан: {fmtDate(k.created_at)} · Запросов: {k.usage_count} · Последнее: {fmtDate(k.last_used_at)}{k.last_used_ip ? ` (${k.last_used_ip})` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleToggle(k.id)}>
                    <Icon name={k.is_active ? "Pause" : "Play"} size={14} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(k.id, k.name)}>
                    <Icon name="Trash2" size={14} className="text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) { setCreatedKey(null); setName(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{createdKey ? "Ключ создан" : "Новый API-ключ"}</DialogTitle>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-3">
              <div className="p-3 bg-yellow-50 border border-yellow-300 rounded text-sm">
                <div className="font-semibold text-yellow-900 mb-1 flex items-center gap-1">
                  <Icon name="AlertTriangle" size={14} />
                  Сохраните ключ сейчас
                </div>
                <div className="text-yellow-800 text-xs">Он больше не будет показан полностью</div>
              </div>
              <div className="font-mono text-xs bg-muted p-3 rounded break-all select-all">{createdKey}</div>
              <Button onClick={() => copyKey(createdKey)} className="w-full gap-2">
                <Icon name="Copy" size={14} />
                Скопировать
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Название</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Например: 1С Бухгалтерия"
                  onKeyDown={e => e.key === "Enter" && handleCreate()}
                />
                <div className="text-xs text-muted-foreground mt-1">Для удобства, чтобы понимать, где используется ключ</div>
              </div>
            </div>
          )}

          <DialogFooter>
            {createdKey ? (
              <Button onClick={() => { setShowCreate(false); setCreatedKey(null); }}>Готово</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowCreate(false)}>Отмена</Button>
                <Button onClick={handleCreate} disabled={!name.trim()}>Создать</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminApiKeys;
