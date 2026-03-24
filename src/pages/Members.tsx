import { useState, useEffect } from "react";
import PageHeader from "@/components/ui/page-header";
import DataTable, { Column } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Icon from "@/components/ui/icon";
import CompanyInnSuggest from "@/components/ui/company-inn-suggest";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import api, { Member, MemberDetail } from "@/lib/api";
import MemberChecksTab from "@/pages/members/MemberChecksTab";
import PodftTab from "@/pages/members/PodftTab";

const columns: Column<Member>[] = [
  { key: "member_no", label: "Номер" },
  {
    key: "member_type",
    label: "Тип",
    render: (item: Member) => (
      <Badge variant={item.member_type === "FL" ? "secondary" : "outline"} className="text-xs">
        {item.member_type === "FL" ? "ФЛ" : "ЮЛ"}
      </Badge>
    ),
  },
  { key: "name", label: "Наименование / ФИО", className: "font-medium" },
  { key: "inn", label: "ИНН" },
  { key: "phone", label: "Телефон" },
  {
    key: "status",
    label: "Статус",
    render: (item: Member) => (
      <Badge variant={item.status === "active" ? "default" : "destructive"} className="text-xs">
        {item.status === "active" ? "Активен" : item.status}
      </Badge>
    ),
  },
  { key: "active_loans", label: "Займы", className: "text-center" },
  { key: "active_savings", label: "Вклады", className: "text-center" },
];

