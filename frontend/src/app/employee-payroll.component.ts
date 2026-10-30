import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService, EmployeePayrollRecord, EmployeeRecord } from './api.service';

@Component({
  selector: 'aba-employee-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="panel employee-panel" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <div class="section-head">
        <div>
          <h2>{{ t('الموظفون والمرتبات', 'Employees & payroll') }}</h2>
          <p>{{ t('إدارة ملفات الموظفين وتجهيز المرتبات واعتمادها وصرفها. بيانات الرواتب متاحة لمالك مساحة العمل فقط.', 'Manage employee profiles, prepare payroll, approve it and mark it paid. Salary data is restricted to workspace owners.') }}</p>
        </div>
        <span class="count">{{ employees.length }} {{ t('موظف', 'employees') }}</span>
      </div>

      @if (error) { <p class="error" role="alert">{{ error }}</p> }
      @if (message) { <p class="notice" role="status">{{ message }}</p> }

      <form class="employee-form" (ngSubmit)="saveEmployee()">
        <label>{{ t('اسم الموظف', 'Employee name') }}
          <input name="employeeName" maxlength="160" autocomplete="off" required [disabled]="busy" [(ngModel)]="employeeName">
        </label>
        <label>{{ t('كود الموظف', 'Employee code') }}
          <input name="employeeCode" maxlength="40" autocomplete="off" [disabled]="busy" [(ngModel)]="employeeCode">
        </label>
        <label>{{ t('البريد الإلكتروني', 'Email') }}
          <input name="employeeEmail" type="email" maxlength="254" autocomplete="off" [disabled]="busy" [(ngModel)]="employeeEmail">
        </label>
        <label>{{ t('رقم الهاتف', 'Phone') }}
          <input name="employeePhone" maxlength="32" autocomplete="off" [disabled]="busy" [(ngModel)]="employeePhone">
        </label>
        <label>{{ t('القسم', 'Department') }}
          <input name="employeeDepartment" maxlength="120" autocomplete="off" [disabled]="busy" [(ngModel)]="employeeDepartment">
        </label>
        <label>{{ t('المسمى الوظيفي', 'Job title') }}
          <input name="employeeJobTitle" maxlength="120" autocomplete="off" [disabled]="busy" [(ngModel)]="employeeJobTitle">
        </label>
        <label>{{ t('الراتب الشهري الأساسي', 'Base monthly salary') }} · {{ currencyCode }}
          <input name="employeeMonthlySalary" type="number" inputmode="decimal" min="0.01" step="0.01" required [disabled]="busy" [(ngModel)]="employeeMonthlySalary">
        </label>
        <div class="form-actions">
          <button class="primary" type="submit" [disabled]="busy || !employeeName.trim() || !employeeSalaryValid">
            {{ editingEmployeeId ? t('حفظ التعديلات', 'Save changes') : t('إضافة موظف', 'Add employee') }}
          </button>
          @if (editingEmployeeId) {
            <button class="secondary" type="button" (click)="cancelEmployeeEdit()">{{ t('إلغاء التعديل', 'Cancel edit') }}</button>
          }
        </div>
      </form>

      <div class="employee-tools">
        <label>{{ t('البحث عن موظف', 'Search employees') }}
          <input name="employeeSearch" [placeholder]="t('الاسم أو الكود أو القسم أو البريد', 'Name, code, department or email')" [(ngModel)]="employeeSearch">
        </label>
        <label>{{ t('فترة المرتبات', 'Payroll period') }}
          <input name="payrollFilterPeriod" type="month" [(ngModel)]="payrollFilterPeriod" (change)="loadEmployeesAndPayroll()">
        </label>
        <span class="count">{{ filteredEmployees.length }} {{ t('نتيجة', 'results') }}</span>
      </div>
      <p class="muted" role="note">{{ t('تنبيه: الواجهة تعرض أول 200 موظف فقط حاليًا؛ إذا كان العدد أكبر فباقي الموظفين غير ظاهرين.', 'Note: this screen currently shows only the first 200 employees; additional employees are not visible here.') }}</p>

      @if (busy) { <p class="muted" role="status">{{ t('جارٍ تحميل البيانات…', 'Loading employee and payroll data…') }}</p> }
      <div class="list">
        @for (employee of filteredEmployees; track employee.id) {
          <article class="list-row employee-row">
            <div class="employee-mark" aria-hidden="true">♙</div>
            <div class="grow">
              <strong>{{ employee.name }} · {{ employee.monthly_salary }} {{ currencyCode }}</strong>
              <small>{{ employee.employee_code || t('بدون كود', 'No code') }}{{ employee.department ? ' · ' + employee.department : '' }}{{ employee.job_title ? ' · ' + employee.job_title : '' }}</small>
              <small>{{ employee.email || t('بدون بريد', 'No email') }}{{ employee.phone ? ' · ' + employee.phone : '' }}</small>
              <span class="status" [class.inactive]="!employee.is_active">{{ employee.is_active ? t('نشط', 'Active') : t('غير نشط', 'Inactive') }}</span>
            </div>
            <div class="actions">
              <button class="secondary" type="button" (click)="editEmployee(employee)" [disabled]="busy">{{ t('تعديل', 'Edit') }}</button>
              <button class="secondary" type="button" (click)="preparePayroll(employee)" [disabled]="busy || !employee.is_active">{{ t('تجهيز مرتب', 'Prepare payroll') }}</button>
              <button class="secondary" type="button" (click)="toggleEmployeeActive(employee)" [disabled]="busy">{{ employee.is_active ? t('إيقاف', 'Deactivate') : t('إعادة تفعيل', 'Reactivate') }}</button>
            </div>
          </article>
        }
        @if (!filteredEmployees.length && !busy && !error) {
          <p class="empty">{{ t('لا يوجد موظفون مطابقون للبحث.', 'No matching employees found.') }}</p>
        }
      </div>

      <section class="payroll-section">
        <div class="section-head">
          <div>
            <h3>{{ editingPayrollId ? t('تعديل مسودة المرتب', 'Edit payroll draft') : t('تجهيز مرتب شهري', 'Prepare monthly payroll') }}</h3>
            <p>{{ t('الصافي يُحسب على الخادم: الأساسي + البدلات + المكافآت − الخصومات. لا نفترض قواعد ضرائب أو تأمينات.', 'Net pay is calculated on the server: base + allowances + bonuses − deductions. No tax or insurance rules are assumed.') }}</p>
          </div>
        </div>
        <form class="payroll-form" (ngSubmit)="savePayroll()">
          <label>{{ t('الموظف', 'Employee') }}
            <select name="payrollEmployeeId" required [disabled]="busy || !!editingPayrollId" [(ngModel)]="payrollEmployeeId">
              <option value="">{{ t('اختر موظفًا', 'Select an employee') }}</option>
              @for (employee of employees; track employee.id) {
                <option [value]="employee.id" [disabled]="!employee.is_active">{{ employee.name }} · {{ employee.employee_code || employee.monthly_salary }}</option>
              }
            </select>
          </label>
          <label>{{ t('شهر المرتب', 'Payroll month') }}
            <input name="payrollPeriod" type="month" required [disabled]="busy || !!editingPayrollId" [(ngModel)]="payrollPeriod">
          </label>
          <label>{{ t('البدلات', 'Allowances') }}
            <input name="payrollAllowances" type="number" inputmode="decimal" min="0" step="0.01" required [disabled]="busy" [(ngModel)]="payrollAllowances">
          </label>
          <label>{{ t('المكافآت', 'Bonuses') }}
            <input name="payrollBonuses" type="number" inputmode="decimal" min="0" step="0.01" required [disabled]="busy" [(ngModel)]="payrollBonuses">
          </label>
          <label>{{ t('الخصومات', 'Deductions') }}
            <input name="payrollDeductions" type="number" inputmode="decimal" min="0" step="0.01" required [disabled]="busy" [(ngModel)]="payrollDeductions">
          </label>
          <div class="form-actions">
            <button class="primary" type="submit" [disabled]="busy || !payrollEmployeeId || !payrollPeriod">
              {{ editingPayrollId ? t('حفظ المسودة', 'Save draft') : t('إنشاء مسودة', 'Create draft') }}
            </button>
            @if (editingPayrollId) {
              <button class="secondary" type="button" (click)="cancelPayrollEdit()">{{ t('إلغاء', 'Cancel') }}</button>
            }
          </div>
        </form>
        <div class="notice warning-notice">
          {{ t('اعتماد المرتب يتطلب مالكًا آخر غير منشئ المسودة. الصرف بعد الاعتماد ينشئ مصروف رواتب واحدًا مرتبطًا بالسجل.', 'A different owner must approve the payroll draft. After approval, marking it paid creates one linked Payroll expense.') }}
        </div>
      </section>

      <section class="payroll-section">
        <div class="section-head">
          <div>
            <h3>{{ t('سجل المرتبات', 'Payroll records') }}</h3>
            <p>{{ t('تُسجّل عمليات الاعتماد والصرف في سجل النشاط، ولا يمكن صرف السجل مرتين.', 'Approvals and payments are audited; a record cannot be paid twice.') }}</p>
          </div>
          <span class="count">{{ payrollRecords.length }} {{ t('سجل', 'records') }}</span>
        </div>
        <p class="muted" role="note">{{ t('تنبيه: الواجهة تعرض أول 200 سجل مرتب فقط للفترة المحددة؛ السجلات الإضافية غير ظاهرة حاليًا.', 'Note: this screen currently shows only the first 200 payroll records for the selected period; additional records are not visible here.') }}</p>
        <div class="list">
          @for (payroll of payrollRecords; track payroll.id) {
            <article class="list-row payroll-row">
              <div class="employee-mark money-mark" aria-hidden="true">＄</div>
              <div class="grow">
                <strong>{{ payroll.employee_name }} · {{ payroll.period }} · {{ payroll.net_pay }} {{ currencyCode }}</strong>
                <small>{{ t('أساسي', 'Base') }} {{ payroll.base_salary }} + {{ t('بدلات', 'allowances') }} {{ payroll.allowances }} + {{ t('مكافآت', 'bonuses') }} {{ payroll.bonuses }} − {{ t('خصومات', 'deductions') }} {{ payroll.deductions }}</small>
                <span class="status" [class.inactive]="payroll.status !== 'paid'">{{ payrollStatusLabel(payroll.status) }}</span>
                @if (payroll.status === 'paid' && payroll.paid_at) { <small>{{ t('تاريخ الصرف', 'Paid at') }} · {{ payroll.paid_at | date:'mediumDate' }}</small> }
              </div>
              <div class="actions">
                @if (payroll.status === 'draft') {
                  <button class="secondary" type="button" (click)="editPayroll(payroll)" [disabled]="busy || !!operationId">{{ t('تعديل المسودة', 'Edit draft') }}</button>
                  <button class="secondary" type="button" (click)="approvePayroll(payroll)" [disabled]="busy || !!operationId">{{ t('اعتماد', 'Approve') }}</button>
                }
                @if (payroll.status === 'approved') {
                  <button class="primary" type="button" (click)="payPayroll(payroll)" [disabled]="busy || !!operationId">{{ t('تأكيد الصرف', 'Mark paid') }}</button>
                }
              </div>
            </article>
          }
          @if (!payrollRecords.length && !busy && !error) {
            <p class="empty">{{ t('لا توجد مرتبات في الفترة المحددة.', 'No payroll records for this period.') }}</p>
          }
        </div>
      </section>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;color:#172033}
    .employee-panel{min-width:0;background:#fff;border:1px solid #e5eaf1;border-radius:14px;padding:22px;margin-top:4px}
    .section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px;min-width:0}
    .section-head>div{min-width:0}
    .section-head h2{font-size:18px;margin:0 0 6px}
    .section-head h3{font-size:15px;margin:0 0 6px}
    .section-head p{font-size:11px;line-height:1.6;color:#6b7280;margin:0}
    .count{font-size:10px;font-weight:700;color:#0f766e;background:#ecfdf5;padding:7px 9px;border-radius:999px;white-space:nowrap}
    .primary,.secondary{border-radius:9px;padding:10px 13px;font-weight:700;font-size:12px;border:1px solid #d1d5db;background:#fff;color:#374151;cursor:pointer}
    .primary{background:#0f766e;border-color:#0f766e;color:#fff}
    .primary:hover:not(:disabled){background:#115e59}
    button:disabled{opacity:.55;cursor:not-allowed}
    input,select{width:100%;max-width:100%;min-width:0;border:1px solid #d1d5db;border-radius:9px;background:#fff;padding:11px 12px;font-size:12px;color:#111827}
    .error{color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;font-size:12px;line-height:1.6}
    .notice{display:flex;gap:12px;background:#ecfdf5;border:1px solid #bbf7d0;border-radius:12px;padding:14px;margin-top:15px;color:#065f46;font-size:11px;line-height:1.6}
    .warning-notice{background:#fffbeb;border-color:#fde68a;color:#92400e}
    .muted{font-size:12px;color:#6b7280;line-height:1.7}
    .list{margin-top:14px;min-width:0}
    .list-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid #edf0f5;min-width:0}
    .list-row:last-child{border-bottom:0}
    .grow{min-width:0;overflow-wrap:anywhere}
    .list-row strong{display:block;font-size:12px;overflow-wrap:anywhere}
    .list-row small{display:block;color:#6b7280;font-size:10px;margin-top:5px;overflow-wrap:anywhere}
    .empty{padding:20px;text-align:center;color:#9ca3af;font-size:12px}
    .employee-form,.payroll-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;min-width:0;margin:14px 0}
    .employee-form label,.payroll-form label,.employee-tools label{display:grid;gap:5px;min-width:0;font-size:12px;font-weight:700;color:#334155}
    input,select{width:100%;max-width:100%;min-width:0}
    .form-actions{display:flex;align-items:end;flex-wrap:wrap;gap:8px}
    .employee-tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(150px,220px) auto;gap:12px;align-items:end;margin:16px 0;min-width:0}
    .employee-tools .count{justify-self:end}
    .payroll-section{margin-top:24px;padding-top:18px;border-top:1px solid #e5e7eb;min-width:0}
    .employee-row,.payroll-row{grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:12px;min-width:0}
    .employee-mark{display:grid;place-items:center;width:36px;height:36px;background:#e0f2fe;color:#075985;border-radius:11px;font-weight:800}
    .money-mark{background:#dcfce7;color:#166534}
    .actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;min-width:0}
    .actions button{min-height:36px;padding:7px 10px;font-size:12px}
    .status{display:inline-flex;margin-top:5px;padding:4px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700}
    .status.inactive{background:#f1f5f9;color:#475569}
    @media(max-width:760px){
      .employee-panel{padding:15px;border-radius:13px}
      .section-head{align-items:flex-start}
      .notice{align-items:flex-start;flex-direction:column}
      .list-row{grid-template-columns:32px minmax(0,1fr);align-items:start}
      .employee-tools{grid-template-columns:minmax(0,1fr)}
      .employee-tools .count{justify-self:start}
      .employee-form,.payroll-form{grid-template-columns:minmax(0,1fr)}
      .employee-row,.payroll-row{grid-template-columns:32px minmax(0,1fr);align-items:start}
      .actions{grid-column:1/-1;justify-content:stretch}
      .actions button{flex:1;min-width:0}
    }
  `]
})
export class EmployeePayrollComponent implements OnChanges {
  @Input({ required: true }) businessId = '';
  @Input({ required: true }) currencyCode = 'EGP';
  @Input() language: 'ar' | 'en' = 'ar';
  @Output() payrollPaid = new EventEmitter<void>();

  employees: EmployeeRecord[] = [];
  payrollRecords: EmployeePayrollRecord[] = [];
  busy = false;
  error = '';
  message = '';
  employeeSearch = '';
  editingEmployeeId: string | null = null;
  employeeName = '';
  employeeCode = '';
  employeeEmail = '';
  employeePhone = '';
  employeeDepartment = '';
  employeeJobTitle = '';
  employeeMonthlySalary = '';
  payrollEmployeeId = '';
  payrollPeriod = this.currentPeriod();
  payrollFilterPeriod = '';
  payrollAllowances = '0.00';
  payrollBonuses = '0.00';
  payrollDeductions = '0.00';
  editingPayrollId: string | null = null;
  operationId = '';
  private loadSequence = 0;

  constructor(private readonly api: ApiService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['businessId'] && this.businessId) {
      // Clear every workspace-scoped salary value before loading the next workspace.
      this.loadSequence++;
      this.employees = [];
      this.payrollRecords = [];
      this.clearEmployeeForm();
      this.cancelPayrollEdit();
      this.employeeSearch = '';
      this.payrollEmployeeId = '';
      this.payrollFilterPeriod = '';
      this.payrollPeriod = this.currentPeriod();
      this.operationId = '';
      this.busy = false;
      this.error = '';
      this.message = '';
      void this.loadEmployeesAndPayroll();
    }
  }

  t(arabic: string, english: string): string {
    return this.language === 'ar' ? arabic : english;
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  get employeeSalaryValid(): boolean {
    const salary = Number(String(this.employeeMonthlySalary ?? '').trim());
    return Number.isFinite(salary) && salary > 0;
  }

  get filteredEmployees(): EmployeeRecord[] {
    const query = this.employeeSearch.trim().toLocaleLowerCase();
    if (!query) return this.employees;
    return this.employees.filter(employee =>
      [employee.name, employee.employee_code, employee.email, employee.department, employee.job_title]
        .some(value => (value || '').toLocaleLowerCase().includes(query))
    );
  }

  payrollStatusLabel(status: EmployeePayrollRecord['status']): string {
    const labels: Record<EmployeePayrollRecord['status'], { ar: string; en: string }> = {
      draft: { ar: 'مسودة', en: 'Draft' },
      approved: { ar: 'معتمد', en: 'Approved' },
      paid: { ar: 'تم الصرف', en: 'Paid' }
    };
    return labels[status][this.language];
  }

  async loadEmployeesAndPayroll(): Promise<void> {
    if (!this.businessId) return;
    const businessId = this.businessId;
    const sequence = ++this.loadSequence;
    this.busy = true;
    this.error = '';
    try {
      const [employees, payrollRecords] = await Promise.all([
        this.api.employees(businessId),
        this.api.payroll(businessId, this.payrollFilterPeriod || undefined)
      ]);
      if (sequence !== this.loadSequence || this.businessId !== businessId) return;
      this.employees = employees;
      this.payrollRecords = payrollRecords;
      if (!this.employees.some(item => item.id === this.payrollEmployeeId && item.is_active)) {
        this.payrollEmployeeId = this.employees.find(item => item.is_active)?.id || '';
      }
    } catch (error) {
      if (sequence === this.loadSequence && this.businessId === businessId) this.error = this.errorMessage(error);
    } finally {
      if (sequence === this.loadSequence && this.businessId === businessId) this.busy = false;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : this.t('حدث خطأ غير متوقع.', 'An unexpected error occurred.');
  }

  private clearEmployeeForm(): void {
    this.editingEmployeeId = null;
    this.employeeName = '';
    this.employeeCode = '';
    this.employeeEmail = '';
    this.employeePhone = '';
    this.employeeDepartment = '';
    this.employeeJobTitle = '';
    this.employeeMonthlySalary = '';
  }

  editEmployee(employee: EmployeeRecord): void {
    this.editingEmployeeId = employee.id;
    this.employeeName = employee.name;
    this.employeeCode = employee.employee_code || '';
    this.employeeEmail = employee.email || '';
    this.employeePhone = employee.phone || '';
    this.employeeDepartment = employee.department || '';
    this.employeeJobTitle = employee.job_title || '';
    this.employeeMonthlySalary = employee.monthly_salary;
    this.message = '';
    this.error = '';
  }

  cancelEmployeeEdit(): void {
    this.clearEmployeeForm();
  }

  async saveEmployee(): Promise<void> {
    const name = this.employeeName.trim();
    const monthlySalary = String(this.employeeMonthlySalary ?? '').trim();
    if (!this.businessId || !name || !this.employeeSalaryValid) {
      this.error = this.t('أدخل اسم الموظف وراتبًا أساسيًا أكبر من صفر.', 'Enter an employee name and a base salary greater than zero.');
      return;
    }
    const businessId = this.businessId;
    const employeeId = this.editingEmployeeId;
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      if (employeeId) {
        await this.api.updateEmployee(businessId, employeeId, {
          name,
          employee_code: this.employeeCode.trim() || null,
          email: this.employeeEmail.trim() || null,
          phone: this.employeePhone.trim() || null,
          department: this.employeeDepartment.trim() || null,
          job_title: this.employeeJobTitle.trim() || null,
          monthly_salary: monthlySalary
        });
      } else {
        await this.api.createEmployee(businessId, {
          name,
          employee_code: this.employeeCode.trim() || undefined,
          email: this.employeeEmail.trim() || undefined,
          phone: this.employeePhone.trim() || undefined,
          department: this.employeeDepartment.trim() || undefined,
          job_title: this.employeeJobTitle.trim() || undefined,
          monthly_salary: monthlySalary
        });
      }
      if (this.businessId !== businessId) return;
      this.clearEmployeeForm();
      this.message = this.t('تم حفظ بيانات الموظف بنجاح.', 'Employee details saved successfully.');
      await this.loadEmployeesAndPayroll();
    } catch (error) {
      if (this.businessId === businessId) this.error = this.errorMessage(error);
    } finally {
      if (this.businessId === businessId) this.busy = false;
    }
  }

  async toggleEmployeeActive(employee: EmployeeRecord): Promise<void> {
    const businessId = this.businessId;
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      await this.api.updateEmployee(businessId, employee.id, { is_active: !employee.is_active });
      if (this.businessId !== businessId) return;
      this.message = employee.is_active
        ? this.t('تم إيقاف الموظف دون حذف سجلاته المالية.', 'Employee deactivated without deleting financial history.')
        : this.t('تمت إعادة تفعيل الموظف.', 'Employee reactivated.');
      await this.loadEmployeesAndPayroll();
    } catch (error) {
      if (this.businessId === businessId) this.error = this.errorMessage(error);
    } finally {
      if (this.businessId === businessId) this.busy = false;
    }
  }

  preparePayroll(employee: EmployeeRecord): void {
    if (!employee.is_active) return;
    this.payrollEmployeeId = employee.id;
    this.editingPayrollId = null;
    this.payrollPeriod = this.currentPeriod();
    this.payrollAllowances = '0.00';
    this.payrollBonuses = '0.00';
    this.payrollDeductions = '0.00';
    this.message = this.t('تم اختيار الموظف لتجهيز المرتب.', 'Employee selected for payroll preparation.');
    this.error = '';
  }

  editPayroll(record: EmployeePayrollRecord): void {
    if (record.status !== 'draft') return;
    this.editingPayrollId = record.id;
    this.payrollEmployeeId = record.employee_id;
    this.payrollPeriod = record.period;
    this.payrollAllowances = record.allowances;
    this.payrollBonuses = record.bonuses;
    this.payrollDeductions = record.deductions;
    this.message = this.t('تم تحميل مسودة المرتب للتعديل.', 'Payroll draft loaded for editing.');
    this.error = '';
  }

  cancelPayrollEdit(): void {
    this.editingPayrollId = null;
    this.payrollAllowances = '0.00';
    this.payrollBonuses = '0.00';
    this.payrollDeductions = '0.00';
  }

  async savePayroll(): Promise<void> {
    if (!this.businessId || !this.payrollEmployeeId) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(this.payrollPeriod)) {
      this.error = this.t('اختَر شهرًا صالحًا للمرتب.', 'Select a valid payroll month.');
      return;
    }
    const amounts = [this.payrollAllowances, this.payrollBonuses, this.payrollDeductions]
      .map(value => Number(String(value ?? '').trim()));
    if (amounts.some(value => !Number.isFinite(value) || value < 0)) {
      this.error = this.t('البدلات والمكافآت والخصومات يجب أن تكون أرقامًا غير سالبة.', 'Allowances, bonuses and deductions must be non-negative numbers.');
      return;
    }
    const businessId = this.businessId;
    this.busy = true;
    this.error = '';
    this.message = '';
    try {
      if (this.editingPayrollId) {
        await this.api.updatePayroll(businessId, this.editingPayrollId, {
          allowances: String(this.payrollAllowances).trim(),
          bonuses: String(this.payrollBonuses).trim(),
          deductions: String(this.payrollDeductions).trim()
        });
        this.message = this.t('تم تحديث المسودة وحساب الصافي على الخادم.', 'Draft updated; net pay recalculated on the server.');
      } else {
        await this.api.createPayroll(businessId, this.payrollEmployeeId, {
          period: this.payrollPeriod,
          allowances: String(this.payrollAllowances).trim(),
          bonuses: String(this.payrollBonuses).trim(),
          deductions: String(this.payrollDeductions).trim()
        });
        this.message = this.t('تم إنشاء مسودة المرتب. يلزم اعتمادها من مالك آخر.', 'Payroll draft created. Another owner must approve it.');
      }
      if (this.businessId !== businessId) return;
      this.cancelPayrollEdit();
      await this.loadEmployeesAndPayroll();
    } catch (error) {
      if (this.businessId === businessId) this.error = this.errorMessage(error);
    } finally {
      if (this.businessId === businessId) this.busy = false;
    }
  }

  async approvePayroll(record: EmployeePayrollRecord): Promise<void> {
    const businessId = this.businessId;
    this.operationId = record.id;
    this.error = '';
    this.message = '';
    try {
      await this.api.approvePayroll(businessId, record.id);
      if (this.businessId !== businessId) return;
      this.message = this.t('تم اعتماد المرتب.', 'Payroll approved.');
      await this.loadEmployeesAndPayroll();
    } catch (error) {
      if (this.businessId === businessId) {
        const failure = this.errorMessage(error);
        // A timeout may occur after the transaction committed; reload to reconcile the visible status.
        await this.loadEmployeesAndPayroll();
        if (this.businessId === businessId) this.error = failure;
      }
    } finally {
      if (this.operationId === record.id) this.operationId = '';
    }
  }

  async payPayroll(record: EmployeePayrollRecord): Promise<void> {
    const businessId = this.businessId;
    this.operationId = record.id;
    this.error = '';
    this.message = '';
    try {
      await this.api.payPayroll(businessId, record.id);
      if (this.businessId !== businessId) return;
      this.message = this.t('تم تسجيل الصرف وربطه بمصروف رواتب واحد.', 'Payment recorded and linked to one Payroll expense.');
      this.payrollPaid.emit();
      await this.loadEmployeesAndPayroll();
    } catch (error) {
      if (this.businessId === businessId) {
        const failure = this.errorMessage(error);
        // A lost response must not make the UI imply that the payment did not happen.
        await this.loadEmployeesAndPayroll();
        if (this.businessId === businessId) this.error = failure;
      }
    } finally {
      if (this.operationId === record.id) this.operationId = '';
    }
  }
}
