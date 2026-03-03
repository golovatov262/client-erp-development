import funcUrls from "../../backend/func2url.json";

export const toNum = (v: string | number): number => typeof v === "number" ? v : Number(String(v).replace(",", "."));

const API_URL = funcUrls.api;

type Params = Record<string, string | number | undefined>;

function getStaffToken(): string {
  return localStorage.getItem("staff_token") || "";
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

  const res = await fetch(url.toString(), options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Ошибка сервера");
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
    updatePayment: (data: { payment_id: number; payment_date?: string; amount?: number; principal_part?: number; interest_part?: number; penalty_part?: number }) =>
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

  export: {
    download: async (type: "loan" | "saving" | "share" | "saving_transactions", id: number, format: "xlsx" | "pdf") => {
      const res = await request<ExportResult>("GET", { entity: "export", type, id, format });
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
      request<{ success: boolean; created: number; password: string }>("POST", undefined, { entity: "users", action: "bulk_create_clients", password }),
  },

  audit: {
    list: (params?: { limit?: number; offset?: number; filter_entity?: string; filter_action?: string }) =>
      request<AuditListResult>("GET", { entity: "audit", ...params }),
  },

  orgSettings: {
    get: () => request<OrgSettings>("GET", { entity: "org_settings" }),
    save: (settings: Partial<OrgSettings>) => request<{ success: boolean }>("POST", undefined, { entity: "org_settings", settings }),
  },

  organizations: {
    list: () => request<Organization[]>("GET", { entity: "organizations" }),
    get: (id: number) => request<Organization>("GET", { entity: "organizations", id }),
    create: (data: Partial<Organization>) => request<{ id: number }>("POST", undefined, { entity: "organizations", action: "create", ...data }),
    update: (data: Partial<Organization> & { id: number }) => request<{ success: boolean }>("POST", undefined, { entity: "organizations", action: "update", ...data }),
    uploadLogo: (orgId: number, logoBase64: string, contentType?: string) => request<{ success: boolean; logo_url: string }>("POST", undefined, { entity: "organizations", action: "upload_logo", id: orgId, logo: logoBase64, content_type: contentType }),
    delete: (id: number) => request<{ success: boolean }>("POST", undefined, { entity: "organizations", action: "delete", id }),
  },
};

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

export interface LoanPayment {
  id: number;
  payment_date: string;
  amount: number;
  principal_part: number;
  interest_part: number;
  penalty_part: number;
  payment_type: string;
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
  whatsapp: string;
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
  whatsapp: string;
  logo_url: string | null;
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

export default api;