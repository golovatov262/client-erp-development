import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import api, { MemberOrg, Organization } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Props {
  memberId: number;
}

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("ru-RU");
};

const MemberOrgsTab = ({ memberId }: Props) => {
  const [items, setItems] = useState<MemberOrg[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState("");
  const [joinedAt, setJoinedAt] = useState("");
  const [excludedAt, setExcludedAt] = useState("");
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([
      api.memberOrgs.list(memberId),
      api.organizations.list(),
    ]).then(([memberOrgs, orgsList]) => {
      setItems(memberOrgs);
      setOrgs(orgsList);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [memberId]);

  const resetForm = () => {
    setShowAdd(false);
    setEditId(null);
    setOrgId("");
    setJoinedAt("");
    setExcludedAt("");
  };

  const openAdd = () => {
    resetForm();
    setJoinedAt(new Date().toISOString().split("T")[0]);
    setShowAdd(true);
  };

  const openEdit = (item: MemberOrg) => {
    setEditId(item.id);
    setOrgId(String(item.org_id));
    setJoinedAt(item.joined_at || "");
    setExcludedAt(item.excluded_at || "");
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!orgId || !joinedAt) {
      toast({ title: "Заполните организацию и дату вступления", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.memberOrgs.update({
          member_id: memberId,
          id: editId,
          org_id: Number(orgId),
          joined_at: joinedAt,
          excluded_at: excludedAt || null,
        });
        toast({ title: "Членство обновлено" });
      } else {
        await api.memberOrgs.create({
          member_id: memberId,
          org_id: Number(orgId),
          joined_at: joinedAt,
          excluded_at: excludedAt || undefined,
        });
        toast({ title: "Пайщик добавлен в организацию" });
      }
      resetForm();
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleExclude = async (item: MemberOrg) => {
    if (!confirm(`Исключить пайщика из «${item.org_short_name || item.org_name}»?`)) return;
    try {
      await api.memberOrgs.remove(memberId, item.id);
      toast({ title: "Пайщик исключён из организации" });
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Icon name="Loader2" size={24} className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Организации, в которых состоит пайщик
        </div>
        {!showAdd && (
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Icon name="Plus" size={14} />
            Добавить
          </Button>
        )}
      </div>

      {showAdd && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="text-sm font-medium">{editId ? "Редактирование" : "Новое членство"}</div>
            <div className="space-y-1.5">
              <Label className="text-xs">Организация *</Label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger><SelectValue placeholder="Выберите организацию" /></SelectTrigger>
                <SelectContent>
                  {orgs.map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.short_name || o.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Дата вступления *</Label>
                <Input type="date" value={joinedAt} onChange={e => setJoinedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Дата исключения</Label>
                <Input type="date" value={excludedAt} onChange={e => setExcludedAt(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={resetForm}>Отмена</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !orgId || !joinedAt} className="gap-1.5">
                {saving ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Save" size={14} />}
                {editId ? "Сохранить" : "Добавить"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && !showAdd ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            <Icon name="Building2" size={32} className="mx-auto mb-2 opacity-30" />
            Пайщик не привязан ни к одной организации
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => {
            const isActive = !item.excluded_at;
            return (
              <Card key={item.id} className={!isActive ? "opacity-60" : ""}>
                <CardContent className="py-3 flex items-center gap-3">
                  <Icon name="Building2" size={18} className={isActive ? "text-primary" : "text-muted-foreground"} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.org_short_name || item.org_name}</div>
                    <div className="text-xs text-muted-foreground">
                      Вступил: {fmtDate(item.joined_at)}
                      {item.excluded_at && <> · Исключён: {fmtDate(item.excluded_at)}</>}
                    </div>
                  </div>
                  <Badge variant={isActive ? "default" : "secondary"} className="text-xs shrink-0">
                    {isActive ? "Действующий" : "Исключён"}
                  </Badge>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                      <Icon name="Pencil" size={14} />
                    </Button>
                    {isActive && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleExclude(item)}>
                        <Icon name="UserMinus" size={14} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MemberOrgsTab;
