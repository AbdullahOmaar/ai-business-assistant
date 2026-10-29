import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

export interface ReleaseInfo { version: string; commit: string; environment: string; }

export interface Business {
  id: string;
  name: string;
  currency_code: string;
  locale: string;
  timezone: string;
  role?: string;
}
export interface Customer { id: string; name: string; email?: string | null; phone?: string | null; }
export interface Product { id: string; name: string; sku?: string | null; unit_price: string; currency_code?: string; is_stock_tracked: boolean; stock_quantity?: string | null; }
export interface Invoice { id: string; invoice_number: string; status: string; currency_code: string; total: string; subtotal?: string; discount_total?: string; tax_total?: string; customer_id?: string | null; allocated_payments?: string; outstanding_amount?: string; }
export interface InvoiceDetail extends Invoice {
  lines: Array<{ id: string; product_id: string | null; description: string; quantity: string; unit_price: string; line_total: string }>;
}
export interface PaymentAllocation { invoice_id: string; amount: string; }
export interface CreditNote {
  id: string; business_id: string; sales_return_id: string; invoice_id: string; customer_id: string;
  credit_note_number: string; currency_code: string; total: string; created_by_subject: string; created_at: string;
}
export interface SalesReturn {
  id: string; business_id: string; invoice_id: string; status: 'draft' | 'approved' | 'rejected';
  reason?: string | null; total: string; created_at: string;
}
export interface SalesReturnPage { items: SalesReturn[]; limit: number; offset: number; }
export interface CreditNotePage { items: CreditNote[]; limit: number; offset: number; }
export interface Payment { id: string; amount: string; currency_code: string; received_at: string; customer_id?: string | null; method?: string | null; reference?: string | null; allocations: PaymentAllocation[]; }
export interface Expense { id: string; category: string; description: string; amount: string; currency_code: string; incurred_at: string; vendor_name?: string | null; reference?: string | null; created_at?: string | null; }
export interface EmployeeRecord {
  id: string; business_id: string; employee_code: string | null; name: string; email: string | null;
  phone: string | null; department: string | null; job_title: string | null; monthly_salary: string;
  is_active: boolean; created_at: string | null; updated_at: string | null;
}
export interface EmployeePayrollRecord {
  id: string; business_id: string; employee_id: string; employee_name: string; period: string;
  base_salary: string; allowances: string; bonuses: string; deductions: string; net_pay: string;
  status: 'draft' | 'approved' | 'paid'; expense_id: string | null; approved_by_subject: string | null;
  approved_at: string | null; paid_by_subject: string | null; paid_at: string | null; created_at: string | null;
}
export interface MoneyTotal { currency_code: string; count?: number; total: string; }
export interface ProfitLossRow { currency_code: string; revenue: string; revenue_invoice_count: number; approved_return_total: string; approved_return_count: number; expenses: string; expense_count: number; operating_result_before_cost_of_goods: string; }
export interface ProfitLossReport { period: { type: string; start_date: string | null; end_date: string | null; timezone: string }; revenue_basis: string; currencies: ProfitLossRow[]; limitations: string[]; }

export interface ReceivablesAgingBucket { bucket: 'not_due' | '1_30_days' | '31_60_days' | '61_90_days' | 'over_90_days' | 'no_due_date'; outstanding_amount: string; }
export interface ReceivablesAgingCurrencySummary { currency_code: string; buckets: ReceivablesAgingBucket[]; total_outstanding: string; }
export interface ReceivablesAgingInvoice { invoice_id: string; invoice_number: string; customer_id: string | null; currency_code: string; due_date: string | null; invoice_total: string; allocated_payments: string; outstanding_amount: string; aging_bucket: ReceivablesAgingBucket['bucket']; days_overdue: number | null; customer_link_missing: boolean; }
export interface ReceivablesAgingWarning { invoice_id: string; invoice_number: string; type: 'payment_currency_mismatch' | 'allocations_exceed_invoice_total'; invoice_currency?: string; mismatched_allocations_amount?: string; invoice_total?: string; allocated_payments?: string; excess_allocated?: string; }
export interface AuditEvent {
  id: string; business_id: string; actor_subject: string | null; action: string;
  target_type: string; target_id: string | null; change_summary: string | null; created_at: string | null;
}
export interface AuditEventPage { items: AuditEvent[]; total: number; limit: number; offset: number; }
export interface ReceivablesAgingReport { as_of_date: string; source: string; currency_policy: string; invoice_count: number; by_currency: ReceivablesAgingCurrencySummary[]; invoices: ReceivablesAgingInvoice[]; data_quality_warnings: ReceivablesAgingWarning[]; limitations: string[]; }
export interface CustomerStatementEvent { occurred_at: string; event_type: string; source_id: string; reference: string | null; invoice_id?: string; currency_code: string; debit: string; credit: string; affects_balance: boolean; balance: string; }
export interface CustomerStatement { customer: { id: string; name: string }; items: CustomerStatementEvent[]; total: number; limit: number; offset: number; balances_by_currency: Record<string, string>; limitations: string[]; }

