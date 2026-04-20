import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const BASE_URL = "https://functions.poehali.dev/f35e253c-613f-4ad6-8deb-2c20b4c5d450";

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
);

const Block = ({ children }: { children: React.ReactNode }) => (
  <pre className="bg-muted rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-5">{children}</pre>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h4 className="font-semibold text-sm border-b pb-1">{title}</h4>
    {children}
  </div>
);

const Param = ({ name, type, desc, required }: { name: string; type: string; desc: string; required?: boolean }) => (
  <div className="flex gap-2 text-sm py-1 border-b last:border-0">
    <span className="font-mono text-xs w-40 shrink-0 text-blue-700 dark:text-blue-400">{name}{required ? " *" : ""}</span>
    <span className="text-muted-foreground w-20 shrink-0 text-xs">{type}</span>
    <span className="text-xs text-foreground/80">{desc}</span>
  </div>
);

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
    return new Date(s).toLocaleString("ru-RU");
  };

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">API</h3>
          <p className="text-sm text-muted-foreground">Интеграция с внешними системами</p>
        </div>
        <Button onClick={() => { setShowCreate(true); setCreatedKey(null); setName(""); }} className="gap-2">
          <Icon name="Plus" size={16} />
          Создать ключ
        </Button>
      </div>

      {/* Базовый URL */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold shrink-0">Базовый URL:</span>
          <code className="font-mono text-sm bg-white border rounded px-3 py-1 flex-1 break-all">{BASE_URL}</code>
          <Button size="sm" variant="outline" onClick={() => copyKey(BASE_URL)}>
            <Icon name="Copy" size={14} />
          </Button>
        </CardContent>
      </Card>

      {/* Управление ключами */}
      <Section title="API-ключи">
        {loading ? (
          <div className="flex justify-center py-8"><Icon name="Loader2" size={24} className="animate-spin" /></div>
        ) : keys.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">Нет созданных ключей</Card>
        ) : (
          <div className="space-y-2">
            {keys.map(k => (
              <Card key={k.id}>
                <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{k.name}</span>
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
                    <Button variant="outline" size="sm" title={k.is_active ? "Отключить" : "Включить"} onClick={() => handleToggle(k.id)}>
                      <Icon name={k.is_active ? "Pause" : "Play"} size={14} />
                    </Button>
                    <Button variant="outline" size="sm" title="Удалить" onClick={() => handleDelete(k.id, k.name)}>
                      <Icon name="Trash2" size={14} className="text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* Документация */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="BookOpen" size={18} />
            Документация
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs defaultValue="quickstart">
            <TabsList className="flex-wrap h-auto gap-1 mb-4">
              <TabsTrigger value="quickstart" className="text-xs">Быстрый старт</TabsTrigger>
              <TabsTrigger value="external" className="text-xs">Внешний API</TabsTrigger>
              <TabsTrigger value="members" className="text-xs">Пайщики</TabsTrigger>
              <TabsTrigger value="loans" className="text-xs">Займы</TabsTrigger>
              <TabsTrigger value="savings" className="text-xs">Сбережения</TabsTrigger>
              <TabsTrigger value="shares" className="text-xs">Паи</TabsTrigger>
              <TabsTrigger value="applications" className="text-xs">Заявки</TabsTrigger>
              <TabsTrigger value="errors" className="text-xs">Ошибки</TabsTrigger>
            </TabsList>

            {/* БЫСТРЫЙ СТАРТ */}
            <TabsContent value="quickstart" className="space-y-4">
              <Section title="Аутентификация">
                <p className="text-sm">Есть два способа аутентификации — зависит от типа интеграции:</p>
                <div className="space-y-3 mt-2">
                  <div>
                    <div className="text-sm font-medium mb-1">1. API-ключ (для внешних систем — 1С, CRM и т.д.)</div>
                    <Block>{`GET ${BASE_URL}?entity=external&resource=members
X-Api-Key: ваш_ключ`}</Block>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">2. Токен сотрудника (для управляющих операций)</div>
                    <p className="text-xs text-muted-foreground mb-1">Сначала получите токен:</p>
                    <Block>{`POST ${BASE_URL}
Content-Type: application/json

{"entity":"staff_auth","action":"login","login":"admin","password":"пароль"}`}</Block>
                    <p className="text-xs text-muted-foreground mt-1 mb-1">Ответ: <Code>{"{ \"token\": \"abc123...\", \"user\": { \"name\": \"...\", \"role\": \"admin\" } }"}</Code></p>
                    <p className="text-xs text-muted-foreground mb-1">Используйте токен в заголовке:</p>
                    <Block>{`GET ${BASE_URL}?entity=members
X-Auth-Token: abc123...`}</Block>
                  </div>
                </div>
              </Section>

              <Section title="Формат ответа">
                <p className="text-sm">Все ответы — JSON. HTTP-коды:</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    ["200", "Успех"],
                    ["201", "Создано (cron-задачи)"],
                    ["400", "Ошибка в запросе"],
                    ["401", "Не авторизован"],
                    ["403", "Нет прав"],
                    ["404", "Не найдено"],
                    ["500", "Ошибка сервера"],
                  ].map(([code, desc]) => (
                    <div key={code} className="flex gap-2 text-xs">
                      <Code>{code}</Code>
                      <span className="text-muted-foreground">{desc}</span>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Пример: список пайщиков">
                <Block>{`curl "${BASE_URL}?entity=external&resource=members&page=1&limit=50" \\
  -H "X-Api-Key: ваш_ключ"`}</Block>
              </Section>
            </TabsContent>

            {/* ВНЕШНИЙ API */}
            <TabsContent value="external" className="space-y-4">
              <p className="text-sm text-muted-foreground">Доступ только по <Code>X-Api-Key</Code>. Только чтение данных.</p>

              <Section title="Параметры запроса">
                <Param name="resource" type="string" desc="members | loans | savings | shares | schedule | balance | stats" required />
                <Param name="id" type="integer" desc="ID конкретной записи" />
                <Param name="member_id" type="integer" desc="Фильтр по пайщику" />
                <Param name="loan_id" type="integer" desc="ID займа (для schedule)" />
                <Param name="saving_id" type="integer" desc="ID вклада (для schedule)" />
                <Param name="status" type="string" desc="active | closed | overdue — фильтр по статусу" />
                <Param name="page" type="integer" desc="Страница (по умолчанию 1)" />
                <Param name="limit" type="integer" desc="Записей на страницу (макс. 500, по умолч. 100)" />
              </Section>

              <Section title="Примеры запросов">
                <Block>{`# Список пайщиков (страница 1, по 100)
GET ?entity=external&resource=members&page=1&limit=100

# Один пайщик
GET ?entity=external&resource=members&id=123

# Займы конкретного пайщика
GET ?entity=external&resource=loans&member_id=123&status=active

# Детали займа
GET ?entity=external&resource=loans&id=456

# Вклады пайщика
GET ?entity=external&resource=savings&member_id=123

# График платежей по займу
GET ?entity=external&resource=schedule&loan_id=456

# График выплат по вкладу
GET ?entity=external&resource=schedule&saving_id=789

# Все продукты пайщика в одном запросе
GET ?entity=external&resource=balance&member_id=123

# Сводная статистика системы
GET ?entity=external&resource=stats

# Статистика пайщика
GET ?entity=external&resource=stats&member_id=123`}</Block>
              </Section>

              <Section title="Ответ: balance">
                <Block>{`{
  "member": { "id": 123, "member_no": "П-000123", "name": "Иванов Иван" },
  "loans": [ { "contract_no": "1-01012025", "amount": 100000, "balance": 80000, "status": "active" } ],
  "savings": [ { "contract_no": "5-01012025", "amount": 50000, "status": "active" } ],
  "shares": { "balance": 5000 },
  "overdue_loans": 0
}`}</Block>
              </Section>
            </TabsContent>

            {/* ПАЙЩИКИ */}
            <TabsContent value="members" className="space-y-4">
              <p className="text-sm text-muted-foreground">Требует <Code>X-Auth-Token</Code> сотрудника.</p>

              <Section title="Получить список">
                <Block>{`GET ${BASE_URL}?entity=members
X-Auth-Token: токен`}</Block>
                <p className="text-xs text-muted-foreground mt-1">Возвращает: массив <Code>Member[]</Code> — id, member_no, member_type, name, inn, phone, email, status, active_loans, active_savings</p>
              </Section>

              <Section title="Получить детали пайщика">
                <Block>{`GET ${BASE_URL}?entity=members&action=detail&id=123
X-Auth-Token: токен`}</Block>
              </Section>

              <Section title="Создать пайщика">
                <Block>{`POST ${BASE_URL}
X-Auth-Token: токен
Content-Type: application/json

{
  "entity": "members",
  "member_type": "FL",
  "last_name": "Иванов",
  "first_name": "Иван",
  "middle_name": "Иванович",
  "inn": "123456789012",
  "phone": "+79001234567",
  "email": "ivan@example.com",
  "passport_series": "4510",
  "passport_number": "123456",
  "passport_issued_by": "ОУФМС",
  "passport_issue_date": "2015-01-15",
  "registration_address": "г. Москва, ул. Ленина, 1"
}`}</Block>
                <p className="text-xs text-muted-foreground mt-1">Для юр. лица: <Code>member_type: "UL"</Code>, поля: company_name, director_fio, director_phone, contact_person_fio</p>
                <p className="text-xs text-muted-foreground">Ответ: <Code>{"{ \"id\": 123, \"member_no\": \"П-000123\" }"}</Code></p>
              </Section>

              <Section title="Обновить пайщика">
                <Block>{`PUT ${BASE_URL}
X-Auth-Token: токен
Content-Type: application/json

{
  "entity": "members",
  "id": 123,
  "phone": "+79009999999",
  "email": "new@email.com"
}`}</Block>
              </Section>

              <Section title="Поля пайщика (ФЛ)">
                <Param name="last_name" type="string" desc="Фамилия" required />
                <Param name="first_name" type="string" desc="Имя" required />
                <Param name="middle_name" type="string" desc="Отчество" />
                <Param name="inn" type="string" desc="ИНН (12 цифр)" required />
                <Param name="birth_date" type="date" desc="Дата рождения (YYYY-MM-DD)" />
                <Param name="birth_place" type="string" desc="Место рождения" />
                <Param name="passport_series" type="string" desc="Серия паспорта (4 цифры)" />
                <Param name="passport_number" type="string" desc="Номер паспорта (6 цифр)" />
                <Param name="passport_dept_code" type="string" desc="Код подразделения (000-000)" />
                <Param name="passport_issue_date" type="date" desc="Дата выдачи паспорта" />
                <Param name="passport_issued_by" type="string" desc="Кем выдан" />
                <Param name="registration_address" type="string" desc="Адрес регистрации" />
                <Param name="phone" type="string" desc="Телефон" />
                <Param name="email" type="string" desc="Email" />
                <Param name="telegram" type="string" desc="Telegram (@username)" />
                <Param name="bank_bik" type="string" desc="БИК банка" />
                <Param name="bank_account" type="string" desc="Расчётный счёт (20 цифр)" />
                <Param name="marital_status" type="string" desc="single | married | divorced | widowed" />
              </Section>
            </TabsContent>

            {/* ЗАЙМЫ */}
            <TabsContent value="loans" className="space-y-4">
              <p className="text-sm text-muted-foreground">Требует <Code>X-Auth-Token</Code> сотрудника.</p>

              <Section title="Список займов">
                <Block>{`GET ${BASE_URL}?entity=loans
X-Auth-Token: токен`}</Block>
              </Section>

              <Section title="Детали займа + график">
                <Block>{`GET ${BASE_URL}?entity=loans&action=detail&id=456
X-Auth-Token: токен`}</Block>
              </Section>

              <Section title="Создать договор займа">
                <Block>{`POST ${BASE_URL}
X-Auth-Token: токен
Content-Type: application/json

{
  "entity": "loans",
  "action": "create",
  "member_id": 123,
  "amount": 100000,
  "rate": 18,
  "term_months": 12,
  "schedule_type": "annuity",
  "start_date": "2025-01-01",
  "org_id": 1
}`}</Block>
                <Param name="schedule_type" type="string" desc="annuity (аннуитет) | differential (дифф.) | end_of_term (в конце срока)" required />
                <p className="text-xs text-muted-foreground mt-1">Ответ: <Code>{"{ \"id\": 1, \"contract_no\": \"1-01012025\", \"monthly_payment\": 9167 }"}</Code></p>
              </Section>

              <Section title="Внести платёж">
                <Block>{`POST ${BASE_URL}
X-Auth-Token: токен
Content-Type: application/json

{
  "entity": "loans",
  "action": "payment",
  "loan_id": 456,
  "amount": 9167,
  "payment_date": "2025-02-01",
  "principal_part": 7667,
  "interest_part": 1500
}`}</Block>
              </Section>

              <Section title="Другие операции">
                {[
                  ["close_early", "Досрочное закрытие", "loan_id"],
                  ["change_rate", "Изменить ставку", "loan_id, new_rate, effective_date"],
                  ["change_term", "Изменить срок", "loan_id, new_term"],
                  ["delete_contract", "Удалить договор", "loan_id"],
                  ["delete_all_payments", "Удалить все платежи", "loan_id"],
                ].map(([action, desc, params]) => (
                  <div key={action} className="flex gap-2 text-xs py-1 border-b last:border-0">
                    <Code>{action}</Code>
                    <span className="text-foreground/80 flex-1">{desc}</span>
                    <span className="text-muted-foreground">{params}</span>
                  </div>
                ))}
              </Section>
            </TabsContent>

            {/* СБЕРЕЖЕНИЯ */}
            <TabsContent value="savings" className="space-y-4">
              <p className="text-sm text-muted-foreground">Требует <Code>X-Auth-Token</Code> сотрудника.</p>

              <Section title="Список вкладов">
                <Block>{`GET ${BASE_URL}?entity=savings
X-Auth-Token: токен`}</Block>
              </Section>

              <Section title="Создать договор вклада">
                <Block>{`POST ${BASE_URL}
X-Auth-Token: токен
Content-Type: application/json

{
  "entity": "savings",
  "action": "create",
  "member_id": 123,
  "amount": 50000,
  "rate": 10,
  "term_months": 6,
  "payout_type": "monthly",
  "start_date": "2025-01-01",
  "org_id": 1
}`}</Block>
                <Param name="payout_type" type="string" desc="monthly (ежемесячно) | end_of_term (в конце срока)" required />
                <Param name="min_balance_pct" type="number" desc="Неснижаемый остаток, % (по умолч. 0)" />
              </Section>

              <Section title="Операция по вкладу">
                <Block>{`POST ${BASE_URL}
X-Auth-Token: токен
Content-Type: application/json

{
  "entity": "savings",
  "action": "transaction",
  "saving_id": 789,
  "transaction_type": "deposit",
  "amount": 10000,
  "transaction_date": "2025-02-01"
}`}</Block>
                <Param name="transaction_type" type="string" desc="deposit (пополнение) | withdrawal (снятие) | interest_payout (выплата %)" required />
              </Section>

              <Section title="Другие операции">
                {[
                  ["interest_payout", "Выплатить проценты", "saving_id, amount, transaction_date"],
                  ["early_close", "Досрочное закрытие", "saving_id"],
                  ["close_by_term", "Закрытие по окончании срока", "saving_id"],
                  ["change_rate", "Изменить ставку", "saving_id, new_rate"],
                  ["backfill_accrue", "Доначислить проценты", "saving_id, date_from, date_to"],
                  ["delete_contract", "Удалить договор", "saving_id"],
                ].map(([action, desc, params]) => (
                  <div key={action} className="flex gap-2 text-xs py-1 border-b last:border-0">
                    <Code>{action}</Code>
                    <span className="text-foreground/80 flex-1">{desc}</span>
                    <span className="text-muted-foreground">{params}</span>
                  </div>
                ))}
              </Section>
            </TabsContent>

            {/* ПАИ */}
            <TabsContent value="shares" className="space-y-4">
              <p className="text-sm text-muted-foreground">Требует <Code>X-Auth-Token</Code> сотрудника.</p>

              <Section title="Список паевых счётов">
                <Block>{`GET ${BASE_URL}?entity=shares
X-Auth-Token: токен`}</Block>
              </Section>

              <Section title="Открыть счёт">
                <Block>{`POST ${BASE_URL}
X-Auth-Token: токен
Content-Type: application/json

{
  "entity": "shares",
  "action": "create",
  "member_id": 123,
  "amount": 1000,
  "date": "2025-01-01"
}`}</Block>
              </Section>

              <Section title="Операция по паевому счёту">
                <Block>{`POST ${BASE_URL}
X-Auth-Token: токен
Content-Type: application/json

{
  "entity": "shares",
  "action": "transaction",
  "share_id": 10,
  "transaction_type": "deposit",
  "amount": 500,
  "date": "2025-02-01"
}`}</Block>
              </Section>
            </TabsContent>

            {/* ЗАЯВКИ */}
            <TabsContent value="applications" className="space-y-4">
              <p className="text-sm text-muted-foreground">Требует <Code>X-Auth-Token</Code>. Заявки на займы и сбережения.</p>

              <Section title="Заявки на займы">
                <Block>{`# Список
GET ${BASE_URL}?entity=loan_applications
GET ${BASE_URL}?entity=loan_applications&status=new

# Создать
POST ${BASE_URL}
{ "entity": "loan_applications", "action": "create", "amount": 100000, "term_months": 12, ... }

# Одобрить → создаётся договор займа
POST ${BASE_URL}
{ "entity": "loan_applications", "action": "approve", "id": 5,
  "rate": 18, "start_date": "2025-01-01", "schedule_type": "annuity" }

# Отклонить
POST ${BASE_URL}
{ "entity": "loan_applications", "action": "reject", "id": 5, "reason": "Недостаточный доход" }`}</Block>
                <p className="text-xs text-muted-foreground mt-1">Статусы: <Code>new</Code> → <Code>in_review</Code> → <Code>approved</Code> / <Code>rejected</Code> / <Code>archived</Code></p>
              </Section>

              <Section title="Заявки на сбережения">
                <Block>{`# Список
GET ${BASE_URL}?entity=saving_applications
GET ${BASE_URL}?entity=saving_applications&status=new

# Создать
POST ${BASE_URL}
{ "entity": "saving_applications", "action": "create",
  "amount": 50000, "term_months": 6, "rate": 10, "payout_type": "monthly",
  "last_name": "Иванов", "first_name": "Иван", "phone": "+79001234567" }

# Заключить договор → создаётся договор сбережений
POST ${BASE_URL}
{ "entity": "saving_applications", "action": "conclude", "id": 3 }

# Аннулировать
POST ${BASE_URL}
{ "entity": "saving_applications", "action": "annul", "id": 3, "reason": "Отказ клиента" }`}</Block>
                <p className="text-xs text-muted-foreground mt-1">Статусы: <Code>new</Code> → <Code>in_review</Code> → <Code>concluded</Code> / <Code>annulled</Code></p>
              </Section>
            </TabsContent>

            {/* ОШИБКИ */}
            <TabsContent value="errors" className="space-y-4">
              <Section title="Формат ошибок">
                <Block>{`HTTP 400
{ "error": "Текст ошибки" }

HTTP 401
{ "error": "Unauthorized" }

HTTP 403
{ "error": "Forbidden" }`}</Block>
              </Section>

              <Section title="Частые ошибки">
                {[
                  ["401 Unauthorized", "Нет заголовка X-Auth-Token или X-Api-Key, либо токен истёк"],
                  ["403 Forbidden", "Нет прав для данной операции (нужна роль admin)"],
                  ["400 «Договор уже существует»", "Номер договора уже занят, передайте пустой contract_no для автогенерации"],
                  ["400 «Недостаточно средств»", "Сумма снятия превышает баланс счёта"],
                  ["400 «Пайщик не найден»", "Неверный member_id"],
                ].map(([code, desc]) => (
                  <div key={code} className="text-xs py-2 border-b last:border-0">
                    <div className="font-mono text-red-600 dark:text-red-400 mb-0.5">{code}</div>
                    <div className="text-muted-foreground">{desc}</div>
                  </div>
                ))}
              </Section>

              <Section title="CORS">
                <p className="text-sm">API поддерживает запросы со всех доменов (<Code>Access-Control-Allow-Origin: *</Code>). Preflight OPTIONS отвечает автоматически.</p>
              </Section>
            </TabsContent>

          </Tabs>
        </CardContent>
      </Card>

      {/* Диалог создания ключа */}
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
                <div className="text-yellow-800 text-xs">Полный ключ больше не будет показан</div>
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
                <div className="text-xs text-muted-foreground mt-1">Для удобства — чтобы понимать, где используется ключ</div>
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
