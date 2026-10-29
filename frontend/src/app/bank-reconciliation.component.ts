import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, BankAccount, BankStatementRow, Expense, Payment } from './api.service';

@Component({
  selector: 'aba-bank-reconciliation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="panel" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <header>
        <div><h2>{{ language === 'ar' ? 'مطابقة كشف البنك والصندوق' : 'Bank & cash reconciliation' }}</h2>
          <p>{{ language === 'ar' ? 'استيراد CSV ثم مطابقة كل حركة بسجل موجود. المطابقة لا تنشئ مدفوعات أو مصروفات.' : 'Import a CSV and match each row to an existing record. Matching never creates payments or expenses.' }}</p>
        </div>
        <button type="button" (click)="refresh()" [disabled]="loading">{{ language === 'ar' ? 'تحديث' : 'Refresh' }}</button>
      </header>
      @if (error) { <p class="error" role="alert">{{ error }}</p> }
      @if (message) { <p class="notice" role="status" aria-live="polite">{{ message }}</p> }

      @if (role === 'owner') {
        <h3>{{ language === 'ar' ? 'إضافة حساب' : 'Add account' }}</h3>
        <form class="grid" (ngSubmit)="createAccount()">
          <label>{{ language === 'ar' ? 'مفتاح الحساب' : 'Account key' }}<input name="accountKey" maxlength="80" required [(ngModel)]="accountKey"></label>
          <label>{{ language === 'ar' ? 'اسم الحساب' : 'Account name' }}<input name="accountName" maxlength="160" required [(ngModel)]="accountName"></label>
          <label>{{ language === 'ar' ? 'العملة' : 'Currency' }}<input name="currency" minlength="3" maxlength="3" required [(ngModel)]="currency"></label>
          <button class="primary" type="submit" [disabled]="busy">{{ language === 'ar' ? 'حفظ الحساب' : 'Save account' }}</button>
        </form>
        <h3>{{ language === 'ar' ? 'استيراد كشف CSV' : 'Import CSV statement' }}</h3>
        <label>{{ language === 'ar' ? 'الحساب' : 'Account' }}
          <select name="importAccount" [(ngModel)]="selectedAccountId" required>
            <option value="">{{ language === 'ar' ? 'اختر الحساب' : 'Choose account' }}</option>
            @for (account of accounts; track account.id) { <option [value]="account.id">{{ account.display_name }} · {{ account.currency_code }}</option> }
          </select>
        </label>
        <label>{{ language === 'ar' ? 'محتوى CSV' : 'CSV content' }}
          <textarea name="csvContent" rows="6" [(ngModel)]="csvContent" placeholder="transaction_id,transaction_date,description,amount,currency_code"></textarea>
        </label>
        <button class="primary" type="button" (click)="importCsv()" [disabled]="busy || !selectedAccountId || !csvContent.trim()">{{ language === 'ar' ? 'استيراد الحركات' : 'Import transactions' }}</button>
      }

      <h3>{{ language === 'ar' ? 'حركات كشف الحساب' : 'Statement rows' }}</h3>
      <label>{{ language === 'ar' ? 'تصفية حسب الحساب' : 'Filter by account' }}
        <select name="filterAccount" [(ngModel)]="filterAccountId" (ngModelChange)="loadRows()">
          <option value="">{{ language === 'ar' ? 'كل الحسابات' : 'All accounts' }}</option>
          @for (account of accounts; track account.id) { <option [value]="account.id">{{ account.display_name }}</option> }
        </select>
      </label>
      <div class="rows">
        @for (row of rows; track row.id) {
          <article>
            <div class="row-main">
              <strong>{{ row.description }}</strong>
              <small>{{ row.external_transaction_id }} · {{ row.transaction_date | date:'short' }}</small>
              <small>{{ row.status }} · {{ row.amount }} {{ row.currency_code }}</small>
            </div>
            @if (row.status === 'unmatched' && role === 'owner') {
              @if (Number(row.amount) > 0) {
                <label>{{ language === 'ar' ? 'المدفوعة الواردة المطابقة' : 'Matching payment' }}
                  <select [name]="'payment' + row.id" [(ngModel)]="targetByRow[row.id]">
                    <option value="">{{ language === 'ar' ? 'اختر دفعة' : 'Choose payment' }}</option>
                    @for (payment of eligiblePayments(row); track payment.id) { <option [value]="payment.id">{{ payment.reference || payment.id.slice(0,8) }} · {{ payment.amount }} {{ payment.currency_code }}</option> }
                  </select>
                </label>
              } @else {
                <label>{{ language === 'ar' ? 'المصروف المطابق' : 'Matching expense' }}
                  <select [name]="'expense' + row.id" [(ngModel)]="targetByRow[row.id]">
                    <option value="">{{ language === 'ar' ? 'اختر مصروفًا' : 'Choose expense' }}</option>
                    @for (expense of eligibleExpenses(row); track expense.id) { <option [value]="expense.id">{{ expense.description }} · {{ expense.amount }} {{ expense.currency_code }}</option> }
                  </select>
                </label>
              }
              <button class="primary" type="button" (click)="match(row)" [disabled]="busy || !targetByRow[row.id]">{{ language === 'ar' ? 'مطابقة' : 'Match' }}</button>
            }
          </article>
        }
        @if (!loading && !rows.length) { <p class="empty">{{ language === 'ar' ? 'لا توجد حركات كشف حساب.' : 'No statement rows.' }}</p> }
      </div>
    </section>
  `,
  styles: [`
    :host{display:block}.panel{padding:1rem;border:1px solid var(--border,#dfe5ec);border-radius:16px;background:var(--panel,#fff);color:var(--text,#172033)}
    header{display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}h2{margin:0 0 .4rem}h3{margin:1.3rem 0 .6rem}p,small{color:var(--muted,#5b6474);line-height:1.5}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:.7rem;align-items:end}label{display:grid;gap:.35rem;margin:.5rem 0}
    input,select,textarea{width:100%;min-width:0;box-sizing:border-box;padding:.65rem;border:1px solid var(--border,#cbd5e1);border-radius:9px;background:var(--surface,#fff);color:inherit}
    button{padding:.6rem .8rem;border:1px solid var(--border,#cbd5e1);border-radius:9px;background:var(--surface,#f8fafc);color:inherit}button.primary{background:var(--primary,#174ea6);color:white;border-color:transparent}button:disabled{opacity:.6}
    .rows{display:grid;gap:.6rem;margin-top:.8rem}.rows article{display:flex;align-items:end;gap:.8rem;flex-wrap:wrap;padding:.8rem;border:1px solid var(--border,#dfe5ec);border-radius:12px}.row-main{display:grid;gap:.2rem;flex:1 1 200px;min-width:0}
    .notice,.error,.empty{padding:.7rem;border-radius:8px;background:var(--surface,#f8fafc)}.error{color:var(--danger,#a32222)}
  `],
})
export class BankReconciliationComponent implements OnChanges {
  @Input({ required: true }) businessId = '';
  @Input() role = 'staff';
  @Input() language: 'ar' | 'en' = 'ar';
  accounts: BankAccount[] = [];
  rows: BankStatementRow[] = [];
  payments: Payment[] = [];
  expenses: Expense[] = [];
  accountKey = '';
  accountName = '';
  currency = 'EGP';
  selectedAccountId = '';
  filterAccountId = '';
  csvContent = '';
  targetByRow: Record<string, string> = {};
  loading = false;
  busy = false;
  error = '';
  message = '';
  private requestVersion = 0;

  constructor(private readonly api: ApiService) {}
  Number(value: string): number { return Number(value); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['businessId'] && this.businessId) {
      this.requestVersion++;
      this.accounts = []; this.rows = []; this.targetByRow = {};
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    const version = ++this.requestVersion;
    const businessId = this.businessId;
    this.loading = true; this.error = '';
    try {
      const [accounts, payments, expenses] = await Promise.all([
        this.api.bankAccounts(businessId), this.api.payments(businessId), this.api.expenses(businessId),
      ]);
      if (version !== this.requestVersion || businessId !== this.businessId) return;
      this.accounts = accounts.items; this.payments = payments; this.expenses = expenses;
      if (!this.selectedAccountId && this.accounts.length) this.selectedAccountId = this.accounts[0].id;
      await this.loadRows(version);
    } catch {
      if (version === this.requestVersion) this.error = this.language === 'ar' ? 'تعذر تحميل بيانات المطابقة.' : 'Could not load reconciliation data.';
    } finally { if (version === this.requestVersion) this.loading = false; }
  }

  async loadRows(version = this.requestVersion): Promise<void> {
    try {
      const page = await this.api.bankStatementRows(this.businessId, {
        account_id: this.filterAccountId || undefined, limit: 200, offset: 0,
      });
      if (version !== this.requestVersion) return;
      this.rows = page.items;
    } catch {
      if (version === this.requestVersion) this.error = this.language === 'ar' ? 'تعذر تحميل حركات الكشف.' : 'Could not load statement rows.';
    }
  }

  async createAccount(): Promise<void> {
    this.busy = true; this.error = ''; this.message = '';
    try {
      const account = await this.api.createBankAccount(this.businessId, {
        account_key: this.accountKey.trim(), display_name: this.accountName.trim(), currency_code: this.currency.trim().toUpperCase(),
      });
      this.selectedAccountId = account.id; this.accountKey = ''; this.accountName = '';
      this.message = this.language === 'ar' ? 'تم إنشاء الحساب.' : 'Account created.';
      await this.refresh();
    } catch { this.error = this.language === 'ar' ? 'تعذر إنشاء الحساب. راجع البيانات والصلاحيات.' : 'Could not create account. Check values and permissions.'; }
    finally { this.busy = false; }
  }

  async importCsv(): Promise<void> {
    if (!this.selectedAccountId || !this.csvContent.trim()) return;
    this.busy = true; this.error = ''; this.message = '';
    try {
      const result = await this.api.importBankStatement(this.businessId, this.selectedAccountId, this.csvContent);
      this.csvContent = '';
      this.message = this.language === 'ar'
        ? `تم استيراد ${result.created_count} حركة، وتخطي ${result.duplicate_count} مكرر.`
        : `Imported ${result.created_count} rows; skipped ${result.duplicate_count} duplicates.`;
      await this.refresh();
    } catch { this.error = this.language === 'ar' ? 'فشل استيراد CSV. راجع الأعمدة والتواريخ والعملة.' : 'CSV import failed. Check headers, dates and currency.'; }
    finally { this.busy = false; }
  }

  eligiblePayments(row: BankStatementRow): Payment[] {
    return this.payments.filter(item => item.currency_code === row.currency_code && Number(item.amount) === Math.abs(Number(row.amount)));
  }
  eligibleExpenses(row: BankStatementRow): Expense[] {
    return this.expenses.filter(item => item.currency_code === row.currency_code && Number(item.amount) === Math.abs(Number(row.amount)));
  }

  async match(row: BankStatementRow): Promise<void> {
    const target = this.targetByRow[row.id];
    if (!target) return;
    this.busy = true; this.error = ''; this.message = '';
    try {
      await this.api.matchBankStatementRow(this.businessId, {
        statement_row_id: row.id,
        ...(Number(row.amount) > 0 ? { payment_id: target } : { expense_id: target }),
      });
      delete this.targetByRow[row.id];
      this.message = this.language === 'ar' ? 'تمت مطابقة الحركة.' : 'Statement row matched.';
      await this.refresh();
    } catch { this.error = this.language === 'ar' ? 'تعذرت المطابقة. قد تكون الحركة مطابقة بالفعل أو لا تتوافق القيمة والعملة.' : 'Match failed. The row may already be matched or amount/currency do not agree.'; }
    finally { this.busy = false; }
  }
}