export interface TaxSummaryReport { period: { start_date: string | null; end_date: string | null }; source: string; currencies: Array<{ currency_code: string; tax_total: string; invoice_count: number }>; limitations: string[]; }
export interface PlatformAdminOverview {
  generated_at: string;
  businesses: { total: number; active: number; inactive: number };
  users: { distinct_subjects: number; memberships: number };
  invoices: { count: number; by_currency_and_status: Array<{ currency_code: string; status: string; count: number; total: string }> };
  payments: { count: number; by_currency: Array<{ currency_code: string; count: number; total: string }> };
  audit_events: { count: number };
  limitations: string[];
}
export interface PlatformSystemStatus {
  status: 'healthy' | 'degraded';
  checked_at: string;
  release: { version: string; commit: string; environment: string };
  dependencies: { database: 'healthy' | 'unavailable' | 'unconfigured'; identity_verifier: 'configured' | 'unconfigured' };
  limitations: string[];
}
export interface PlatformBusiness {
  id: string; name: string; currency_code: string; locale: string; timezone: string;
  contact_email?: string | null; phone?: string | null; is_active: boolean;
  created_at: string | null; updated_at: string | null; member_count: number;
}
export interface PlatformMembership {
  id: string; user_subject: string; role: 'owner' | 'staff'; created_at: string | null;
}
export interface PlatformBusinessPage {
  items: PlatformBusiness[]; total: number; limit: number; offset: number;
  sort_by: 'created_at' | 'name' | 'members'; sort_order: 'asc' | 'desc';
}
export interface PlatformBusinessDetails {
  business: PlatformBusiness;
  memberships: PlatformMembership[];
  limitations: string[];
}
export interface PlatformAuditEvent {
  id: string; business_id: string; business_name: string; actor_subject: string | null;
  action: string; target_type: string; target_id: string | null;
  change_summary: string | null; created_at: string | null;
}
export interface PlatformAuditEventPage { items: PlatformAuditEvent[]; total: number; limit: number; offset: number; }

export type PlatformRole = 'platform_viewer' | 'workspace_operator' | 'user_manager';
export interface PlatformAdminAccess {
  is_platform_admin: boolean;
  is_platform_super_admin: boolean;
  subject: string;
  roles: string[];
  permissions: string[];
}
export interface PlatformAdminUser {
  uid: string; subject: string; display_name: string; email: string;
  email_verified: boolean; disabled: boolean; created_at: string | null;
  last_sign_in_at: string | null; is_platform_super_admin: boolean; roles: string[];
  memberships: Array<{ business_id: string; business_name: string; role: 'owner' | 'staff' }>;
}
export interface PlatformAdminUsersPage {
  items: PlatformAdminUser[]; limit: number; next_page_token: string | null;
  has_more: boolean; search_mode: 'exact_email_or_uid' | 'cursor_pagination'; limitations: string[];
}
export interface PlatformRoleAuditEvent {
  id: string; actor_subject: string; action: string; target_subject: string;
  role: PlatformRole; reason: string; created_at: string | null;
}
export interface PlatformRoleAuditEventPage {
  items: PlatformRoleAuditEvent[]; total: number; limit: number; offset: number;
}

export interface DataIntegrityInvoice { invoice_id: string; invoice_number: string; status: string; total: string; currency_code: string; created_at: string | null; }
export interface DataIntegrityAllocation { allocation_id: string; payment_id: string; payment_reference: string | null; payment_customer_id: string | null; payment_currency: string; invoice_id: string; invoice_number: string; invoice_customer_id: string | null; invoice_currency: string; allocated_amount: string; }
export interface OperationalHealth { status: string; checked_at: string; database_connected: boolean; migration_table_available: boolean; migration_revision: string | null; ai_configured: boolean; notification_delivery_configured: boolean; recurring_invoice_worker_configured: boolean; }

