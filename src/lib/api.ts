import funcUrls from "../../backend/func2url.json";

export const toNum = (v: string | number): number => typeof v === "number" ? v : Number(String(v).replace(",", "."));

const API_URL = funcUrls.api;

type Params = Record<string, string | number | undefined>;

function getStaffToken(): string {
  return sessionStorage.getItem("staff_token") || "";
}

async function request<T>(method: string, params?: Params, body?: unknown): Promise<T> {
  const url = new URL(API_URL);
  if (params) {
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined) url.searchParams.set(key, String(val));
    });
  }

  const hdrs: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStaffToken();
  if (token) hdrs["X-Auth-Token"] = token;

  const options: RequestInit = { method, headers: hdrs };
  if (body) options.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(url.toString(), options);
  } catch {
    throw new Error("Нет связи с сервером. Проверьте интернет-соединение.");
  }
  if (res.status === 402) throw new Error("Превышен лимит запросов. Попробуйте позже.");
  let data: T & { error?: string };
  try {
    data = await res.json();
  } catch {
    throw new Error("Сервер вернул некорректный ответ");
  }
  if (!res.ok || data.error) throw new Error(data.error || "Ошибка сервера");
  return data;
}

export const api = {
  dashboard: (orgId?: number) => request<DashboardStats>("GET", { entity: "dashboard", org_id: orgId }),

  members: {
    list: () => request<Member[]>("GET", { entity: "members" }),
    get: (id: number) => request<MemberDetail>("GET", { entity: "members", id }),
    create: (data: Partial<MemberDetail>) => request<{ id: number; member_no: string }>("POST", undefined, { entity: "members", ...data }),
    update: (data: Partial<MemberDetail>) => request<{ success: boolean }>("PUT", { entity: "members" }, { entity: "members", ...data }),
    delete: (memberId: number) => request<{ success: boolean }>("DELETE", { entity: "members", id: memberId }),
  },

  memberOrgs: {
    list: (memberId: number) => request<MemberOrg[]>("GET", { entity: "member_orgs", member_id: memberId }),
    create: (data: { member_id: number; org_id: number; joined_at: string; excluded_at?: string }) =>
      request<{ id: number }>("POST", undefined, { entity: "member_orgs", ...data }),
    update: (data: { member_id: number; id: number; org_id?: number; joined_at?: string; excluded_at?: string | null }) =>
      request<{ success: boolean }>("PUT", { entity: "member_orgs" }, { entity: "member_orgs", ...data }),
    remove: (memberId: number, id: number) =>
      request<{ success: boolean }>("DELETE", { entity: "member_orgs", member_id: memberId, id }),
  },

  memberChecks: {
    list: (memberId: number) => request<MemberCheck[]>("GET", { entity: "member_checks", member_id: memberId }),
    create: (data: { member_id: number; check_type: string; status: string; comment?: string; result?: Record<string, unknown> }) =>
      request<{ id: number }>("POST", undefined, { entity: "member_checks", ...data }),
    update: (data: { member_id: number; id: number; status?: string; comment?: string; result?: Record<string, unknown> }) =>
      request<{ success: boolean }>("PUT", { entity: "member_checks" }, { entity: "member_checks", ...data }),
    delete: (memberId: number, checkId: number) =>
      request<{ success: boolean }>("DELETE", { entity: "member_checks", member_id: memberId, check_id: checkId }),
    passportAutoCheck: (memberId: number) =>
      request<PassportCheckResult>("POST", undefined, { entity: "member_checks", member_id: memberId, action: "passport_auto" }),
    passportPoll: (memberId: number, requestId: string, checkId: number) =>
      request<PassportCheckResult>("POST", undefined, { entity: "member_checks", member_id: memberId, action: "passport_poll", request_id: requestId, check_id: checkId }),
  },

  loans: {
    list: () => request<Loan[]>("GET", { entity: "loans" }),
    get: (id: number) => request<LoanDetail>("GET", { entity: "loans", action: "detail", id }),
    calcSchedule: (amount: number, rate: number, term: number, scheduleType: string, startDate: string) =>
      request<{ schedule: ScheduleItem[]; monthly_payment: number }>("GET", {
        entity: "loans", action: "schedule", amount, rate, term, schedule_type: scheduleType, start_date: startDate,
      }),
    create: (data: CreateLoanData) => request<{ id: number; schedule: ScheduleItem[]; monthly_payment: number }>("POST", undefined, { entity: "loans", action: "create", ...data }),
    payment: (data: { loan_id: number; payment_date: string; amount: number; overpay_strategy?: string }) =>
      request<PaymentResult>("POST", undefined, { entity: "loans", action: "payment", ...data }),
    earlyRepayment: (data: { loan_id: number; amount: number; repayment_type: string; payment_date: string }) =>
      request<unknown>("POST", undefined, { entity: "loans", action: "early_repayment", ...data }),
    modify: (data: { loan_id: number; new_rate?: number; new_term?: number; new_amount?: number; effective_date?: string }) =>
      request<{ success: boolean; new_schedule: ScheduleItem[]; monthly_payment: number; new_balance: number }>("POST", undefined, { entity: "loans", action: "modify", ...data }),
    updateLoan: (data: { loan_id: number; contract_no?: string; member_id?: number; amount?: number; rate?: number; term_months?: number; schedule_type?: string; start_date?: string; org_id?: number | null }) =>
      request<{ success: boolean; schedule: ScheduleItem[]; monthly_payment: number; new_end_date: string; new_balance: number }>("POST", undefined, { entity: "loans", action: "update_loan", ...data }),
    deleteContract: (loanId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "loans", action: "delete_contract", loan_id: loanId }),
    deleteAllPayments: (loanId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "loans", action: "delete_all_payments", loan_id: loanId }),
    updatePayment: (data: { payment_id: number; payment_date?: string; amount?: number; principal_part?: number; interest_part?: number; penalty_part?: number; manual_distribution?: boolean }) =>
      request<{ success: boolean }>("POST", undefined, { entity: "loans", action: "update_payment", ...data }),
    deletePayment: (paymentId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "loans", action: "delete_payment", payment_id: paymentId }),
    fixSchedule: (loanId: number) =>
      request<{ success: boolean; removed_duplicates: number; new_balance: number }>("POST", undefined, { entity: "loans", action: "fix_schedule", loan_id: loanId }),
    rebuildSchedule: (loanId: number, termMonths?: number, rate?: number) =>
      request<{ success: boolean; periods: number; monthly_payment: number; end_date: string }>("POST", undefined, { entity: "loans", action: "rebuild_schedule", loan_id: loanId, ...(termMonths ? { term_months: termMonths } : {}), ...(rate ? { rate } : {}) }),
    checkStatus: (loanNumber: string) =>
      request<CheckStatusResult>("GET", { entity: "loans", action: "check_status", loan_number: loanNumber }),
    recalcStatuses: (loanId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "loans", action: "recalc_statuses", loan_id: loanId }),
    reconciliationReport: (loanId: number) =>
      request<ReconciliationReport>("GET", { entity: "loans", action: "reconciliation_report", id: loanId }),
    setHoliday: (data: { loan_id: number; holiday_start: string; holiday_months: number }) =>
      request<{ success: boolean; holiday_start: string; holiday_end: string; new_end_date: string; holiday_months: number; extended_schedule: ScheduleItem[] }>("POST", undefined, { entity: "loans", action: "set_holiday", ...data }),
    cancelHoliday: (loanId: number) =>
      request<{ success: boolean; message: string }>("POST", undefined, { entity: "loans", action: "set_holiday", loan_id: loanId, holiday_months: 0 }),
  },

  savings: {
    list: () => request<Saving[]>("GET", { entity: "savings" }),
    get: (id: number) => request<SavingDetail>("GET", { entity: "savings", action: "detail", id }),
    calcSchedule: (amount: number, rate: number, term: number, payoutType: string, startDate: string) =>
      request<{ schedule: SavingsScheduleItem[] }>("GET", {
        entity: "savings", action: "schedule", amount, rate, term, payout_type: payoutType, start_date: startDate,
      }),
    create: (data: CreateSavingData) => request<{ id: number; schedule: SavingsScheduleItem[] }>("POST", undefined, { entity: "savings", action: "create", ...data }),
    transaction: (data: { saving_id: number; amount: number; transaction_type: string; transaction_date?: string; is_cash?: boolean; description?: string }) =>
      request<{ success: boolean }>("POST", undefined, { entity: "savings", action: "transaction", ...data }),
    earlyClose: (savingId: number) => request<{ final_amount: number; early_interest: number }>("POST", undefined, { entity: "savings", action: "early_close", saving_id: savingId }),
    closeByTerm: (savingId: number) => request<{ final_amount: number; accrued_paid: number }>("POST", undefined, { entity: "savings", action: "close_by_term", saving_id: savingId }),
    deleteContract: (savingId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "savings", action: "delete_contract", saving_id: savingId }),
    deleteAllTransactions: (savingId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "savings", action: "delete_all_transactions", saving_id: savingId }),
    interestPayout: (data: { saving_id: number; amount?: number; transaction_date?: string }) =>
      request<{ success: boolean; amount: number; max_payout: number }>("POST", undefined, { entity: "savings", action: "interest_payout", ...data }),
    partialWithdrawal: (data: { saving_id: number; amount: number; transaction_date?: string }) =>
      request<{ success: boolean; new_balance: number; min_balance: number }>("POST", undefined, { entity: "savings", action: "partial_withdrawal", ...data }),
    modifyTerm: (data: { saving_id: number; new_term: number; effective_date?: string }) =>
      request<{ success: boolean; new_term: number; new_end_date: string; schedule: SavingsScheduleItem[] }>("POST", undefined, { entity: "savings", action: "modify_term", ...data }),
    backfillAccrue: (data: { saving_id: number; date_from?: string; date_to?: string; mode?: string }) =>
      request<{ success: boolean; days_added: number; days_fixed: number; total_added: number; total_fixed_diff: number; date_from: string; date_to: string; mode: string }>("POST", undefined, { entity: "savings", action: "backfill_accrue", ...data }),
    recalcSchedule: (savingId: number) =>
      request<{ success: boolean; new_end_date: string }>("POST", undefined, { entity: "savings", action: "recalc_schedule", saving_id: savingId }),
    update: (data: { saving_id: number; contract_no?: string; member_id?: number; amount?: number; rate?: number; term_months?: number; payout_type?: string; start_date?: string; min_balance_pct?: number; org_id?: number | null }) =>
      request<{ success: boolean; schedule: SavingsScheduleItem[]; new_end_date: string }>("POST", undefined, { entity: "savings", action: "update_saving", ...data }),
    changeRate: (data: { saving_id: number; new_rate: number; effective_date?: string; reason?: string }) =>
      request<{ success: boolean; old_rate: number; new_rate: number }>("POST", undefined, { entity: "savings", action: "change_rate", ...data }),
    updateTransaction: (data: { transaction_id: number; amount?: number; transaction_date?: string; description?: string }) =>
      request<{ success: boolean }>("POST", undefined, { entity: "savings", action: "update_transaction", ...data }),
    deleteTransaction: (transactionId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "savings", action: "delete_transaction", transaction_id: transactionId }),
    deleteAccrual: (accrualId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "savings", action: "delete_accrual", accrual_id: accrualId }),
    clearDailyAccruals: (savingId: number) =>
      request<{ success: boolean; cleared_amount: number }>("POST", undefined, { entity: "savings", action: "clear_daily_accruals", saving_id: savingId }),
    recalcAllActive: () =>
      request<{ success: boolean; recalculated: number; total: number; errors: { contract_no: string; error: string }[] }>("POST", undefined, { entity: "savings", action: "recalc_all_active" }),
  },

  shares: {
    list: () => request<ShareAccount[]>("GET", { entity: "shares" }),
    get: (id: number) => request<ShareAccountDetail>("GET", { entity: "shares", action: "detail", id }),
    create: (data: { member_id: number; amount: number; org_id?: number }) => request<{ id: number; account_no: string }>("POST", undefined, { entity: "shares", action: "create", ...data }),
    transaction: (data: { account_id: number; amount: number; transaction_type: string; transaction_date?: string; description?: string }) =>
      request<{ success: boolean }>("POST", undefined, { entity: "shares", action: "transaction", ...data }),
    updateTransaction: (data: { transaction_id: number; amount?: number; transaction_date?: string; description?: string }) =>
      request<{ success: boolean }>("POST", undefined, { entity: "shares", action: "update_transaction", ...data }),
    deleteTransaction: (transactionId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "shares", action: "delete_transaction", transaction_id: transactionId }),
    deleteAccount: (accountId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "shares", action: "delete_account", account_id: accountId }),
    deleteAllTransactions: (accountId: number) =>
      request<{ success: boolean }>("POST", undefined, { entity: "shares", action: "delete_all_transactions", account_id: accountId }),
  },

  loanApplications: {
    list: (status?: string) => request<LoanApplication[]>("GET", { entity: "loan_applications", ...(status ? { status } : {}) }),
    get: (id: number) => request<LoanApplication>("GET", { entity: "loan_applications", id }),
    create: (data: Partial<LoanApplication>) => request<{ id: number; application_no: string }>("POST", undefined, { entity: "loan_applications", action: "create", ...data }),
    update: (id: number, data: Partial<LoanApplication>) => request<{ success: boolean }>("POST", undefined, { entity: "loan_applications", action: "update", id, ...data }),
    approve: (id: number, data: { rate: number; start_date: string; schedule_type: string }) =>
      request<{ success: boolean; loan_id: number; contract_no: string; monthly_payment: number }>("POST", undefined, { entity: "loan_applications", action: "approve", id, ...data }),
    reject: (id: number, reason: string) => request<{ success: boolean }>("POST", undefined, { entity: "loan_applications", action: "reject", id, reason }),
    archive: (id: number) => request<{ success: boolean }>("POST", undefined, { entity: "loan_applications", action: "delete", id }),
  },

  savingApplications: {
    list: (status?: string) => request<SavingApplication[]>("GET", { entity: "saving_applications", ...(status ? { status } : {}) }),
    get: (id: number) => request<SavingApplication>("GET", { entity: "saving_applications", id }),
    create: (data: Partial<SavingApplication>) => request<{ id: number; application_no: string }>("POST", undefined, { entity: "saving_applications", action: "create", ...data }),
    update: (id: number, data: Partial<SavingApplication>) => request<{ success: boolean }>("POST", undefined, { entity: "saving_applications", action: "update", id, ...data }),
    conclude: (id: number) => request<{ success: boolean; saving_id: number; contract_no: string }>("POST", undefined, { entity: "saving_applications", action: "conclude", id }),
    annul: (id: number, reason: string) => request<{ success: boolean }>("POST", undefined, { entity: "saving_applications", action: "annul", id, reason }),
  },

  export: {
    download: async (type: "loan" | "saving" | "share" | "saving_transactions" | "loan_certificate" | "loan_closure" | "members" | "loans_list" | "savings_list" | "loan_application" | "saving_application", id: number | undefined, format: "xlsx" | "pdf" | "docx", extra?: Record<string, string>) => {
      const params: Record<string, unknown> = { entity: "export", type, format, ...extra };
      if (id !== undefined) params.id = id;
      const res = await request<ExportResult>("GET", params);
      const binary = atob(res.file);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.content_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  },

  publicOrgs: () => request<{ name: string; short_name: string; inn: string }[]>("GET", { entity: "public_orgs" }),

  auth: {
    sendSms: (phone: string) => request<AuthSmsResult>("POST", undefined, { entity: "auth", action: "send_sms", phone }),
    verifySms: (phone: string, code: string) => request<AuthVerifyResult>("POST", undefined, { entity: "auth", action: "verify_sms", phone, code }),
    setPassword: (setupToken: string, password: string) => request<AuthLoginResult>("POST", undefined, { entity: "auth", action: "set_password", setup_token: setupToken, password }),
    loginPassword: (phone: string, password: string, login?: string) => request<AuthLoginResult>("POST", undefined, { entity: "auth", action: "login_password", phone, login, password }),
    changePassword: (token: string, oldPassword: string, newPassword: string) => request<{ success: boolean }>("POST", undefined, { entity: "auth", action: "change_password", token, old_password: oldPassword, new_password: newPassword }),
    logout: (token: string) => request<{ success: boolean }>("POST", undefined, { entity: "auth", action: "logout", token }),
    check: (token: string) => request<AuthLoginResult>("POST", undefined, { entity: "auth", action: "check", token }),
  },

  cabinet: {
    overview: (token: string) => request<CabinetOverview>("GET", { entity: "cabinet", action: "overview", token }),
    loanDetail: (token: string, id: number) => request<LoanDetail>("GET", { entity: "cabinet", action: "loan_detail", token, id }),
    savingDetail: (token: string, id: number) => request<CabinetSavingDetail>("GET", { entity: "cabinet", action: "saving_detail", token, id }),
    loanClosure: async (token: string, id: number) => {
      const res = await request<ExportResult>("GET", { entity: "cabinet", action: "loan_closure", token, id });
      const binary = atob(res.file);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.content_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    loanCertificate: async (token: string, id: number, dateFrom: string, dateTo: string) => {
      const res = await request<ExportResult>("GET", { entity: "cabinet", action: "loan_certificate", token, id, date_from: dateFrom, date_to: dateTo });
      const binary = atob(res.file);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.content_type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    telegramLink: (token: string) => request<{ bot_username: string; link_code: string; link_url: string }>("POST", undefined, { entity: "cabinet", action: "telegram_link", token }),
    telegramStatus: (token: string) => request<{ linked: boolean; chat_id?: number; username?: string; first_name?: string; subscribed_at?: string }>("GET", { entity: "cabinet", action: "telegram_status", token }),
    telegramUnlink: (token: string) => request<{ success: boolean }>("POST", undefined, { entity: "cabinet", action: "telegram_unlink", token }),
    maxLink: (token: string) => request<{ bot_username: string; link_code: string; link_url: string }>("POST", undefined, { entity: "cabinet", action: "max_link", token }),
    maxStatus: (token: string) => request<{ linked: boolean; chat_id?: number; username?: string; first_name?: string; subscribed_at?: string }>("GET", { entity: "cabinet", action: "max_status", token }),
    maxUnlink: (token: string) => request<{ success: boolean }>("POST", undefined, { entity: "cabinet", action: "max_unlink", token }),
  },

  staffAuth: {
    login: (login: string, password: string) => request<StaffLoginResult>("POST", undefined, { entity: "staff_auth", action: "login", login, password }),
    check: (token: string) => request<StaffLoginResult>("POST", undefined, { entity: "staff_auth", action: "check", token }),
    logout: (token: string) => request<{ success: boolean }>("POST", undefined, { entity: "staff_auth", action: "logout", token }),
    changePassword: (token: string, oldPassword: string, newPassword: string) => request<{ success: boolean }>("POST", undefined, { entity: "staff_auth", action: "change_password", token, old_password: oldPassword, new_password: newPassword }),
  },

  users: {
    list: () => request<StaffUser[]>("GET", { entity: "users" }),
    get: (id: number) => request<StaffUser>("GET", { entity: "users", id }),
    create: (data: { login: string; name: string; role: string; password: string; email?: string; phone?: string; member_id?: number }) =>
      request<{ id: number; login: string }>("POST", undefined, { entity: "users", action: "create", ...data }),
    update: (data: { id: number; name?: string; role?: string; login?: string; email?: string; phone?: string; password?: string; status?: string; member_id?: number | null }) =>
      request<{ success: boolean }>("POST", undefined, { entity: "users", action: "update", ...data }),
    delete: (id: number) => request<{ success: boolean }>("POST", undefined, { entity: "users", action: "delete", id }),
    bulkCreateClients: (password?: string) =>
      request<{ success: boolean; created: number; skipped: number; skipped_reasons: string[]; password: string }>("POST", undefined, { entity: "users", action: "bulk_create_clients", password }),
  },

  audit: {
    list: (params?: { limit?: number; offset?: number; filter_entity?: string; filter_action?: string }) =>
      request<AuditListResult>("GET", { entity: "audit", ...params }),
  },

  apiKeys: {
    list: () => request<Array<{ id: number; key_prefix: string; name: string; is_active: boolean; created_at: string; last_used_at?: string; last_used_ip?: string; usage_count: number }>>("GET", { entity: "api_keys" }),
    create: (name: string) => request<{ id: number; key: string; key_prefix: string; name: string; warning: string }>("POST", undefined, { entity: "api_keys", action: "create", name }),
    toggle: (id: number) => request<{ success: boolean; is_active: boolean }>("POST", undefined, { entity: "api_keys", action: "toggle", id }),
    delete: (id: number) => request<{ success: boolean }>("POST", undefined, { entity: "api_keys", action: "delete", id }),
  },

  orgSettings: {
    get: () => request<OrgSettings>("GET", { entity: "org_settings" }),
    save: (settings: Partial<OrgSettings>) => request<{ success: boolean }>("POST", undefined, { entity: "org_settings", settings }),
  },

  push: {
    vapidKey: () => request<{ vapid_public_key: string }>("POST", undefined, { entity: "push", action: "vapid_key" }),
    subscribe: (token: string, subscription: PushSubscriptionJSON, userAgent: string) =>
      request<{ success: boolean }>("POST", undefined, { entity: "push", action: "subscribe", token, subscription, user_agent: userAgent }),
    unsubscribe: (token: string, endpoint?: string) =>
      request<{ success: boolean }>("POST", undefined, { entity: "push", action: "unsubscribe", token, endpoint }),
    checkSubscription: (token: string) =>
      request<{ subscribed: boolean }>("POST", undefined, { entity: "push", action: "check_subscription", token }),
    stats: () => request<PushStats>("GET", { entity: "push", action: "stats" }),
    subscribers: () => request<PushSubscriber[]>("GET", { entity: "push", action: "subscribers" }),
    messages: (limit?: number, offset?: number) =>
      request<{ items: PushMessage[]; total: number }>("GET", { entity: "push", action: "messages", limit, offset }),
    send: (data: { title: string; body: string; url?: string; target?: string; target_user_ids?: number[] }) =>
      request<{ success: boolean; message_id: number; sent: number; failed: number }>("POST", undefined, { entity: "push", action: "send", ...data }),
    messageLog: (id: number) => request<PushMessageLogEntry[]>("GET", { entity: "push", action: "message_log", id }),
    myMessages: (token: string) => request<PushClientMessage[]>("POST", undefined, { entity: "push", action: "my_messages", token }),
    getSettings: () => request<PushSettings>("GET", { entity: "push", action: "get_settings" }),
    saveSettings: (settings: Partial<PushSettings>) => request<{ success: boolean }>("POST", undefined, { entity: "push", action: "save_settings", settings }),
  },

  notifications: {
    channels: () => request<NotificationChannel[]>("GET", { entity: "notifications", action: "channels" }),
    saveChannel: (channel: string, enabled?: boolean, settings?: Record<string, unknown>) =>
      request<{ success: boolean }>("POST", undefined, { entity: "notifications", action: "save_channel", channel, enabled, settings }),
    telegramSubscribers: () => request<TelegramSubscriber[]>("GET", { entity: "notifications", action: "telegram_subscribers" }),
    sendTelegram: (data: { title?: string; body: string; target?: string; target_user_ids?: number[] }) =>
      request<{ success: boolean; notification_id: number; sent: number; failed: number }>("POST", undefined, { entity: "notifications", action: "send_telegram", ...data }),
    sendEmail: (data: { title: string; body: string; target?: string; target_user_ids?: number[] }) =>
      request<{ success: boolean; notification_id: number; sent: number; failed: number }>("POST", undefined, { entity: "notifications", action: "send_email", ...data }),
    history: (channel?: string, limit?: number, offset?: number) =>
      request<{ items: NotificationHistoryItem[]; total: number }>("GET", { entity: "notifications", action: "history", channel, limit, offset }),
    historyLog: (id: number) => request<NotificationLogEntry[]>("GET", { entity: "notifications", action: "history_log", id }),
    stats: () => request<NotificationStats>("GET", { entity: "notifications", action: "stats" }),
    testTelegram: (chat_id: string) => request<{ success: boolean }>("POST", undefined, { entity: "notifications", action: "test_telegram", chat_id }),
    testEmail: (to_email: string) => request<{ success: boolean }>("POST", undefined, { entity: "notifications", action: "test_email", to_email }),
    setWebhook: (webhookUrl?: string) => request<{ success: boolean; webhook_url: string }>("POST", undefined, { entity: "notifications", action: "set_webhook", webhook_url: webhookUrl }),
    deleteWebhook: () => request<{ success: boolean }>("POST", undefined, { entity: "notifications", action: "delete_webhook" }),
    webhookInfo: () => request<{ url: string; has_custom_certificate: boolean; pending_update_count: number; last_error_date?: number; last_error_message?: string }>("POST", undefined, { entity: "notifications", action: "webhook_info" }),
    getTelegramSettings: () => request<Record<string, string>>("GET", { entity: "notifications", action: "get_telegram_settings" }),
    saveTelegramSettings: (settings: Record<string, string>) => request<{ success: boolean }>("POST", undefined, { entity: "notifications", action: "save_telegram_settings", settings }),
    maxSubscribers: () => request<TelegramSubscriber[]>("GET", { entity: "notifications", action: "max_subscribers" }),
    sendMax: (data: { title?: string; body: string; target?: string; target_user_ids?: number[] }) =>
      request<{ success: boolean; notification_id: number; sent: number; failed: number }>("POST", undefined, { entity: "notifications", action: "send_max", ...data }),
    testMax: (chat_id: string) => request<{ success: boolean }>("POST", undefined, { entity: "notifications", action: "test_max", chat_id }),
    setMaxWebhook: (webhookUrl?: string) => request<{ success: boolean; webhook_url: string }>("POST", undefined, { entity: "notifications", action: "set_max_webhook", webhook_url: webhookUrl }),
    deleteMaxWebhook: () => request<{ success: boolean }>("POST", undefined, { entity: "notifications", action: "delete_max_webhook" }),
    maxWebhookInfo: () => request<{ url: string; update_types?: string[]; error?: string }>("POST", undefined, { entity: "notifications", action: "max_webhook_info" }),
    getMaxSettings: () => request<Record<string, string>>("GET", { entity: "notifications", action: "get_max_settings" }),
    saveMaxSettings: (settings: Record<string, string>) => request<{ success: boolean }>("POST", undefined, { entity: "notifications", action: "save_max_settings", settings }),
  },

  organizations: {
    list: () => request<Organization[]>("GET", { entity: "organizations" }),
    get: (id: number) => request<Organization>("GET", { entity: "organizations", id }),
    create: (data: Partial<Organization>) => request<{ id: number }>("POST", undefined, { entity: "organizations", action: "create", ...data }),
    update: (data: Partial<Organization> & { id: number }) => request<{ success: boolean }>("POST", undefined, { entity: "organizations", action: "update", ...data }),
    uploadLogo: (orgId: number, logoBase64: string, contentType?: string) => request<{ success: boolean; logo_url: string }>("POST", undefined, { entity: "organizations", action: "upload_logo", id: orgId, logo: logoBase64, content_type: contentType }),
    uploadImage: (orgId: number, imageType: "signature" | "stamp", base64: string, contentType?: string) => request<{ success: boolean; url: string }>("POST", undefined, { entity: "organizations", action: "upload_image", id: orgId, image_type: imageType, image: base64, content_type: contentType }),
    delete: (id: number) => request<{ success: boolean }>("POST", undefined, { entity: "organizations", action: "delete", id }),
  },

  podft: {
    history: () => request<RfmCheck[]>("GET", { entity: "podft", action: "history" }),
    detail: (id: number) => request<RfmCheckDetail>("GET", { entity: "podft", action: "detail", id }),
    last: () => request<RfmCheckDetail | { status: string }>("GET", { entity: "podft", action: "last" }),
    run: () => request<RfmRunResult>("POST", undefined, { entity: "podft", action: "run" }),
  },

  chat: {
    list: (token: string) => request<ChatConversation[]>("GET", { entity: "chat", action: "list", token }),
    staffList: () => request<ChatConversationStaff[]>("GET", { entity: "chat", action: "list" }),
    create: (token: string, subject?: string) => request<{ id: number; created_at: string }>("POST", undefined, { entity: "chat", action: "create", token, subject }),
    messages: (token: string, conversationId: number) => request<ChatMessage[]>("GET", { entity: "chat", action: "messages", token, conversation_id: conversationId }),
    staffMessages: (conversationId: number) => request<ChatMessage[]>("GET", { entity: "chat", action: "messages", conversation_id: conversationId }),
    send: (token: string, conversationId: number, body: string) => request<ChatSendResult>("POST", undefined, { entity: "chat", action: "send", token, conversation_id: conversationId, body }),
    staffSend: (conversationId: number, body: string) => request<ChatSendResult>("POST", undefined, { entity: "chat", action: "send", conversation_id: conversationId, body }),
    close: (token: string, conversationId: number) => request<{ success: boolean }>("POST", undefined, { entity: "chat", action: "close", token, conversation_id: conversationId }),
    staffClose: (conversationId: number) => request<{ success: boolean }>("POST", undefined, { entity: "chat", action: "close", conversation_id: conversationId }),
    reopen: (token: string, conversationId: number) => request<{ success: boolean }>("POST", undefined, { entity: "chat", action: "reopen", token, conversation_id: conversationId }),
    staffReopen: (conversationId: number) => request<{ success: boolean }>("POST", undefined, { entity: "chat", action: "reopen", conversation_id: conversationId }),
    toggleAi: (conversationId: number, enabled: boolean) => request<{ success: boolean; ai_enabled: boolean }>("POST", undefined, { entity: "chat", action: "toggle_ai", conversation_id: conversationId, enabled }),
    assign: (conversationId: number, staffId: number | null) => request<{ success: boolean }>("POST", undefined, { entity: "chat", action: "assign", conversation_id: conversationId, staff_id: staffId }),
  },
};

export interface RfmCheck {
  id: number;
  check_date: string;
  total_members: number;
  checked_count: number;
  found_count: number;
  status: string;
  started_by: string;
  completed_at: string | null;
  created_at: string;
}

export interface RfmFoundEntry {
  member_id: number;
  member_no: string;
  member_name: string;
  matches: Array<Record<string, unknown>>;
  lists: string[];
}

export interface RfmCheckDetail extends RfmCheck {
  results: RfmFoundEntry[];
}

export interface RfmRunResult {
  check_id: number;
  total_members: number;
  checked: number;
  found: number;
  found_details: RfmFoundEntry[];
  status: string;
  error?: string;
}

export interface OverdueLoanItem {
  loan_id: number;
  contract_no: string;
  member_id: number;
  member_name: string;
  balance: number;
  rate: number;
  end_date: string;
  org_id: number | null;
  org_name: string;
  overdue_amount: number;
  overdue_since: string | null;
  overdue_days: number;
  penalty_total: number;
}

export interface DashboardOrg {
  id: number;
  name: string;
  short_name: string;
}

export interface ExpiringSavingItem {
  saving_id: number;
  contract_no: string;
  member_id: number;
  member_name: string;
  current_balance: number;
  accrued_interest: number;
  paid_interest: number;
  rate: number;
  end_date: string;
  org_id: number | null;
  org_name: string;
  refund_amount: number;
}

export interface DashboardStats {
  total_members: number;
  active_loans: number;
  loan_portfolio: number;
  overdue_loans: number;
  total_savings: number;
  total_shares: number;
  organizations: DashboardOrg[];
  overdue_loan_list: OverdueLoanItem[];
  expiring_savings: ExpiringSavingItem[];
  expiring_savings_total: number;
}

export interface CheckStatusResult {
  loan_id: number;
  loan_number: string;
  schedule: Array<{
    payment_no: number;
    payment_date: string;
    principal: number;
    interest: number;
    penalty: number;
    paid_amount: number;
    status: string;
    paid_date: string | null;
  }>;
  payments: Array<{
    payment_date: string;
    amount: number;
    principal: number;
    interest: number;
    penalty: number;
  }>;
  total_paid_from_schedule: number;
  total_paid_from_payments: number;
  last_paid_period: string | null;
  stats: {
    paid: number;
    partial: number;
    pending: number;
    overdue: number;
  };
}

export interface MemberCheck {
  id: number;
  member_id: number;
  check_type: string;
  status: string;
  result: Record<string, unknown>;
  comment: string;
  checked_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface PassportCheckResult {
  check_id?: number;
  request_id?: string;
  status: string;
  comment?: string;
  message?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface MemberOrg {
  id: number;
  member_id: number;
  org_id: number;
  org_name: string;
  org_short_name: string;
  joined_at: string;
  excluded_at: string | null;
}

export interface Member {
  id: number;
  member_no: string;
  member_type: string;
  name: string;
  inn: string;
  phone: string;
  email: string;
  status: string;
  created_at: string;
  active_loans: number;
  active_savings: number;
}

export interface MemberDetail {
  id: number;
  member_no: string;
  member_type: string;
  last_name: string;
  first_name: string;
  middle_name: string;
  birth_date: string;
  birth_place: string;
  inn: string;
  passport_series: string;
  passport_number: string;
  passport_dept_code: string;
  passport_issue_date: string;
  passport_issued_by: string;
  registration_address: string;
  phone: string;
  email: string;
  telegram: string;
  bank_bik: string;
  bank_account: string;
  marital_status: string;
  spouse_fio: string;
  spouse_phone: string;
  extra_phone: string;
  extra_contact_fio: string;
  company_name: string;
  director_fio: string;
  director_phone: string;
  contact_person_fio: string;
  contact_person_phone: string;
  status: string;
}

export interface Loan {
  id: number;
  contract_no: string;
  member_name: string;
  member_id: number;
  amount: number;
  rate: number;
  term_months: number;
  schedule_type: string;
  start_date: string;
  end_date: string;
  monthly_payment: number;
  balance: number;
  status: string;
  org_id?: number;
  org_name?: string;
  org_short_name?: string;
  holiday_start?: string;
  holiday_months?: number;
  holiday_end?: string;
}

export interface ScheduleItem {
  payment_no: number;
  payment_date: string;
  payment_amount: number;
  principal_amount: number;
  interest_amount: number;
  balance_after: number;
  status?: string;
  paid_amount?: number;
  penalty_amount?: number;
}

export interface LoanDetail extends Loan {
  schedule: ScheduleItem[];
  payments: LoanPayment[];
}

export interface LoanApplication {
  id: number;
  application_no?: string;
  status: string;
  member_id?: number | null;
  member_name?: string;
  org_id?: number | null;
  org_short_name?: string;

  amount?: number | null;
  term_months?: number | null;
  loan_program?: string;
  collateral_types?: string;

  full_name?: string;
  birth_date?: string;
  birth_place?: string;
  passport_series_number?: string;
  passport_issue_date?: string;
  passport_issued_by?: string;
  passport_division_code?: string;
  registration_address?: string;
  mobile_phone?: string;
  email?: string;
  inn?: string;
  bank_account?: string;
  bik?: string;
  bank_name?: string;

  official_income?: number | null;
  income_confirmation?: string;
  employer_inn?: string;
  employer_name?: string;
  position?: string;
  additional_income_type?: string;
  additional_income?: number | null;
  additional_income_other?: string;

  current_loans_payments?: number | null;
  mandatory_expenses?: number | null;
  has_active_loans?: string;

  marital_status?: string;
  has_minor_children?: string;
  children_count?: number | null;
  spouse_name?: string;
  spouse_phone?: string;
  spouse_income?: number | null;
  has_maternal_capital?: string;

  real_estate_type?: string;
  cadastral_number?: string;
  property_address?: string;
  land_cadastral_number?: string;
  land_address?: string;

  car_brand?: string;
  car_model?: string;
  car_year?: number | null;
  car_market_value?: number | null;

  other_collateral_description?: string;

  contact_full_name?: string;
  contact_phone?: string;

  passport_files?: string;
  income_files?: string;
  collateral_files?: string;
  other_files?: string;
  guarantor_files?: string;

  curator_user_id?: number | null;
  agent_user_id?: number | null;
  agent_name?: string;
  commission_amount?: number | null;
  specialist_comment?: string;

  created_loan_id?: number | null;
  rejection_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SavingApplication {
  id: number;
  application_no?: string;
  status: string;
  member_id?: number | null;
  member_name?: string;
  org_id?: number | null;
  org_short_name?: string;

  amount?: number | null;
  term_months?: number | null;
  rate?: number | null;
  payout_type?: string;

  last_name?: string;
  first_name?: string;
  middle_name?: string;
  birth_date?: string;
  birth_place?: string;
  inn?: string;
  passport_series?: string;
  passport_number?: string;
  passport_dept_code?: string;
  passport_issue_date?: string;
  passport_issued_by?: string;
  registration_address?: string;
  phone?: string;
  email?: string;
  telegram?: string;
  bank_bik?: string;
  bank_account?: string;
  marital_status?: string;
  spouse_fio?: string;
  spouse_phone?: string;
  extra_phone?: string;
  extra_contact_fio?: string;

  curator_user_id?: number | null;
  curator_name?: string;
  agent_name?: string;
  is_curator_personal?: boolean;
  commission_amount?: number | null;
  specialist_comment?: string;

  created_saving_id?: number | null;
  rejection_reason?: string;
  created_at?: string;
  updated_at?: string;
}

export interface LoanPayment {
  id: number;
  payment_date: string;
  amount: number;
  principal_part: number;
  interest_part: number;
  penalty_part: number;
  payment_type: string;
  manual_distribution?: boolean;
  description?: string;
}

export interface CreateLoanData {
  contract_no: string;
  member_id: number;
  amount: number;
  rate: number;
  term_months: number;
  schedule_type: string;
  start_date: string;
  org_id?: number;
}

export interface OverpayOption {
  new_monthly: number;
  new_term: number;
  description: string;
}

export interface PaymentResult {
  success?: boolean;
  new_balance?: number;
  principal_part?: number;
  interest_part?: number;
  penalty_part?: number;
  schedule_recalculated?: boolean;
  new_monthly?: number;
  needs_choice?: boolean;
  overpay_amount?: number;
  current_payment?: number;
  total_amount?: number;
  options?: Record<string, OverpayOption>;
}

export interface Saving {
  id: number;
  contract_no: string;
  member_name: string;
  member_id: number;
  amount: number;
  rate: number;
  term_months: number;
  payout_type: string;
  start_date: string;
  end_date: string;
  accrued_interest: number;
  paid_interest: number;
  current_balance: number;
  status: string;
  min_balance_pct: number;
  org_id?: number;
  org_name?: string;
  org_short_name?: string;
  total_daily_accrued?: number;
  last_accrual_date?: string;
}

export interface SavingsScheduleItem {
  id: number;
  period_no: number;
  period_start: string;
  period_end: string;
  interest_amount: number;
  cumulative_interest: number;
  balance_after: number;
  rate?: number;
  status?: string;
  paid_date?: string;
  paid_amount?: number;
}

export interface DailyAccrual {
  id: number;
  accrual_date: string;
  balance: number;
  rate: number;
  daily_amount: number;
  created_at: string;
}

export interface RateChange {
  id: number;
  effective_date: string;
  old_rate: number;
  new_rate: number;
  reason: string;
  created_at: string;
}

export interface SavingDetail extends Saving {
  schedule: SavingsScheduleItem[];
  transactions: SavingTransaction[];
  daily_accruals: DailyAccrual[];
  rate_changes: RateChange[];
  total_daily_accrued: number;
  max_payout: number;
  accrual_first_date: string | null;
  accrual_last_date: string | null;
  accrual_days_count: number;
}

export interface SavingTransaction {
  id: number;
  transaction_date: string;
  amount: number;
  transaction_type: string;
  is_cash: boolean;
  description: string;
}

export interface CreateSavingData {
  contract_no: string;
  member_id: number;
  amount: number;
  rate: number;
  term_months: number;
  payout_type: string;
  start_date: string;
  min_balance_pct?: number;
  org_id?: number;
}

export interface ShareAccount {
  id: number;
  account_no: string;
  member_name: string;
  member_id: number;
  balance: number;
  total_in: number;
  total_out: number;
  status: string;
  created_at: string;
  updated_at: string;
  org_id?: number;
  org_name?: string;
  org_short_name?: string;
}

export interface ShareAccountDetail extends ShareAccount {
  transactions: ShareTransaction[];
}

export interface ShareTransaction {
  id: number;
  transaction_date: string;
  amount: number;
  transaction_type: string;
  description: string;
}

export interface ExportResult {
  file: string;
  content_type: string;
  filename: string;
}

export interface AuthSmsResult {
  success: boolean;
  has_password: boolean;
  sms_sent: boolean;
  debug_code?: string;
  error?: string;
}

export interface AuthVerifyResult {
  success: boolean;
  has_password: boolean;
  authenticated?: boolean;
  token?: string;
  setup_token?: string;
  user?: { name: string; member_id: number };
  error?: string;
}

export interface AuthLoginResult {
  success: boolean;
  token?: string;
  user?: { name: string; member_id: number };
  error?: string;
}

export interface InterestPayout {
  id: number;
  transaction_date: string;
  amount: number;
  description: string;
}

export interface SavingTransaction {
  id: number;
  transaction_date: string;
  amount: number;
  transaction_type: string;
  description: string;
}

export interface CabinetSavingDetail extends Saving {
  schedule: SavingsScheduleItem[];
  total_daily_accrued: number;
  interest_payouts: InterestPayout[];
  transactions: SavingTransaction[];
}

export interface StaffLoginResult {
  success: boolean;
  token?: string;
  user?: { name: string; role: string; login: string };
  error?: string;
}

export interface StaffUser {
  id: number;
  login: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  member_id: number | null;
  last_login: string | null;
  created_at: string;
}

export interface ReconciliationSchedulePayment {
  payment_id: number;
  fact_date: string;
  amount: number;
  fact_amount: number;
  principal: number;
  interest: number;
  penalty: number;
  pay_principal: number;
  pay_interest: number;
  pay_penalty: number;
  payment_type?: string;
}

export interface ReconciliationScheduleRow {
  id: number;
  payment_no: number;
  plan_date: string;
  plan_amount: number;
  plan_principal: number;
  plan_interest: number;
  plan_penalty: number;
  plan_total: number;
  paid_amount: number;
  status: string;
  paid_date: string | null;
  payments: ReconciliationSchedulePayment[];
}

export interface ReconciliationReport {
  loan: {
    id: number;
    contract_no: string;
    member_name: string;
    amount: number;
    rate: number;
    term_months: number;
    start_date: string;
    end_date: string;
    status: string;
    balance: number;
  };
  schedule: ReconciliationScheduleRow[];
  summary: {
    total_plan: number;
    total_paid: number;
    total_diff: number;
    total_overdue: number;
    periods_total: number;
    periods_paid: number;
    periods_partial: number;
    periods_overdue: number;
    periods_pending: number;
  };
}

export interface AuditLogEntry {
  id: number;
  user_id: number | null;
  user_name: string;
  user_role: string;
  action: string;
  entity: string;
  entity_id: number | null;
  entity_label: string;
  details: string;
  ip: string;
  created_at: string;
}

export interface AuditListResult {
  items: AuditLogEntry[];
  total: number;
}

export interface OrgSettings {
  name: string;
  inn: string;
  ogrn: string;
  director_fio: string;
  bank_name: string;
  bik: string;
  rs: string;
  phone: string;
  website: string;
  email: string;
  telegram: string;
  max_messenger: string;
}

export interface Organization {
  id: number;
  name: string;
  short_name: string;
  inn: string;
  ogrn: string;
  kpp: string;
  director_fio: string;
  director_position: string;
  legal_address: string;
  actual_address: string;
  bank_name: string;
  bik: string;
  rs: string;
  ks: string;
  phone: string;
  email: string;
  website: string;
  telegram: string;
  max_messenger: string;
  logo_url: string | null;
  signature_url: string | null;
  stamp_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CabinetOrgInfo {
  id: number;
  name: string;
  short_name: string;
  inn: string;
  kpp: string;
  bank_name: string;
  bik: string;
  rs: string;
  ks: string;
}

export interface CabinetOverview {
  info: { name: string; member_no: string; phone: string; email: string };
  loans: (Loan & { org_id?: number; org_name?: string; org_short_name?: string })[];
  savings: (Saving & { org_id?: number; org_name?: string; org_short_name?: string })[];
  shares: (ShareAccount & { org_id?: number; org_name?: string; org_short_name?: string })[];
  organizations?: Record<string, CabinetOrgInfo>;
}

export interface PushStats {
  total_subscriptions: number;
  unique_users: number;
  total_messages: number;
}

export interface PushSubscriber {
  user_id: number;
  name: string;
  phone: string;
  email: string;
  devices: number;
  last_sub: string;
}

export interface PushMessage {
  id: number;
  title: string;
  body: string;
  url: string;
  target: string;
  target_user_ids: number[] | null;
  sent_count: number;
  failed_count: number;
  status: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  sent_at: string | null;
}

export interface PushMessageLogEntry {
  id: number;
  message_id: number;
  subscription_id: number;
  user_id: number;
  user_name: string;
  status: string;
  error_text: string | null;
  created_at: string;
}

export interface PushClientMessage {
  id: number;
  title: string;
  body: string;
  url: string;
  sent_at: string;
  delivery_status: string;
}

export interface PushSettings {
  enabled: string;
  reminder_days: string;
  overdue_notify: string;
  remind_time: string;
  savings_enabled: string;
  savings_reminder_days: string;
  savings_remind_time: string;
  tpl_payment_today_title?: string;
  tpl_payment_today_body?: string;
  tpl_payment_tomorrow_title?: string;
  tpl_payment_tomorrow_body?: string;
  tpl_payment_days_title?: string;
  tpl_payment_days_body?: string;
  tpl_overdue_title?: string;
  tpl_overdue_body?: string;
  tpl_savings_today_title?: string;
  tpl_savings_today_body?: string;
  tpl_savings_tomorrow_title?: string;
  tpl_savings_tomorrow_body?: string;
  tpl_savings_days_title?: string;
  tpl_savings_days_body?: string;
  [key: string]: string | undefined;
}

export interface NotificationChannel {
  id: number;
  channel: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  updated_at: string;
}

export interface TelegramSubscriber {
  id: number;
  user_id: number;
  name: string;
  chat_id: number;
  username: string;
  first_name: string;
  subscribed_at: string;
  active: boolean;
}

export interface NotificationHistoryItem {
  id: number;
  channel: string;
  title: string;
  body: string;
  url: string | null;
  target: string;
  target_user_ids: number[] | null;
  sent_count: number;
  failed_count: number;
  status: string;
  created_by: number;
  created_by_name: string;
  created_at: string;
  sent_at: string | null;
  error_text: string | null;
}

export interface NotificationLogEntry {
  id: number;
  notification_id: number;
  user_id: number;
  user_name: string;
  channel: string;
  status: string;
  error_text: string | null;
  created_at: string;
}

export interface NotificationStats {
  telegram_subscribers: number;
  max_subscribers: number;
  email_users: number;
  telegram_messages: number;
  max_messages: number;
  email_messages: number;
}

export interface ChatConversation {
  id: number;
  subject: string;
  status: string;
  ai_enabled: boolean;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
}

export interface ChatConversationStaff extends ChatConversation {
  member_id: number;
  member_name: string;
  member_no: string;
  assigned_staff_id: number | null;
}

export interface ChatMessage {
  id: number;
  sender_type: "client" | "staff" | "ai";
  sender_id: number | null;
  body: string;
  read_at: string | null;
  created_at: string;
  sender_name: string;
}

export interface ChatSendResult {
  id: number;
  created_at: string;
  ai_reply: { id: number; body: string; created_at: string } | null;
}

const SBER_URL = (funcUrls as Record<string, string>)["sber-statements"] || (funcUrls as Record<string, string>)["cron-sber"] || "";

function sberRequest<T>(method: string, params?: Params, body?: unknown): Promise<T> {
  if (!SBER_URL) return Promise.reject(new Error("Функция sber-statements ещё не настроена"));
  const url = new URL(SBER_URL);
  if (params) {
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined) url.searchParams.set(key, String(val));
    });
  }
  const hdrs: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStaffToken();
  if (token) hdrs["X-Auth-Token"] = token;
  const options: RequestInit = { method, headers: hdrs };
  if (body) options.body = JSON.stringify(body);
  return fetch(url.toString(), options).then(async (res) => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ошибка сервера");
    return data;
  });
}

export const bankApi = {
  connections: () => sberRequest<BankConnection[]>("GET", { action: "connections" }),
  saveConnection: (data: { org_id: number; account_number: string }) =>
    sberRequest<{ success: boolean }>("POST", undefined, { action: "save_connection", ...data }),
  toggleConnection: (connectionId: number, isActive: boolean) =>
    sberRequest<{ success: boolean }>("POST", undefined, { action: "toggle_connection", connection_id: connectionId, is_active: isActive }),
  fetchFromEmail: (date?: string) =>
    sberRequest<BankFetchEmailResult>("POST", undefined, { action: "fetch", date }),
  status: () =>
    sberRequest<BankImapStatus>("GET", { action: "status" }),
  statements: (connectionId?: number, limit?: number, offset?: number) =>
    sberRequest<{ items: BankStatement[]; total: number }>("GET", { action: "statements", connection_id: connectionId, limit, offset }),
  transactions: (statementId?: number, matchStatus?: string) =>
    sberRequest<BankTransaction[]>("GET", { action: "transactions", statement_id: statementId, match_status: matchStatus }),
  syncLog: (limit?: number) =>
    sberRequest<BankSyncLogEntry[]>("GET", { action: "sync_log", limit: limit || 20 }),
};

export interface BankConnection {
  id: number;
  org_id: number;
  org_name: string;
  account_number: string;
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string;
  last_sync_error: string;
  token_expires_at: string | null;
  created_at: string;
  has_token: boolean;
}

export interface BankStatement {
  id: number;
  connection_id: number;
  org_name: string;
  statement_date: string;
  opening_balance: number;
  closing_balance: number;
  debit_turnover: number;
  credit_turnover: number;
  transaction_count: number;
  matched_count: number;
  unmatched_count: number;
  status: string;
  created_at: string;
}

export interface BankTransaction {
  id: number;
  statement_id: number;
  sber_uuid: string;
  operation_date: string;
  document_date: string;
  document_number: string;
  amount: number;
  direction: string;
  payment_purpose: string;
  payer_name: string;
  payer_inn: string;
  payee_name: string;
  payee_inn: string;
  matched_contract_no: string | null;
  matched_entity: string | null;
  matched_entity_id: number | null;
  match_status: string;
  payment_id: number | null;
  created_at: string;
}

export interface BankFetchResult {
  connection_id?: number;
  org_id?: number;
  statement_id?: number;
  total?: number;
  matched?: number;
  unmatched?: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

export interface BankFetchEmailResult {
  emails_found: number;
  results: BankFetchResult[];
  errors: string[];
  error?: string;
  message?: string;
}

export interface BankSyncLogEntry {
  id: number;
  started_at: string;
  finished_at: string | null;
  source: string;
  status: string;
  emails_found: number;
  statements_loaded: number;
  transactions_total: number;
  transactions_matched: number;
  errors: string | null;
}

export interface BankImapStatus {
  imap_host: string;
  imap_user: string;
  imap_configured: boolean;
  connections: {
    id: number;
    account_number: string;
    last_sync_at: string | null;
    last_sync_status: string;
    last_sync_error: string;
  }[];
}

export default api;