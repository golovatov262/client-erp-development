import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Organization } from "@/lib/api";

interface SavingsToolbarProps {
  search: string;
  setSearch: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  filterOrg: string;
  setFilterOrg: (v: string) => void;
  orgs: Organization[];
  exporting: boolean;
  handleExportSavings: () => void;
  isAdmin: boolean;
  saving: boolean;
  handleRecalcAll: () => void;
}

const SavingsToolbar = ({
  search, setSearch, filterStatus, setFilterStatus,
  filterOrg, setFilterOrg, orgs, exporting, handleExportSavings,
  isAdmin, saving, handleRecalcAll,
}: SavingsToolbarProps) => (
  <div className="flex flex-wrap gap-2">
    <Input placeholder="Поиск по договору, пайщику..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
    <Select value={filterStatus} onValueChange={setFilterStatus}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Статус" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Все статусы</SelectItem>
        <SelectItem value="active">Активен</SelectItem>
        <SelectItem value="early_closed">Досрочно закрыт</SelectItem>
        <SelectItem value="closed">Закрыт</SelectItem>
      </SelectContent>
    </Select>
    {orgs.length > 0 && (
      <Select value={filterOrg} onValueChange={setFilterOrg}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Организация" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все организации</SelectItem>
          {orgs.map(o => <SelectItem key={o.id} value={String(o.id)}>{o.short_name || o.name}</SelectItem>)}
        </SelectContent>
      </Select>
    )}
    {(filterStatus !== "all" || filterOrg !== "all") && (
      <button onClick={() => { setFilterStatus("all"); setFilterOrg("all"); }} className="px-3 py-1 text-sm border rounded hover:bg-muted text-muted-foreground">
        Сбросить
      </button>
    )}
    <Button variant="outline" size="sm" onClick={handleExportSavings} disabled={exporting} className="gap-1.5">
      <Icon name={exporting ? "Loader2" : "FileSpreadsheet"} size={14} className={exporting ? "animate-spin" : "text-green-600"} />
      {exporting ? "Выгрузка..." : "Excel"}
    </Button>
    {isAdmin && (
      <button onClick={handleRecalcAll} disabled={saving} className="px-3 py-1 text-sm border rounded hover:bg-muted" title="Пересчитать все графики">
        <Icon name="RefreshCw" size={16} />
      </button>
    )}
  </div>
);

export default SavingsToolbar;
