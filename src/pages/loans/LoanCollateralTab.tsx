import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import api, { LoanCollateral, humanizeError } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface Props {
  loanId: number;
}

const COLLATERAL_TYPES = [
  "Залог недвижимого имущества",
  "Залог движимого имущества",
  "Поручительство",
  "Иное",
];

const TYPE_ICONS: Record<string, string> = {
  "Залог недвижимого имущества": "Home",
  "Залог движимого имущества": "Car",
  "Поручительство": "UserCheck",
  "Иное": "FileText",
};

const fmt = (n?: number) => n === undefined || n === null ? "—" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " ₽";

const LoanCollateralTab = ({ loanId }: Props) => {
  const [items, setItems] = useState<LoanCollateral[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [collateralType, setCollateralType] = useState("Залог недвижимого имущества");
  const [pledgerName, setPledgerName] = useState("");
  const [description, setDescription] = useState("");
  const [collateralValue, setCollateralValue] = useState("");
  const [identifier, setIdentifier] = useState("");

  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    api.loanCollateral.list(loanId).then(setItems).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [loanId]);

  const resetForm = () => {
    setShowAdd(false);
    setEditId(null);
    setCollateralType("Залог недвижимого имущества");
    setPledgerName("");
    setDescription("");
    setCollateralValue("");
    setIdentifier("");
  };

  const openAdd = () => {
    resetForm();
    setShowAdd(true);
  };

  const openEdit = (item: LoanCollateral) => {
    setEditId(item.id);
    setCollateralType(item.collateral_type);
    setPledgerName(item.pledger_name || "");
    setDescription(item.description || "");
    setCollateralValue(item.collateral_value !== undefined && item.collateral_value !== null ? String(item.collateral_value) : "");
    setIdentifier(item.identifier || "");
    setShowAdd(true);
  };

  const handleSave = async () => {
    if (!collateralType) {
      toast({ title: "Выберите вид обеспечения", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        collateral_type: collateralType,
        pledger_name: pledgerName || undefined,
        description: description || undefined,
        collateral_value: collateralValue ? Number(collateralValue.replace(",", ".")) : undefined,
        identifier: identifier || undefined,
      };
      if (editId) {
        await api.loanCollateral.update({ loan_id: loanId, id: editId, ...payload });
        toast({ title: "Обеспечение обновлено" });
      } else {
        await api.loanCollateral.create({ loan_id: loanId, ...payload });
        toast({ title: "Обеспечение добавлено" });
      }
      resetForm();
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: LoanCollateral) => {
    if (!confirm("Удалить запись об обеспечении?")) return;
    try {
      await api.loanCollateral.remove(loanId, item.id);
      toast({ title: "Обеспечение удалено" });
      load();
    } catch (e) {
      toast({ title: "Ошибка", description: humanizeError(e), variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Icon name="Loader2" size={24} className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Залоги и поручители по договору займа
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
            <div className="text-sm font-medium">{editId ? "Редактирование" : "Новое обеспечение"}</div>
            <div className="space-y-1.5">
              <Label className="text-xs">Вид обеспечения *</Label>
              <Select value={collateralType} onValueChange={setCollateralType}>
                <SelectTrigger><SelectValue placeholder="Выберите вид обеспечения" /></SelectTrigger>
                <SelectContent>
                  {COLLATERAL_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Залогодатель / Поручитель</Label>
              <Input value={pledgerName} onChange={e => setPledgerName(e.target.value)} placeholder="ФИО или наименование" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Характеристики залога</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание объекта: адрес, площадь, марка авто и т.д." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Сумма залога</Label>
                <Input type="number" value={collateralValue} onChange={e => setCollateralValue(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Идентификатор (КН/VIN)</Label>
                <Input value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="Кадастровый номер или VIN" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={resetForm}>Отмена</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !collateralType} className="gap-1.5">
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
            <Icon name="ShieldCheck" size={32} className="mx-auto mb-2 opacity-30" />
            По этому договору обеспечение не заполнено
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <Card key={item.id}>
              <CardContent className="py-3 flex items-start gap-3">
                <Icon name={TYPE_ICONS[item.collateral_type] || "FileText"} size={18} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">{item.collateral_type}</Badge>
                    {item.collateral_value !== undefined && item.collateral_value !== null && (
                      <span className="text-xs text-muted-foreground">{fmt(item.collateral_value)}</span>
                    )}
                  </div>
                  {item.pledger_name && <div className="font-medium text-sm">{item.pledger_name}</div>}
                  {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                  {item.identifier && <div className="text-xs text-muted-foreground">Идентификатор: {item.identifier}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                    <Icon name="Pencil" size={14} />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item)}>
                    <Icon name="Trash2" size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default LoanCollateralTab;
