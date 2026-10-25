import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

export interface Business {
  id: string;
  name: string;
  currency_code: string;
  locale: string;
  timezone: string;
  role?: string;
}
export interface Customer { id: string; name: string; email?: string | null; phone?: string | null; }
export interface Product { id: string; name: string; sku?: string | null; unit_price: string; currency_code?: string; is_stock_tracked: boolean; }
export interface Invoice { id: string; invoice_number: string; status: string; currency_code: string; total: string; customer_id?: string | null; }
export interface InvoiceDetail extends Invoice {
  lines: Array<{ id: string; product_id: string | null; description: string; quantity: string; unit_price: string; line_total: string }>;
}
export interface PaymentAllocation { invoice_id: string; amount: string; }
export interface Payment { id: string; amount: string; currency_code: string; received_at: string; method?: string | null; reference?: string | null; allocations: PaymentAllocation[]; }
export interface MoneyTotal { currency_code: string; count?: number; total: string; }
export interface ProfitLossRow { currency_code: string; revenue: string; revenue_invoice_count: number; expenses: string; expense_count: number; operating_result_before_cost_of_goods: string; }
export interface ProfitLossReport { period: { type: string; start_date: string | null; end_date: string | null; timezone: string }; currencies: ProfitLossRow[]; limitations: string[]; }
export interface Dashboard {
  period: { start_date: string | null; end_date: string | null; timezone: string };
  invoiced_sales: MoneyTotal[];
  collected_payments: MoneyTotal[];
  expenses: MoneyTotal[];
  outstanding_balances: MoneyTotal[];
}
export interface ChatReply { answer: string; sources: Array<{ type: string; id: string; date: string | null; invoice_number?: string; category?: string }>; }

@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private readonly auth: AuthService) {}

  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const config = await this.auth.getRuntimeConfig();
    const base = (config.apiBaseUrl || '').trim().replace(/\/$/, '');
    if (!base || base.includes('YOUR-BACKEND')) {
      throw new Error('The backend URL is not configured in runtime-config.json.');
    }
    const token = await this.auth.idToken();
    let response: Response;
    try {
      response = await fetch(base + path, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
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
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  listBusinesses(): Promise<Business[]> {
    return this.request<Business[]>('/api/v1/businesses');
  }
  createBusiness(body: { name: string; currency_code: string }): Promise<Business> {
    return this.request<Business>('/api/v1/businesses', 'POST', body);
  }
  dashboard(businessId: string): Promise<Dashboard> {
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - 30);
    const date = (value: Date) => value.toISOString().slice(0, 10);
    return this.request<Dashboard>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/dashboard?start_date=${date(start)}&end_date=${date(end)}`
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
  createProduct(businessId: string, body: { name: string; unit_price: string; is_stock_tracked: boolean }): Promise<Product> {
    return this.request<Product>(`/api/v1/businesses/${encodeURIComponent(businessId)}/products`, 'POST', body);
  }
  payments(businessId: string): Promise<Payment[]> {
    return this.request<Payment[]>(`/api/v1/businesses/${encodeURIComponent(businessId)}/payments?limit=100`);
  }
  createPayment(businessId: string, body: {
    amount: string; currency_code: string; idempotency_key: string;
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
  updateDraftInvoice(businessId: string, invoiceId: string, body: {
    invoice_number: string; currency_code: string; customer_id?: string; lines: Array<{ product_id: string; quantity: string }>;
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
  chat(businessId: string, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<ChatReply> {
    return this.request<ChatReply>(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/assistant/chat`, 'POST', { message, history }
    );
  }
}