const Members = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [memberType, setMemberType] = useState("fl");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const { toast } = useToast();

  const [exporting, setExporting] = useState(false);
  const [pageTab, setPageTab] = useState("list");
  const [mainTab, setMainTab] = useState("data");
  const { isAdmin } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({});
  const setField = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  const loadMembers = () => {
    setLoading(true);
    api.members.list().then(setMembers).finally(() => setLoading(false));
  };

  useEffect(() => { loadMembers(); }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.export.download("members", undefined, "xlsx");
      toast({ title: "Список пайщиков выгружен в Excel" });
    } catch {
      toast({ title: "Ошибка выгрузки", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const filtered = members.filter(
    (m) => m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.inn?.includes(search) ||
      m.member_no?.toLowerCase().includes(search.toLowerCase())
  );

  const openEdit = async (member: Member) => {
    try {
      const detail: MemberDetail = await api.members.get(member.id);
      const formData: Record<string, string> = {};
      const fields = [
        'last_name', 'first_name', 'middle_name', 'birth_date', 'birth_place',
        'inn', 'passport_series', 'passport_number', 'passport_dept_code',
        'passport_issue_date', 'passport_issued_by', 'registration_address',
        'phone', 'email', 'telegram', 'bank_bik', 'bank_account',
        'marital_status', 'spouse_fio', 'spouse_phone', 'extra_phone',
        'extra_contact_fio', 'company_name', 'director_fio', 'director_phone',
        'contact_person_fio', 'contact_person_phone', 'status',
      ];
      for (const f of fields) {
        const val = (detail as Record<string, unknown>)[f];
        if (val != null && val !== '') formData[f] = String(val);
      }
      setForm(formData);
      setMemberType(detail.member_type === "UL" ? "ul" : "fl");
      setEditingId(detail.id);
      setMainTab("data");
      setShowForm(true);
    } catch (e) {
      toast({ title: "Ошибка загрузки", description: String(e), variant: "destructive" });
    }
  };

  const openCreate = () => {
    setForm({});
    setEditingId(null);
    setMemberType("fl");
    setMainTab("data");
    setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.members.update({ id: editingId, ...form } as unknown as Partial<MemberDetail>);
        toast({ title: "Данные пайщика обновлены" });
      } else {
        const data = { ...form, member_type: memberType === "fl" ? "FL" : "UL" };
        await api.members.create(data as unknown as Record<string, string>);
        toast({ title: "Пайщик добавлен" });
      }
      setShowForm(false);
      setForm({});
      setEditingId(null);
      loadMembers();
    } catch (e: unknown) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const memberName = form.last_name ? `${form.last_name} ${form.first_name} ${form.middle_name || ''}`.trim() : form.company_name;
    if (!confirm(`Удалить пайщика "${memberName}"? Это действие необратимо.\n\nПайщик не может быть удалён при наличии активных займов, сбережений или паевых счетов.`)) return;
    setSaving(true);
    try {
      await api.members.delete(editingId);
      toast({ title: "Пайщик удалён" });
      setShowForm(false);
      setForm({});
      setEditingId(null);
      loadMembers();
    } catch (e: unknown) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const renderFlForm = () => (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Фамилия *</Label><Input value={form.last_name || ""} onChange={e => setField("last_name", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Имя *</Label><Input value={form.first_name || ""} onChange={e => setField("first_name", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Отчество</Label><Input value={form.middle_name || ""} onChange={e => setField("middle_name", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Дата рождения</Label><Input type="date" value={form.birth_date || ""} onChange={e => setField("birth_date", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Место рождения</Label><Input value={form.birth_place || ""} onChange={e => setField("birth_place", e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">ИНН *</Label><Input value={form.inn || ""} onChange={e => setField("inn", e.target.value)} maxLength={12} /></div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Паспортные данные</div>
      <div className="grid grid-cols-4 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Серия</Label><Input value={form.passport_series || ""} onChange={e => setField("passport_series", e.target.value)} maxLength={4} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Номер</Label><Input value={form.passport_number || ""} onChange={e => setField("passport_number", e.target.value)} maxLength={6} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Код подразд.</Label><Input value={form.passport_dept_code || ""} onChange={e => setField("passport_dept_code", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Дата выдачи</Label><Input type="date" value={form.passport_issue_date || ""} onChange={e => setField("passport_issue_date", e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Кем выдан</Label><Input value={form.passport_issued_by || ""} onChange={e => setField("passport_issued_by", e.target.value)} /></div>
      <div className="space-y-1.5"><Label className="text-xs">Адрес регистрации</Label><Input value={form.registration_address || ""} onChange={e => setField("registration_address", e.target.value)} /></div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Контактная информация</div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Телефон</Label><Input value={form.phone || ""} onChange={e => setField("phone", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input value={form.email || ""} onChange={e => setField("email", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Telegram</Label><Input value={form.telegram || ""} onChange={e => setField("telegram", e.target.value)} /></div>
      </div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Банковские реквизиты</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">БИК</Label><Input value={form.bank_bik || ""} onChange={e => setField("bank_bik", e.target.value)} maxLength={9} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Расчётный счёт</Label><Input value={form.bank_account || ""} onChange={e => setField("bank_account", e.target.value)} maxLength={20} /></div>
      </div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Дополнительно</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Семейное положение</Label>
          <Select value={form.marital_status || ""} onValueChange={v => setField("marital_status", v)}>
            <SelectTrigger><SelectValue placeholder="Не указано" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Не женат / Не замужем</SelectItem>
              <SelectItem value="married">Женат / Замужем</SelectItem>
              <SelectItem value="divorced">Разведён / Разведена</SelectItem>
              <SelectItem value="widowed">Вдовец / Вдова</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">ФИО супруга(и)</Label><Input value={form.spouse_fio || ""} onChange={e => setField("spouse_fio", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">Телефон супруга(и)</Label><Input value={form.spouse_phone || ""} onChange={e => setField("spouse_phone", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Доп. телефон</Label><Input value={form.extra_phone || ""} onChange={e => setField("extra_phone", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">ФИО доп. контакта</Label><Input value={form.extra_contact_fio || ""} onChange={e => setField("extra_contact_fio", e.target.value)} /></div>
      </div>

      {editingId && (
        <>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Статус</div>
          <Select value={form.status || "active"} onValueChange={v => setField("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Активен</SelectItem>
              <SelectItem value="blocked">Заблокирован</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}

      {renderFormActions(!form.last_name || !form.inn)}
    </div>
  );

  const renderUlForm = () => (
    <div className="space-y-4 mt-4">
      <div className="space-y-1.5">
        <Label className="text-xs">ИНН организации *</Label>
        <CompanyInnSuggest
          value={form.inn || ""}
          onChange={v => setField("inn", v)}
          onCompanySelect={data => {
            setForm(prev => ({
              ...prev,
              inn: data.inn,
              company_name: data.company_name,
              director_fio: data.director_fio || prev.director_fio || "",
              registration_address: data.address || prev.registration_address || "",
              email: data.email || prev.email || "",
            }));
          }}
        />
      </div>
      <div className="space-y-1.5"><Label className="text-xs">Наименование компании *</Label><Input value={form.company_name || ""} onChange={e => setField("company_name", e.target.value)} /></div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Руководитель</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">ФИО руководителя</Label><Input value={form.director_fio || ""} onChange={e => setField("director_fio", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Телефон руководителя</Label><Input value={form.director_phone || ""} onChange={e => setField("director_phone", e.target.value)} /></div>
      </div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Контактное лицо</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">ФИО контактного лица</Label><Input value={form.contact_person_fio || ""} onChange={e => setField("contact_person_fio", e.target.value)} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Телефон контактного лица</Label><Input value={form.contact_person_phone || ""} onChange={e => setField("contact_person_phone", e.target.value)} /></div>
      </div>

      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Банковские реквизиты</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label className="text-xs">БИК</Label><Input value={form.bank_bik || ""} onChange={e => setField("bank_bik", e.target.value)} maxLength={9} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Расчётный счёт</Label><Input value={form.bank_account || ""} onChange={e => setField("bank_account", e.target.value)} maxLength={20} /></div>
      </div>

      {editingId && (
        <>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pt-2">Статус</div>
          <Select value={form.status || "active"} onValueChange={v => setField("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Активен</SelectItem>
              <SelectItem value="blocked">Заблокирован</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}

      {renderFormActions(!form.inn || !form.company_name)}
    </div>
  );

  const renderFormActions = (disableSave: boolean) => (
    <div className="flex justify-between gap-2 pt-4">
      {editingId && (
        <Button variant="destructive" onClick={handleDelete} disabled={saving}>
          <Icon name="Trash2" size={16} className="mr-2" />
          Удалить пайщика
        </Button>
      )}
      <div className="flex gap-2 ml-auto">
        <Button variant="outline" onClick={() => setShowForm(false)}>Отмена</Button>
        <Button onClick={handleSave} disabled={saving || disableSave} className="gap-2">
          {saving ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Save" size={16} />}
          {editingId ? "Сохранить изменения" : "Сохранить"}
        </Button>
      </div>
    </div>
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Icon name="Loader2" size={32} className="animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Пайщики"
        description={`Всего ${members.length} пайщиков в системе`}
        actionLabel={pageTab === "list" ? "Добавить пайщика" : undefined}
        actionIcon={pageTab === "list" ? "UserPlus" : undefined}
        onAction={pageTab === "list" ? openCreate : undefined}
      />

      <Tabs value={pageTab} onValueChange={setPageTab}>
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5"><Icon name="Users" size={14} />Список пайщиков</TabsTrigger>
          <TabsTrigger value="podft" className="gap-1.5"><Icon name="ShieldAlert" size={14} />ПОД/ФТ</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Поиск по ФИО, ИНН, номеру..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="gap-1.5 shrink-0">
              <Icon name={exporting ? "Loader2" : "FileSpreadsheet"} size={14} className={exporting ? "animate-spin" : "text-green-600"} />
              {exporting ? "Выгрузка..." : "Экспорт в Excel"}
            </Button>
          </div>

          <DataTable columns={columns} data={filtered} onRowClick={openEdit} emptyMessage="Пайщики не найдены. Добавьте первого пайщика." />
        </TabsContent>

        <TabsContent value="podft" className="mt-4">
          <PodftTab />
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) { setEditingId(null); setForm({}); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingId ? "Редактирование пайщика" : "Новый пайщик"}</DialogTitle></DialogHeader>

          {editingId ? (
            <Tabs value={mainTab} onValueChange={setMainTab}>
              <TabsList className="w-full">
                <TabsTrigger value="data" className="flex-1 gap-1.5"><Icon name="User" size={14} />Данные</TabsTrigger>
                <TabsTrigger value="checks" className="flex-1 gap-1.5"><Icon name="ShieldCheck" size={14} />Проверки</TabsTrigger>
              </TabsList>
              <TabsContent value="data">
                {memberType === "fl" ? renderFlForm() : renderUlForm()}
              </TabsContent>
              <TabsContent value="checks">
                <MemberChecksTab memberId={editingId} isAdmin={isAdmin} />
              </TabsContent>
            </Tabs>
          ) : (
            <Tabs value={memberType} onValueChange={setMemberType}>
              <TabsList className="w-full">
                <TabsTrigger value="fl" className="flex-1">Физическое лицо</TabsTrigger>
                <TabsTrigger value="ul" className="flex-1">Юридическое лицо</TabsTrigger>
              </TabsList>
              <TabsContent value="fl">{renderFlForm()}</TabsContent>
              <TabsContent value="ul">{renderUlForm()}</TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Members;