export interface NotificationRecord { id: string; kind: string; title: string; body: string; status: string; deduplication_key: string; scheduled_at: string | null; created_at: string | null; }

export interface Supplier { id: string; name: string; email?: string | null; phone?: string | null; address?: string | null; is_active: boolean; }

export interface PurchaseOrderLine { id: string; product_id: string; quantity: string; unit_cost: string; received_quantity: string; remaining_quantity: string; }

export interface PurchaseOrder { id: string; supplier_id: string; order_number: string; status: string; currency_code: string; total: string; created_at: string | null; lines: PurchaseOrderLine[]; }

export interface RecurringInvoiceSchedule { id: string; customer_id: string | null; interval_days: number; timezone: string; next_run_at: string; is_active: boolean; created_at: string | null; }

export interface DataIntegrityReport {
  generated_at: string; read_only: boolean;
  unlinked_issued_invoices: { total: number; items: DataIntegrityInvoice[] };
  currency_mismatched_allocations: { total: number; items: DataIntegrityAllocation[] };
  customer_mismatched_allocations: { total: number; items: DataIntegrityAllocation[] };
  limit: number; offset: number; warning: string;
}

export interface Dashboard {
  period: { start_date: string | null; end_date: string | null; timezone: string };
  invoiced_sales: MoneyTotal[];
  collected_payments: MoneyTotal[];
  expenses: MoneyTotal[];
  outstanding_balances: MoneyTotal[];
}
// `mode` is returned by the API so the UI can disclose the free, non-generative fallback.
export interface ChatReply { answer: string; sources: Array<{ type: string; id: string; date: string | null; invoice_number?: string; category?: string }>; model?: string; grounding?: string; mode?: 'local-fallback' | 'generative'; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private readonly auth: AuthService) {}

  async releaseInfo(): Promise<ReleaseInfo> {
    const config = await this.auth.getRuntimeConfig();
    const base = (config.apiBaseUrl || '').trim().replace(/\/$/, '');
    if (!base || base.includes('YOUR-BACKEND')) throw new Error('The backend URL is not configured.');
    const response = await fetch(base + '/version', { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Backend version endpoint returned ${response.status}.`);
    return await response.json() as ReleaseInfo;
  }

  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const config = await this.auth.getRuntimeConfig();
    const base = (config.apiBaseUrl || '').trim().replace(/\/$/, '');
    if (!base || base.includes('YOUR-BACKEND')) {
      throw new Error('The backend URL is not configured in runtime-config.json.');
    }
    const token = await this.auth.idToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    try {
      let response: Response;
      try {
        response = await fetch(base + path, {
          method,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal
        });
      } catch (error) {
        const timedOut = (error as { name?: string } | null)?.name === 'AbortError';
        const detail = error instanceof Error ? error.message : '';
        throw new Error(timedOut
          ? 'API_CONNECTION_FAILED: The request timed out. Check the connection and retry.'
          : `API_CONNECTION_FAILED: ${detail}`);
      }
      if (!response.ok) {
        let message = `Request failed (${response.status}).`;
        try {
          const payload = await response.json();
          if (typeof payload.detail === 'string') message = payload.detail;
        } catch { /* response body may be empty or unavailable */ }
        throw new Error(message);
      }
      if (response.status === 204) return undefined as T;
      try {
        // Keep the abort timer active while the response body is being read too.
        return await response.json() as T;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === 'AbortError') {
          throw new Error('API_CONNECTION_FAILED: The response timed out. Check the connection and retry.');
        }
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async requestBlob(path: string): Promise<Response> {
    const config = await this.auth.getRuntimeConfig();
    const configuredBase = (config.apiBaseUrl || '').trim();
    const base = configuredBase.endsWith('/') ? configuredBase.slice(0, -1) : configuredBase;
    if (!base || base.includes('YOUR-BACKEND')) {
      throw new Error('The backend URL is not configured in runtime-config.json.');
    }
    const token = await this.auth.idToken();
    let response: Response;
    try {
      response = await fetch(base + path, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'text/csv' },
        cache: 'no-store'
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      throw new Error(`API_CONNECTION_FAILED: ${detail}`);
    }
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try {
        const payload = await response.json();
        if (typeof payload.detail === 'string') message = payload.detail;
      } catch { /* response body may be empty */ }
      throw new Error(message);
    }
    return response;
  }

  private async requestCsv<T>(path: string, csvText: string): Promise<T> {
    const config = await this.auth.getRuntimeConfig();
    const base = (config.apiBaseUrl || '').trim().replace(/\/$/, '');
    if (!base || base.includes('YOUR-BACKEND')) throw new Error('The backend URL is not configured in runtime-config.json.');
    const token = await this.auth.idToken();
    let response: Response;
    try {
      response = await fetch(base + path, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'text/csv', 'Accept': 'application/json' },
        body: csvText
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : '';
      throw new Error(`API_CONNECTION_FAILED: ${detail}`);
    }
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try {
        const payload = await response.json();
        if (typeof payload.detail === 'string') message = payload.detail;
        else if (payload.detail?.message) message = payload.detail.message;
      } catch { /* response body may be empty */ }
      throw new Error(message);
    }
    return await response.json() as T;
  }

  previewProductCsv(businessId: string, csvText: string): Promise<{
    entity_type: string; row_count: number; valid: boolean;
    errors: Array<{ row: number; field: string; code: string; max_length?: number; first_row?: number }>;
    write_performed: boolean;
  }> {
    return this.requestCsv(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/imports/products.csv/preview`, csvText
    );
  }

  importProductCsv(businessId: string, csvText: string): Promise<{
    id: string; entity_type: string; status: string; row_count: number; created_at: string;
  }> {
    return this.requestCsv(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/imports/products.csv`, csvText
    );
  }


  previewCustomerCsv(businessId: string, csvText: string): Promise<{
    entity_type: string; row_count: number; valid: boolean;
    errors: Array<{ row: number; field: string; code: string; max_length?: number; first_row?: number }>;
    write_performed: boolean;
  }> {
    return this.requestCsv(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/imports/customers.csv/preview`, csvText
    );
  }

  importCustomerCsv(businessId: string, csvText: string): Promise<{
    id: string; entity_type: string; status: string; row_count: number; created_at: string;
  }> {
    return this.requestCsv(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/imports/customers.csv`, csvText
    );
  }

  platformAdminAccess(): Promise<PlatformAdminAccess> {
    return this.request<PlatformAdminAccess>('/api/v1/platform-admin/access');
  }

  platformAdminUsers(filters: { q?: string; page_token?: string; limit?: number } = {}): Promise<PlatformAdminUsersPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return this.request<PlatformAdminUsersPage>(`/api/v1/platform-admin/users?${params.toString()}`);
  }

  platformAdminChangeUserRole(uid: string, body: { role: PlatformRole; active: boolean; reason: string }): Promise<{
    changed: boolean; active: boolean; role: PlatformRole; message: string;
  }> {
    return this.request(
      `/api/v1/platform-admin/users/${encodeURIComponent(uid)}/roles`, 'POST', body
    );
  }

  platformRoleAuditEvents(filters: { limit?: number; offset?: number } = {}): Promise<PlatformRoleAuditEventPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return this.request<PlatformRoleAuditEventPage>(
      `/api/v1/platform-admin/role-audit-events?${params.toString()}`
    );
  }

  platformAdminOverview(): Promise<PlatformAdminOverview> {
    return this.request<PlatformAdminOverview>('/api/v1/platform-admin/overview');
  }

  platformAdminSystemStatus(): Promise<PlatformSystemStatus> {
    return this.request<PlatformSystemStatus>('/api/v1/platform-admin/system-status');
  }

  platformBusinesses(filters: {
    q?: string; status?: 'all' | 'active' | 'inactive';
    sort_by?: 'created_at' | 'name' | 'members'; sort_order?: 'asc' | 'desc';
    limit?: number; offset?: number;
  } = {}): Promise<PlatformBusinessPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return this.request<PlatformBusinessPage>(`/api/v1/platform-admin/businesses?${params.toString()}`);
  }

  platformBusinessDetails(businessId: string): Promise<PlatformBusinessDetails> {
    return this.request<PlatformBusinessDetails>(
      `/api/v1/platform-admin/businesses/${encodeURIComponent(businessId)}`
    );
  }

  platformBusinessStatus(businessId: string, body: { is_active: boolean; reason: string }): Promise<{
    business: PlatformBusiness; changed: boolean; message: string;
  }> {
    return this.request<{ business: PlatformBusiness; changed: boolean; message: string }>(
      `/api/v1/platform-admin/businesses/${encodeURIComponent(businessId)}/status`, 'PATCH', body
    );
  }

  platformAuditEvents(filters: {
    action?: string; actor_subject?: string; business_id?: string; created_after?: string; created_before?: string;
    limit?: number; offset?: number;
  } = {}): Promise<PlatformAuditEventPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return this.request<PlatformAuditEventPage>(`/api/v1/platform-admin/audit-events?${params.toString()}`);
  }

  platformAuditEventsCsv(filters: {
    action?: string; actor_subject?: string; business_id?: string; created_after?: string; created_before?: string;
    limit?: number;
  } = {}): Promise<{ blob: Blob; truncated: boolean; rowCount: number }> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return this.requestBlob(`/api/v1/platform-admin/audit-events/export.csv?${params.toString()}`).then(async response => ({
      blob: await response.blob(),
      truncated: response.headers.get('X-Export-Truncated') === 'true',
      rowCount: Number(response.headers.get('X-Export-Row-Count') || 0)
    }));
  }

  listBusinesses(): Promise<Business[]> {
    return this.request<Business[]>('/api/v1/businesses');
  }
  createBusiness(body: { name: string; currency_code: string }): Promise<Business> {
    return this.request<Business>('/api/v1/businesses', 'POST', body);
  }
  dashboard(businessId: string): Promise<Dashboard> {
    // The backend applies the default 30-day window using the business's timezone.
    return this.request<Dashboard>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/dashboard`
    );
  }

  receivablesAging(businessId: string, asOfDate?: string): Promise<ReceivablesAgingReport> {
    const params = new URLSearchParams();
    if (asOfDate) params.set('as_of', asOfDate);
    const query = params.toString();
    return this.request<ReceivablesAgingReport>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/reports/receivables-aging${query ? `?${query}` : ''}`
    );
  }
  profitLoss(businessId: string, period: '30d' | 'month' | 'all' | 'custom', startDate?: string, endDate?: string): Promise<ProfitLossReport> {
    const params = new URLSearchParams({ period });
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    return this.request<ProfitLossReport>(`/api/v1/businesses/${encodeURIComponent(businessId)}/profit-loss?${params.toString()}`);
  }
  customers(businessId: string): Promise<Customer[]> {
    return this.request<Customer[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/customers?limit=100`);
  }
  createCustomer(businessId: string, body: { name: string; email?: string; phone?: string }): Promise<Customer> {
    return this.request<Customer>(`/api/v1/businesses/${encodeURIComponent(businessId)}/customers`, 'POST', body);
  }
  products(businessId: string): Promise<Product[]> {
    return this.request<Product[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/products?limit=100`);
  }
  createProduct(businessId: string, body: { name: string; unit_price: string; is_stock_tracked: boolean; opening_quantity?: string }): Promise<Product> {
    return this.request<Product>(`/api/v1/businesses/${encodeURIComponent(businessId)}/products`, 'POST', body);
  }
  operationsHealth(businessId: string): Promise<OperationalHealth> {
    return this.request<OperationalHealth>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/operations/health');
  }

  expenses(businessId: string): Promise<Expense[]> {
    return this.request<Expense[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/expenses?limit=100&offset=0`);
  }
  employees(businessId: string): Promise<EmployeeRecord[]> {
    return this.request<EmployeeRecord[]>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/employees?limit=200&offset=0`
    );
  }
  createEmployee(businessId: string, body: {
    name: string; monthly_salary: string; employee_code?: string; email?: string;
    phone?: string; department?: string; job_title?: string;
  }): Promise<EmployeeRecord> {
    return this.request<EmployeeRecord>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/employees`, 'POST', body
    );
  }
  updateEmployee(businessId: string, employeeId: string, body: {
    name?: string; monthly_salary?: string; employee_code?: string | null; email?: string | null;
    phone?: string | null; department?: string | null; job_title?: string | null; is_active?: boolean;
  }): Promise<EmployeeRecord> {
    return this.request<EmployeeRecord>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/employees/${encodeURIComponent(employeeId)}`, 'PATCH', body
    );
  }
  payroll(businessId: string, period?: string): Promise<EmployeePayrollRecord[]> {
    const params = new URLSearchParams({ limit: '200', offset: '0' });
    if (period) params.set('period', period);
    return this.request<EmployeePayrollRecord[]>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/payroll?${params.toString()}`
    );
  }
  createPayroll(businessId: string, employeeId: string, body: {
    period: string; allowances?: string; bonuses?: string; deductions?: string;
  }): Promise<EmployeePayrollRecord> {
    return this.request<EmployeePayrollRecord>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/employees/${encodeURIComponent(employeeId)}/payroll`, 'POST', body
    );
  }
  updatePayroll(businessId: string, payrollId: string, body: {
    allowances?: string; bonuses?: string; deductions?: string;
  }): Promise<EmployeePayrollRecord> {
    return this.request<EmployeePayrollRecord>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/payroll/${encodeURIComponent(payrollId)}`, 'PATCH', body
    );
  }
  approvePayroll(businessId: string, payrollId: string): Promise<EmployeePayrollRecord> {
    return this.request<EmployeePayrollRecord>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/payroll/${encodeURIComponent(payrollId)}/approve`, 'POST', {}
    );
  }
  payPayroll(businessId: string, payrollId: string): Promise<EmployeePayrollRecord> {
    return this.request<EmployeePayrollRecord>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/payroll/${encodeURIComponent(payrollId)}/pay`, 'POST', {}
    );
  }
  createExpense(businessId: string, body: {
    category: string; description: string; amount: string; currency_code: string;
    incurred_at: string; vendor_name?: string; reference?: string;
  }): Promise<Expense> {
    return this.request<Expense>(`/api/v1/businesses/${encodeURIComponent(businessId)}/expenses`, 'POST', body);
  }
  payments(businessId: string): Promise<Payment[]> {
    return this.request<Payment[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/payments?limit=100`);
  }
  createPayment(businessId: string, body: {
    amount: string; currency_code: string; idempotency_key: string; customer_id: string;
    allocations?: Array<{ invoice_id: string; amount: string }>;
    method?: string; reference?: string;
  }): Promise<Payment> {
    return this.request<Payment>(`/api/v1/businesses/${encodeURIComponent(businessId)}/payments`, 'POST', body);
  }
  invoices(businessId: string): Promise<Invoice[]> {
    return this.request<Invoice[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/invoices?limit=100`);
  }
  createInvoice(businessId: string, body: {
    invoice_number: string; currency_code: string; customer_id?: string; lines: Array<{ product_id: string; quantity: string }>;
    discount_rate?: number | string; tax_rate?: number | string;
  }): Promise<Invoice> {
    return this.request<Invoice>(`/api/v1/businesses/${encodeURIComponent(businessId)}/invoices`, 'POST', body);
  }
  createAndIssueInvoice(businessId: string, body: {
    invoice_number: string; currency_code: string; customer_id: string;
    lines: Array<{ product_id: string; quantity: string }>;
  }): Promise<Invoice> {
    return this.request<Invoice>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/invoices/issue`, 'POST', body
    );
  }
  issueInvoice(businessId: string, invoiceId: string): Promise<Invoice> {
    return this.request<Invoice>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/invoices/${encodeURIComponent(invoiceId)}/issue`, 'POST', {}
    );
  }
  invoiceDetail(businessId: string, invoiceId: string): Promise<InvoiceDetail> {
    return this.request<InvoiceDetail>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/invoices/${encodeURIComponent(invoiceId)}`
    );
  }
  salesReturns(businessId: string, filters: { limit?: number; offset?: number; status?: 'draft' | 'approved' | 'rejected' } = {}): Promise<SalesReturnPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const query = params.toString();
    return this.request<SalesReturnPage>(`/api/v1/businesses/${encodeURIComponent(businessId)}/sales-returns${query ? '?' + query : ''}`);
  }
  creditNotes(businessId: string, filters: { limit?: number; offset?: number; customer_id?: string } = {}): Promise<CreditNotePage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const query = params.toString();
    return this.request<CreditNotePage>(`/api/v1/businesses/${encodeURIComponent(businessId)}/credit-notes${query ? '?' + query : ''}`);
  }
  issueCreditNoteForReturn(businessId: string, returnId: string): Promise<CreditNote> {
    return this.request<CreditNote>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/sales-returns/${encodeURIComponent(returnId)}/credit-note`, 'POST', {}
    );
  }
  updateDraftInvoice(businessId: string, invoiceId: string, body: {
    invoice_number: string; currency_code: string; customer_id?: string; lines: Array<{ product_id: string; quantity: string }>;
    discount_rate?: number | string; tax_rate?: number | string;
  }): Promise<Invoice> {
    return this.request<Invoice>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/invoices/${encodeURIComponent(invoiceId)}`, 'PATCH', body
    );
  }
  voidInvoice(businessId: string, invoiceId: string, reason: string): Promise<Invoice> {
    return this.request<Invoice>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/invoices/${encodeURIComponent(invoiceId)}/void`,
      'POST', { reason }
    );
  }
  auditEvents(businessId: string, filters: { limit?: number; offset?: number; action?: string; target_type?: string }): Promise<AuditEventPage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return this.request<AuditEventPage>(`/api/v1/businesses/${encodeURIComponent(businessId)}/audit-events?${params.toString()}`);
  }

  customerStatement(businessId: string, customerId: string, offset = 0): Promise<CustomerStatement> {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    return this.request<CustomerStatement>(`/api/v1/businesses/${encodeURIComponent(businessId)}/customers/${encodeURIComponent(customerId)}/statement?${params.toString()}`);
  }

  taxSummary(businessId: string, startDate?: string, endDate?: string): Promise<TaxSummaryReport> {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const query = params.toString();
    return this.request<TaxSummaryReport>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/reports/tax-summary' + (query ? '?' + query : ''));
  }

  notifications(businessId: string): Promise<NotificationRecord[]> {
    return this.request<NotificationRecord[]>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/notifications?limit=100');
  }
  createNotification(businessId: string, body: { kind: string; title: string; body: string; deduplication_key: string; scheduled_at?: string }): Promise<NotificationRecord> {
    return this.request<NotificationRecord>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/notifications', 'POST', body);
  }

  suppliers(businessId: string): Promise<Supplier[]> {
    return this.request<Supplier[]>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/suppliers?limit=100');
  }
  createSupplier(businessId: string, body: { name: string; email?: string; phone?: string; address?: string }): Promise<Supplier> {
    return this.request<Supplier>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/suppliers', 'POST', body);
  }
  purchaseOrders(businessId: string): Promise<PurchaseOrder[]> {
    return this.request<PurchaseOrder[]>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/purchase-orders?limit=100');
  }
  createPurchaseOrder(businessId: string, body: { supplier_id: string; order_number: string; currency_code: string; lines: Array<{ product_id: string; quantity: string; unit_cost: string }> }): Promise<PurchaseOrder> {
    return this.request<PurchaseOrder>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/purchase-orders', 'POST', body);
  }
  receivePurchaseOrder(businessId: string, orderId: string, lines: Array<{ line_id: string; quantity: string }>): Promise<PurchaseOrder> {
    return this.request<PurchaseOrder>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/purchase-orders/' + encodeURIComponent(orderId) + '/receive', 'POST', { lines });
  }
  recurringSchedules(businessId: string): Promise<RecurringInvoiceSchedule[]> {
    return this.request<RecurringInvoiceSchedule[]>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/recurring-invoices?limit=100');
  }
  createRecurringSchedule(businessId: string, body: { customer_id?: string | null; interval_days: number; timezone: string; next_run_at: string }): Promise<RecurringInvoiceSchedule> {
    return this.request<RecurringInvoiceSchedule>('/api/v1/businesses/' + encodeURIComponent(businessId) + '/recurring-invoices', 'POST', body);
  }

  dataIntegrity(businessId: string, offset = 0): Promise<DataIntegrityReport> {
    const params = new URLSearchParams({ limit: '50', offset: String(offset) });
    return this.request<DataIntegrityReport>(
      '/api/v1/businesses/' + encodeURIComponent(businessId) + '/reports/data-integrity?' + params.toString()
    );
  }
  chat(businessId: string, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<ChatReply> {
    return this.request<ChatReply>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/assistant/chat`, 'POST', { message, history }
    );
  }
}
