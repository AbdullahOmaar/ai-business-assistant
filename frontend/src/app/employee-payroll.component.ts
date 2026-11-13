import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocalizationService } from './localization.service';
import { AbaRecordTableComponent, type AbaRecordTableActionEvent, type AbaRecordTableColumn, type AbaRecordTableRow } from './shared/ui/aba-record-table.component';
import { ApiService, EmployeePayrollRecord, EmployeeRecord } from './api.service';

@Component({
  selector: 'aba-employee-payroll',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaRecordTableComponent],
  template: `
    <section class="panel employee-panel" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'" [attr.data-mobile-section]="mobileSection">
      <div class="section-head">
        <div>
          <h2>{{ t("ui.m_4h0vw6") }}</h2>
          <p>{{ t("ui.m_3j518t") }}</p>
        </div>
        <span class="count">{{ employees.length }} {{ t("ui.m_3zsc2") }}</span>
      </div>

      @if (error) { <p class="error" role="alert">{{ error }}</p> }
      @if (message) { <p class="notice success-notice" role="status">{{ message }}</p> }

      <nav class="mobile-hr-nav" [attr.aria-label]="t("ui.m_1ntfciq")">
        <button type="button" [class.active]="mobileSection === 'employees'" [attr.aria-current]="mobileSection === 'employees' ? 'page' : null" (click)="setMobileSection('employees')">{{ t("ui.m_1whxhp7") }}</button>
        <button type="button" [class.active]="mobileSection === 'prepare'" [attr.aria-current]="mobileSection === 'prepare' ? 'page' : null" (click)="setMobileSection('prepare')">{{ t("ui.m_12qqxbq") }}</button>
        <button type="button" [class.active]="mobileSection === 'history'" [attr.aria-current]="mobileSection === 'history' ? 'page' : null" (click)="setMobileSection('history')">{{ t("ui.m_g4qggl") }}</button>
      </nav>

      <section class="employee-workspace" data-mobile-pane="employees">
        <div class="employee-form-shell" [class.is-open]="employeeFormOpen">
          <button #employeeFormToggle class="employee-form-toggle" type="button" [attr.aria-expanded]="employeeFormOpen" aria-controls="employee-profile-form" (click)="toggleEmployeeForm()">
            <span>{{ employeeFormOpen ? t("ui.m_2nnp9j") : editingEmployeeId ? t("ui.m_1hn4613") : t("ui.m_1xic4vk") }}</span>
            <span aria-hidden="true">{{ employeeFormOpen ? '−' : '+' }}</span>
          </button>
          <form id="employee-profile-form" class="employee-form" (ngSubmit)="saveEmployee()">
        <label>{{ t("ui.m_eqdww") }}
          <input name="employeeName" maxlength="160" autocomplete="off" required [disabled]="busy" [(ngModel)]="employeeName">
        </label>
        <label>{{ t("ui.m_jtu0fd") }}
          <input name="employeeCode" maxlength="40" autocomplete="off" [disabled]="busy" [(ngModel)]="employeeCode">
        </label>
        <label>{{ t("ui.m_112c7vo") }}
          <input name="employeeEmail" type="email" maxlength="254" autocomplete="off" [disabled]="busy" [(ngModel)]="employeeEmail">
        </label>
        <label>{{ t("ui.m_n9dt9n") }}
          <input name="employeePhone" maxlength="32" autocomplete="off" [disabled]="busy" [(ngModel)]="employeePhone">
        </label>
        <label>{{ t("ui.m_fcawum") }}
          <input name="employeeDepartment" maxlength="120" autocomplete="off" [disabled]="busy" [(ngModel)]="employeeDepartment">
        </label>
        <label>{{ t("ui.m_qfhcd5") }}
          <input name="employeeJobTitle" maxlength="120" autocomplete="off" [disabled]="busy" [(ngModel)]="employeeJobTitle">
        </label>
        <label>{{ t("ui.m_fzbln8") }} · {{ currencyCode }}
          <input name="employeeMonthlySalary" type="number" inputmode="decimal" min="0.01" step="0.01" required [disabled]="busy" [(ngModel)]="employeeMonthlySalary">
        </label>
        <div class="form-actions">
          <button class="primary" type="submit" [disabled]="busy || !employeeName.trim() || !employeeSalaryValid">
            {{ editingEmployeeId ? t("ui.m_suv5n") : t("ui.m_ze7lpa") }}
          </button>
          @if (editingEmployeeId) {
            <button class="secondary" type="button" (click)="cancelEmployeeEdit()">{{ t("ui.m_defu9p") }}</button>
          }
        </div>
          </form>
        </div>

      <div class="employee-tools">
        <label>{{ t("ui.m_k10p5m") }}
          <input name="employeeSearch" [placeholder]="t("ui.m_1s1lu82")" [(ngModel)]="employeeSearch">
        </label>
        <span class="count">{{ filteredEmployees.length }} {{ t("ui.m_1jg5410") }}</span>
      </div>

      <aba-record-table [ariaLabel]="t("ui.m_1isrfeo")" [columns]="employeeTableColumns" [rows]="employeeTableRows" [loading]="busy && !employees.length" [loadingDescription]="t("ui.m_zwe2q6")" [actionsHeading]="t("ui.m_1dbhmlo")" [emptyTitle]="t("ui.m_q8ks9z")" [emptyDescription]="employeeSearch.trim() ? t("ui.m_mdi6vd") : t("ui.m_ej4qvb")" (rowAction)="onEmployeeRecordAction($event)" />
      </section>

      <section class="payroll-section payroll-preparation" data-mobile-pane="prepare">
        <div class="section-head">
          <div>
            <h3 #prepareHeading tabindex="-1">{{ editingPayrollId ? t("ui.m_12xyelk") : t("ui.m_79zkdd") }}</h3>
            <p>{{ t("ui.m_1vnth1i") }}</p>
          </div>
        </div>
        <form class="payroll-form" (ngSubmit)="savePayroll()">
          <label>{{ t("ui.m_18mgrmo") }}
            <select name="payrollEmployeeId" required [disabled]="busy || !!editingPayrollId" [(ngModel)]="payrollEmployeeId">
              <option value="">{{ t("ui.m_ph5hp0") }}</option>
              @for (employee of employees; track employee.id) {
                <option [value]="employee.id" [disabled]="!employee.is_active">{{ employee.name }} · {{ employee.employee_code || t("ui.m_7yrjle") }}</option>
              }
            </select>
          </label>
          <label>{{ t("ui.m_jcps75") }}
            <input name="payrollPeriod" type="month" required [disabled]="busy || !!editingPayrollId" [(ngModel)]="payrollPeriod">
          </label>
          <label>{{ t("ui.m_v1202z") }}
            <input name="payrollAllowances" type="number" inputmode="decimal" min="0" step="0.01" required [disabled]="busy" [(ngModel)]="payrollAllowances">
          </label>
          <label>{{ t("ui.m_1xj0rsd") }}
            <input name="payrollBonuses" type="number" inputmode="decimal" min="0" step="0.01" required [disabled]="busy" [(ngModel)]="payrollBonuses">
          </label>
          <label>{{ t("ui.m_oxttnb") }}
            <input name="payrollDeductions" type="number" inputmode="decimal" min="0" step="0.01" required [disabled]="busy" [(ngModel)]="payrollDeductions">
          </label>
          <div class="form-actions">
            <button class="primary" type="submit" [disabled]="busy || !payrollEmployeeId || !payrollPeriod">
              {{ editingPayrollId ? t("ui.m_1ygqune") : t("ui.m_1rnrnw5") }}
            </button>
            @if (editingPayrollId) {
              <button class="secondary" type="button" (click)="cancelPayrollEdit()">{{ t("ui.m_pw64as") }}</button>
            }
          </div>
        </form>
        <div class="notice warning-notice">
          {{ t("ui.m_1giayo7") }}
        </div>
      </section>

      <section class="payroll-section payroll-history" data-mobile-pane="history">
        <div class="section-head">
          <div>
            <h3 #historyHeading tabindex="-1">{{ t("ui.m_1lg62or") }}</h3>
            <p>{{ t("ui.m_1dtta9v") }}</p>
          </div>
          <span class="count">{{ payrollRecords.length }} {{ t("ui.m_189ya4o") }}</span>
        </div>
        <div class="payroll-history-filter">
          <label>{{ t("ui.m_r58gmw") }}
            <input name="payrollFilterPeriod" type="month" [(ngModel)]="payrollFilterPeriod" (change)="loadEmployeesAndPayroll()">
          </label>
        </div>
        <aba-record-table [ariaLabel]="t("ui.m_1p3jv9d")" [columns]="payrollTableColumns" [rows]="payrollTableRows" [loading]="busy && !payrollRecords.length" [loadingDescription]="t("ui.m_1vhhn22")" [emptyTitle]="t("ui.m_kvx8t8")" [emptyDescription]="t("ui.m_1yak0g9")" [actionsHeading]="t("ui.m_1dbhmlo")" (rowAction)="onPayrollRecordAction($event)" />
      </section>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;color:var(--aba-color-text-primary,#172033)}
    .employee-panel{min-width:0;background:var(--aba-color-surface,#fff);border:1px solid var(--aba-color-border,#e5eaf1);border-radius:14px;padding:22px;margin-top:4px}
    .mobile-hr-nav{display:none}
    .employee-form-toggle{display:none}
    .section-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:18px;min-width:0}
    .section-head>div{min-width:0}
    .section-head h2{font-size:18px;margin:0 0 6px}
    .section-head h3{font-size:15px;margin:0 0 6px}
    .section-head p{font-size:11px;line-height:1.6;color:var(--aba-color-text-tertiary,#6b7280);margin:0}
    .count{font-size:10px;font-weight:700;color:var(--aba-color-primary,#0f766e);background:var(--aba-color-primary-soft,#ecfdf5);padding:7px 9px;border-radius:999px;white-space:nowrap}
    .primary,.secondary{border-radius:9px;padding:10px 13px;font-weight:700;font-size:12px;border:1px solid var(--aba-color-border-strong,#d1d5db);background:var(--aba-color-surface,#fff);color:var(--aba-color-text-muted,#374151);cursor:pointer}
    .primary{background:var(--aba-color-primary,#0f766e);border-color:var(--aba-color-primary,#0f766e);color:var(--aba-color-on-primary,#fff)}
    .primary:hover:not(:disabled){background:var(--aba-color-primary-strong,#115e59)}
    button:disabled{opacity:.55;cursor:not-allowed}
    input,select{width:100%;max-width:100%;min-width:0;border:1px solid var(--aba-color-border-strong,#d1d5db);border-radius:9px;background:var(--aba-color-surface,#fff);padding:11px 12px;font-size:12px;color:var(--aba-color-text-primary,#111827)}
    .error{color:var(--aba-color-danger-text,#991b1b);background:var(--aba-color-danger-soft,#fef2f2);border:1px solid var(--aba-color-danger-border,#fecaca);border-radius:10px;padding:12px;font-size:12px;line-height:1.6}
    .notice{display:flex;gap:12px;background:var(--aba-color-success-soft,#ecfdf5);border:1px solid var(--aba-color-success-border,#bbf7d0);border-radius:12px;padding:14px;margin-top:15px;color:var(--aba-color-success-text,#065f46);font-size:11px;line-height:1.6}
    .warning-notice{background:var(--aba-color-warning-soft,#fffbeb);border-color:var(--aba-color-warning-border,#fde68a);color:var(--aba-color-warning-text,#92400e)}
    .muted{font-size:12px;color:var(--aba-color-text-tertiary,#6b7280);line-height:1.7}
    .list{margin-top:14px;min-width:0}
    .list-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:12px;padding:13px 3px;border-bottom:1px solid var(--aba-color-border-subtle,#edf0f5);min-width:0}
    .list-row:last-child{border-bottom:0}
    .grow{min-width:0;overflow-wrap:anywhere}
    .list-row strong{display:block;font-size:12px;overflow-wrap:anywhere}
    .list-row small{display:block;color:var(--aba-color-text-tertiary,#6b7280);font-size:10px;margin-top:5px;overflow-wrap:anywhere}
    .empty{padding:20px;text-align:center;color:var(--aba-color-text-tertiary,#9ca3af);font-size:12px}
    .employee-form,.payroll-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;min-width:0;margin:14px 0}
    .employee-form label,.payroll-form label,.employee-tools label{display:grid;gap:5px;min-width:0;font-size:12px;font-weight:700;color:var(--aba-color-text-muted,#334155)}
    input,select{width:100%;max-width:100%;min-width:0}
    .form-actions{display:flex;align-items:end;flex-wrap:wrap;gap:8px}
    .employee-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:end;margin:16px 0;min-width:0}
    .employee-tools .count{justify-self:end}
    .payroll-history-filter{display:grid;grid-template-columns:minmax(0,220px);gap:12px;align-items:end;margin:12px 0}
    .employee-tools label,.payroll-history-filter label{display:grid;gap:5px;min-width:0;font-size:12px;font-weight:700;color:var(--aba-color-text-muted,#334155)}
    .payroll-section{margin-top:24px;padding-top:18px;border-top:1px solid var(--aba-color-border-subtle,#e5e7eb);min-width:0}
    .employee-row,.payroll-row{grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:12px;min-width:0}
    .employee-mark{display:grid;place-items:center;width:36px;height:36px;background:var(--aba-color-info-soft,#e0f2fe);color:var(--aba-color-info-text,#075985);border-radius:11px;font-weight:800}
    .money-mark{background:var(--aba-color-success-soft,#dcfce7);color:var(--aba-color-success-text,#166534)}
    .actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;min-width:0}
    .actions button{min-height:var(--aba-control-height,44px);padding:7px 10px;font-size:12px}
    .status{display:inline-flex;margin-top:5px;padding:4px 8px;border-radius:999px;background:var(--aba-color-success-soft,#dcfce7);color:var(--aba-color-success-text,#166534);font-size:11px;font-weight:700}
    .status.inactive{background:var(--aba-color-surface-hover,#f1f5f9);color:var(--aba-color-text-muted,#475569)}
    @media(max-width:600px){.section-head{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.section-head .count{justify-self:start}}
    @media(max-width:760px){
      .employee-panel{padding:15px;border-radius:13px}
      .mobile-hr-nav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:0 0 16px;padding:5px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:13px;background:var(--aba-color-surface-subtle,#f8fafc)}
      .mobile-hr-nav button{min-width:0;min-height:48px;padding:8px 5px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--aba-color-text-secondary,#475569);font-size:12px;font-weight:800;line-height:1.35;overflow-wrap:anywhere}
      .mobile-hr-nav button.active{border-color:var(--aba-color-primary-border,#99f6e4);background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary-strong,#115e59)}
      .mobile-hr-nav button:focus-visible,.employee-form-toggle:focus-visible{outline:3px solid var(--aba-color-focus-ring,#2563eb);outline-offset:2px}
      .employee-form-shell{min-width:0;margin-bottom:14px;padding:10px;border:1px solid var(--aba-color-border-subtle,#e2e8f0);border-radius:12px;background:var(--aba-color-surface-subtle,#f8fafc)}
      .employee-form-toggle{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:48px;padding:10px 12px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:10px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);font-size:13px;font-weight:800;text-align:start}
      .employee-form-toggle span:last-child{display:grid;flex:0 0 26px;width:26px;height:26px;place-items:center;border-radius:8px;background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary-strong,#115e59);font-size:19px}
      .employee-form{display:none;margin:12px 0 2px}
      .employee-panel .employee-form-shell:not(.is-open) .employee-form{display:none}
      .employee-form-shell.is-open .employee-form{display:grid}
      .employee-panel[data-mobile-section="employees"] [data-mobile-pane="prepare"],
      .employee-panel[data-mobile-section="employees"] [data-mobile-pane="history"],
      .employee-panel[data-mobile-section="prepare"] [data-mobile-pane="employees"],
      .employee-panel[data-mobile-section="prepare"] [data-mobile-pane="history"],
      .employee-panel[data-mobile-section="history"] [data-mobile-pane="employees"],
      .employee-panel[data-mobile-section="history"] [data-mobile-pane="prepare"]{display:none}
      .employee-row .actions,.payroll-row .actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;justify-content:stretch}
      .employee-row .actions button,.payroll-row .actions button{min-width:0;min-height:44px;padding:8px 9px;white-space:normal;overflow-wrap:anywhere}
      .employee-row .actions button:nth-child(3){grid-column:1/-1}
      .section-head{align-items:flex-start}
      .notice{align-items:flex-start;flex-direction:column}
      .list-row{grid-template-columns:32px minmax(0,1fr);align-items:start}
      .employee-tools,.payroll-history-filter{grid-template-columns:minmax(0,1fr)}
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

  @ViewChild('employeeFormToggle') private employeeFormToggle?: ElementRef<HTMLButtonElement>;
  @ViewChild('prepareHeading') private prepareHeading?: ElementRef<HTMLHeadingElement>;
  @ViewChild('historyHeading') private historyHeading?: ElementRef<HTMLHeadingElement>;

  employees: EmployeeRecord[] = [];
  payrollRecords: EmployeePayrollRecord[] = [];
  busy = false;
  error = '';
  message = '';
  employeeSearch = '';
  mobileSection: 'employees' | 'prepare' | 'history' = 'employees';
  employeeFormOpen = false;
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

  constructor(private readonly api: ApiService, private readonly localization: LocalizationService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['businessId'] && this.businessId) {
      // Clear every workspace-scoped salary value before loading the next workspace.
      this.loadSequence++;
      this.employees = [];
      this.payrollRecords = [];
      this.clearEmployeeForm();
      this.cancelPayrollEdit();
      this.employeeSearch = '';
      this.mobileSection = 'employees';
      this.employeeFormOpen = false;
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

  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }

  private focusAfterViewChange(target: 'employee-toggle' | 'prepare' | 'history'): void {
    setTimeout(() => {
      const element = target === 'employee-toggle'
        ? this.employeeFormToggle?.nativeElement
        : target === 'prepare'
          ? this.prepareHeading?.nativeElement
          : this.historyHeading?.nativeElement;
      if (element?.isConnected && element.getClientRects().length > 0) element.focus();
    }, 0);
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

  setMobileSection(section: 'employees' | 'prepare' | 'history'): void {
    this.mobileSection = section;
  }

  toggleEmployeeForm(): void {
    this.employeeFormOpen = !this.employeeFormOpen;
  }



  formatPayrollPayoutDate(value: string | null | undefined): string {
    if (!value || !Number.isFinite(Date.parse(value))) return '—';
    return new Intl.DateTimeFormat(this.localization.locale, {
      dateStyle: 'medium',
    }).format(new Date(value));
  }

  get employeeTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'name',label:this.t("ui.m_18mgrmo"),primary:true},
    {key:'code',label:this.t("ui.m_13ed6g7")},
    {key:'department',label:this.t("ui.m_fcawum")},
    {key:'jobTitle',label:this.t("ui.m_qfhcd5")},
    {key:'contact',label:this.t("ui.m_oj3j6c")},
    {key:'status',label:this.t("ui.m_jnmvwl"),kind:'status'},
  ]; }
  get employeeTableRows(): readonly AbaRecordTableRow[] { return this.filteredEmployees.map(employee=>({id:employee.id,cells:{
    name:employee.name,code:employee.employee_code||'—',department:employee.department||'—',
    jobTitle:employee.job_title||'—',contact:[employee.email,employee.phone].filter(Boolean).join(' · ')||'—',
    status:employee.is_active?this.t("ui.m_sjpv56"):this.t("ui.m_1200s7g"),
  },actions:[
    {id:'edit',label:this.t("ui.m_s21yyp"),disabled:this.busy},
    {id:'prepare',label:this.t("ui.m_1dxu3h"),disabled:this.busy||!employee.is_active},
    {id:'toggle',label:employee.is_active?this.t("ui.m_1m2o7qm"):this.t("ui.m_nu199a"),disabled:this.busy},
  ]})); }
  get payrollTableColumns(): readonly AbaRecordTableColumn[] { return [
    {key:'employee',label:this.t("ui.m_18mgrmo"),primary:true},
    {key:'period',label:this.t("ui.m_ziwhp0")},
    {key:'base',label:this.t("ui.m_7go201"),kind:'numeric'},
    {key:'additions',label:this.t("ui.m_s8dmdz"),kind:'numeric'},
    {key:'deductions',label:this.t("ui.m_oxttnb"),kind:'numeric'},
    {key:'net',label:this.t("ui.m_rym52c"),kind:'numeric'},
    {key:'status',label:this.t("ui.m_jnmvwl"),kind:'status'},
    {key:'payout',label:this.t("ui.m_y96e6r")},
  ]; }
  get payrollTableRows(): readonly AbaRecordTableRow[] { return this.payrollRecords.map(payroll=>({id:payroll.id,cells:{
    employee:payroll.employee_name,period:payroll.period,base:`${payroll.base_salary} ${this.currencyCode}`,
    additions:`${payroll.allowances} + ${payroll.bonuses} ${this.currencyCode}`,
    deductions:`${payroll.deductions} ${this.currencyCode}`,net:`${payroll.net_pay} ${this.currencyCode}`,
    status:this.payrollStatusLabel(payroll.status),payout:this.formatPayrollPayoutDate(payroll.paid_at),
  },actions:payroll.status==='draft'?[
    {id:'edit',label:this.t("ui.m_s0gv7p"),disabled:this.busy||!!this.operationId},
    {id:'approve',label:this.t("ui.m_1fxt7vn"),disabled:this.busy||!!this.operationId},
  ]:payroll.status==='approved'?[
    {id:'pay',label:this.t("ui.m_6uxmtn"),disabled:this.busy||!!this.operationId},
  ]:[]})); }
  onEmployeeRecordAction(action:AbaRecordTableActionEvent):void {
    const employee=this.filteredEmployees.find(item=>item.id===action.rowId); if(!employee)return;
    if(action.actionId==='edit')this.editEmployee(employee);
    else if(action.actionId==='prepare')this.preparePayroll(employee);
    else if(action.actionId==='toggle')void this.toggleEmployeeActive(employee);
  }
  onPayrollRecordAction(action:AbaRecordTableActionEvent):void {
    const payroll=this.payrollRecords.find(item=>item.id===action.rowId); if(!payroll||this.busy||this.operationId)return;
    if(action.actionId==='edit'&&payroll.status==='draft')this.editPayroll(payroll);
    else if(action.actionId==='approve'&&payroll.status==='draft')void this.approvePayroll(payroll);
    else if(action.actionId==='pay'&&payroll.status==='approved')void this.payPayroll(payroll);
  }

  payrollStatusLabel(status: EmployeePayrollRecord['status']): string {
    const keys: Record<EmployeePayrollRecord['status'], string> = {
      draft: 'app.payrollStatus.draft',
      approved: 'app.payrollStatus.approved',
      paid: 'app.payrollStatus.paid',
    };
    return this.t(keys[status]);
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
    return error instanceof Error ? error.message : this.t("ui.m_1ks1z7m");
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
    this.mobileSection = 'employees';
    this.employeeFormOpen = true;
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
    this.employeeFormOpen = false;
    this.focusAfterViewChange('employee-toggle');
  }

  async saveEmployee(): Promise<void> {
    const name = this.employeeName.trim();
    const monthlySalary = String(this.employeeMonthlySalary ?? '').trim();
    if (!this.businessId || !name || !this.employeeSalaryValid) {
      this.error = this.t("ui.m_1cpyz98");
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
      this.employeeFormOpen = false;
      this.focusAfterViewChange('employee-toggle');
      this.message = this.t("ui.m_1b25esl");
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
        ? this.t("ui.m_16aif5r")
        : this.t("ui.m_snw5ss");
      await this.loadEmployeesAndPayroll();
    } catch (error) {
      if (this.businessId === businessId) this.error = this.errorMessage(error);
    } finally {
      if (this.businessId === businessId) this.busy = false;
    }
  }

  preparePayroll(employee: EmployeeRecord): void {
    if (!employee.is_active) return;
    this.mobileSection = 'prepare';
    this.focusAfterViewChange('prepare');
    this.payrollEmployeeId = employee.id;
    this.editingPayrollId = null;
    this.payrollPeriod = this.currentPeriod();
    this.payrollAllowances = '0.00';
    this.payrollBonuses = '0.00';
    this.payrollDeductions = '0.00';
    this.message = this.t("ui.m_8iugq2");
    this.error = '';
  }

  editPayroll(record: EmployeePayrollRecord): void {
    if (record.status !== 'draft') return;
    this.mobileSection = 'prepare';
    this.focusAfterViewChange('prepare');
    this.editingPayrollId = record.id;
    this.payrollEmployeeId = record.employee_id;
    this.payrollPeriod = record.period;
    this.payrollAllowances = record.allowances;
    this.payrollBonuses = record.bonuses;
    this.payrollDeductions = record.deductions;
    this.message = this.t("ui.m_tvicvv");
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
      this.error = this.t("ui.m_5phvdg");
      return;
    }
    const amounts = [this.payrollAllowances, this.payrollBonuses, this.payrollDeductions]
      .map(value => Number(String(value ?? '').trim()));
    if (amounts.some(value => !Number.isFinite(value) || value < 0)) {
      this.error = this.t("ui.m_18po2rz");
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
        this.message = this.t("ui.m_1kw9p17");
      } else {
        await this.api.createPayroll(businessId, this.payrollEmployeeId, {
          period: this.payrollPeriod,
          allowances: String(this.payrollAllowances).trim(),
          bonuses: String(this.payrollBonuses).trim(),
          deductions: String(this.payrollDeductions).trim()
        });
        this.message = this.t("ui.m_1nhx55s");
      }
      if (this.businessId !== businessId) return;
      this.cancelPayrollEdit();
      this.mobileSection = 'history';
      this.focusAfterViewChange('history');
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
      this.message = this.t("ui.m_t0k8em");
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
      this.message = this.t("ui.m_i4zbum");
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
