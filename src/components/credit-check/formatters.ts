export const FIELD_LABELS: Record<string, string> = {
  source: "Источник",
  status: "Статус",
  http_code: "Код ответа",
  result: "Результат",
  description: "Описание",
  message: "Сообщение",
  error: "Ошибка",
  smev3: "СМЭВ-3",
  smev4: "СМЭВ-4",
  mvd_check: "Проверка МВД",
  count: "Количество",
  records: "Записи",
  high_risk: "Высокий риск",
  medium_risk: "Средний риск",
  low_risk: "Низкий риск",
  total_debt: "Общая сумма долга",
  has_proceedings: "Есть исп. производства",
  is_bankrupt: "Признан банкротом",
  active_count: "Активных процедур",
  has_active_procedure: "Есть активная процедура",
  in_list: "В списке",
  is_wanted: "В розыске",
  is_found: "Найден в реестре",
  fio: "ФИО",
  inn: "ИНН",
  snils: "СНИЛС",
  region: "Регион",
  address: "Адрес",
  manager: "Управляющий",
  case_number: "Номер дела",
  status_code: "Код статуса",
  amount: "Сумма",
  debt_sum: "Сумма долга",
  fine_sum: "Сумма штрафа",
  date: "Дата",
  paid: "Оплачено",
  number: "Номер",
  document: "Документ",
  bailiff: "Пристав",
  subject: "Предмет",
  department: "Отдел",
  start_date: "Дата начала",
  end_date: "Дата окончания",
  total_amount: "Итого",
  comment: "Комментарий",
  category: "Категория",
  passport: "Паспорт",
  is_valid: "Действителен",
  reason: "Причина",
  found: "Найден",
  // РФМ
  is_match: "Найдено совпадение",
  is_blocked: "Заблокирован",
  in_mvk_list: "В перечне МВК",
  in_oon_list: "В перечне ООН",
  in_terrorist_list: "В перечне террористов и экстремистов",
  in_omu_list: "В перечне ОМУ",
  in_sanctions_list: "В санкционных списках",
  is_pep: "Публичное должностное лицо (PEP)",
  orgs: "Организации",
  persons: "Физлица",
  // Мобилизация / ИП / НПД
  is_mobilized: "Мобилизован",
  mob_start: "Начало мобилизации",
  mob_end: "Окончание мобилизации",
  actual_at: "Актуально на",
  is_ip: "Является ИП",
  is_npd_taxpayer: "Самозанятый (НПД)",
  is_chief_founder: "Руководитель / учредитель",
  is_bankruptcy_trustee: "Арбитражный управляющий",
  details: "Детали",
  fns: "ФНС",
  // Штрафы / ГИС ГМП
  charges: "Начисления",
  has_charges: "Есть начисления",
  charges_count: "Кол-во начислений",
  has_fines: "Есть штрафы",
  fines_count: "Кол-во штрафов",
  // База должников
  has_legal_case: "Есть судебное дело",
  legal_case: "Судебное дело",
  extrajudicial_bankruptcy_id: "ID внесудебного банкротства",
  has_extrajudicial_bankruptcy: "Есть внесудебное банкротство",
  // Прочее
  warnings: "Предупреждения",
  has_debt: "Есть задолженность",
};

export const SOURCE_LABELS: Record<string, string> = {
  smev3_full: "СМЭВ-3 (полный)",
  smev3: "СМЭВ-3",
  smev4: "СМЭВ-4",
  apicloud_mvd_passport: "API Cloud (МВД, паспорт)",
  apicloud_fssp: "API Cloud (ФССП)",
  apicloud_bankruptcy: "API Cloud (Федресурс)",
  apicloud_rfm: "API Cloud (РФМ)",
  apicloud_mvd_wanted: "API Cloud (Розыск МВД)",
  apicloud_mvd_rkl: "API Cloud (Реестр КЛ)",
  apicloud_flmob: "API Cloud (Мобилизация)",
  apicloud_fines: "API Cloud (Штрафы)",
  apicloud_gisgmp: "API Cloud (ГИС ГМП)",
  fns_smev3: "ФНС (СМЭВ-3)",
  fns_tax_debt: "ФНС (налоговая задолженность)",
  smev3_flmob: "СМЭВ-3 (мобилизация)",
  rfm_checker: "Росфинмониторинг",
  gisgmp: "ГИС ГМП",
  okb: "ОКБ — Объединённое кредитное бюро",
  nbki: "НБКИ — Национальное бюро кредитных историй",
  kvell_smz: "Kvell (самозанятость)",
  kvell_fines: "Kvell (штрафы)",
  kvell_sanctions: "Kvell (санкции)",
  kvell_client_debt: "Kvell (база должников)",
};

export const STATUS_LABELS: Record<string, string> = {
  ok: "Успешно",
  valid: "Действителен",
  invalid: "Недействителен",
  unavailable: "Недоступен",
  not_found: "Не найдено",
  found: "Найдено",
  pending: "В обработке",
  running: "Выполняется",
  error: "Ошибка",
  done: "Готово",
  completed: "Завершено",
  failed: "Не выполнено",
  clean: "Чисто",
  match: "Совпадение",
  blocked: "Заблокирован",
  warning: "Предупреждение",
  skipped: "Пропущено",
  timeout: "Превышено время ожидания",
  no_data: "Нет данных",
};

export const STATUS_CODE_LABELS: Record<string, string> = {
  CitizenAssetsDisposal: "Реализация имущества гражданина",
  CitizenDebtRestructuring: "Реструктуризация долгов гражданина",
  CompletedAssetsDisposal: "Завершена реализация имущества",
  CompletedDebtRestructuring: "Завершена реструктуризация",
};

export const RESULT_LABELS: Record<string, string> = {
  VALID: "Действителен",
  INVALID: "Недействителен",
  NOT_FOUND: "Не найден",
  ACTIVE: "Активен",
  EXPIRED: "Просрочен",
};

export const HTTP_CODE_LABELS: Record<number, string> = {
  200: "OK",
  401: "Не авторизован",
  403: "Доступ запрещён",
  404: "Не найдено",
  500: "Ошибка сервиса",
  503: "Сервис недоступен",
};

const TECH_FIELDS = new Set(["source", "http_code", "raw", "request_id"]);

export const isTechField = (key: string) => TECH_FIELDS.has(key);

export const fmtLabel = (key: string): string => {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
};

export const fmtBool = (v: boolean): string => (v ? "Да" : "Нет");

export const fmtValue = (key: string, v: unknown): string => {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return fmtBool(v);
  if (typeof v === "number") {
    if (key === "http_code" && HTTP_CODE_LABELS[v]) return `${v} (${HTTP_CODE_LABELS[v]})`;
    if (["total_debt", "amount", "debt_sum", "fine_sum", "total_amount"].includes(key)) {
      return new Intl.NumberFormat("ru-RU").format(v) + " ₽";
    }
    return String(v);
  }
  if (typeof v === "string") {
    if (key === "source" && SOURCE_LABELS[v]) return SOURCE_LABELS[v];
    if (key === "status" && STATUS_LABELS[v.toLowerCase()]) return STATUS_LABELS[v.toLowerCase()];
    if (key === "status_code" && STATUS_CODE_LABELS[v]) return STATUS_CODE_LABELS[v];
    if (key === "result" && RESULT_LABELS[v]) return RESULT_LABELS[v];
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleString("ru-RU");
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return d.toLocaleDateString("ru-RU");
    }
    return v;
  }
  return JSON.stringify(v);
};