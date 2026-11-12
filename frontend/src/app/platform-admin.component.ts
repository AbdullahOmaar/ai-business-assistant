import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ApiService, PlatformAdminAccess, PlatformAdminOverview, PlatformAuditEvent, PlatformAdminUser,
  PlatformAdminUsersPage, PlatformBusiness, PlatformBusinessDetails, PlatformMembership,
  PlatformRole, PlatformRoleAuditEvent, PlatformSystemStatus
} from './api.service';
import { hasMeaningfulPlatformAdminReason } from './platform-admin-helpers';
import { auditActionLabel as formatAuditActionLabel, auditTargetLabel as formatAuditTargetLabel } from './audit-labels';

type AdminSection = 'overview' | 'businesses' | 'activity' | 'users' | 'permissions';

@Component({
  selector: 'aba-platform-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="admin-shell" [class.english]="language === 'en'" [attr.lang]="language" [attr.dir]="language === 'ar' ? 'rtl' : 'ltr'">
      <header class="admin-header">
        <div class="heading">
          <p class="eyebrow">{{ t('إدارة المنصة', 'PLATFORM CONTROL PLANE') }}</p>
          <h1>{{ t('مركز الإدارة', 'Admin center') }}</h1>
          <p>{{ t('إشراف على مساحات العمل والنشاط التشغيلي دون تعديل السجلات المالية.', 'Monitor workspaces and operations without directly mutating financial records.') }}</p>
        </div>
        <div class="identity-actions">
          <div class="identity"><span class="avatar" aria-hidden="true">{{ initials }}</span><span><strong>{{ access?.is_platform_super_admin ? t('مسؤول المنصة الأساسي', 'Platform Super Admin') : t('مسؤول منصة مفوّض', 'Delegated Platform Admin') }}</strong><small>{{ userEmail || t('جلسة إدارية موثقة', 'Verified admin session') }}</small></span></div>
          <button class="quiet-button" type="button" (click)="languageToggleRequested.emit()" [attr.aria-label]="t('تغيير اللغة', 'Change language')">{{ language === 'ar' ? 'English' : 'العربية' }}</button>
          <button class="quiet-button signout" type="button" (click)="signOutRequested.emit()">{{ t('خروج', 'Sign out') }}</button>
        </div>
      </header>

      @if (access; as currentAccess) {
        <section class="identity-access-summary" [attr.aria-label]="t('هويتك وصلاحياتك الحالية', 'Your current identity and permissions')">
          <div class="identity-access-top">
            <div class="identity-access-heading"><strong>{{ t('حسابك الإداري الحالي', 'Your current admin identity') }}</strong><small class="user-uid">{{ currentAccess.subject }}</small></div>
            <div class="identity-role-pills">@for (role of currentAccess.roles; track role) { <span class="role-pill" [class.accent]="role === 'platform_super_admin'">{{ platformRoleLabel(role) }}</span> }</div>
          </div>
          <div class="identity-permissions"><strong>{{ t('مسموح لك بـ', 'Your effective permissions') }}</strong><div class="identity-permission-tags">@for (permission of currentAccess.permissions; track permission) { <span class="permission-token">{{ platformPermissionLabel(permission) }}</span> }</div></div>
        </section>
      }

      @if (pageError) {
        <div class="notice error" role="alert"><span>{{ pageError }}</span><button type="button" class="text-action" (click)="refreshAll()">{{ t('إعادة المحاولة', 'Retry') }}</button></div>
      }
      @if (successMessage) {
        <div class="notice success" role="status" aria-live="polite">{{ successMessage }}</div>
      }

      <nav class="section-nav" [attr.aria-label]="t('أقسام إدارة المنصة', 'Platform administration sections')">
        <button type="button" [class.active]="section === 'overview'" [attr.aria-current]="section === 'overview' ? 'page' : null" (click)="setSection('overview')"><span aria-hidden="true">◫</span>{{ t('نظرة عامة', 'Overview') }}</button>
        <button type="button" [class.active]="section === 'businesses'" [attr.aria-current]="section === 'businesses' ? 'page' : null" (click)="setSection('businesses')"><span aria-hidden="true">▦</span>{{ t('مساحات العمل', 'Workspaces') }}<span class="nav-count">{{ overview?.businesses?.total ?? '—' }}</span></button>
        <button type="button" [class.active]="section === 'activity'" [attr.aria-current]="section === 'activity' ? 'page' : null" (click)="setSection('activity')"><span aria-hidden="true">◷</span>{{ t('سجل التدقيق', 'Audit activity') }}</button>
        @if (canViewUsers) { <button type="button" [class.active]="section === 'users'" [attr.aria-current]="section === 'users' ? 'page' : null" (click)="setSection('users')"><span aria-hidden="true">♙</span>{{ t('المستخدمون والصلاحيات', 'Users & access') }}<span class="nav-count">{{ users.length || '—' }}</span></button> }
        <button type="button" [class.active]="section === 'permissions'" [attr.aria-current]="section === 'permissions' ? 'page' : null" (click)="setSection('permissions')"><span aria-hidden="true">◇</span>{{ t('الصلاحيات', 'Permissions') }}</button>
      </nav>

      @if (section === 'overview') {
        <section class="section-content" aria-labelledby="overview-title">
          <div class="section-heading">
            <div><p class="eyebrow">{{ t('صورة لحظية', 'LIVE SNAPSHOT') }}</p><h2 id="overview-title">{{ t('مؤشرات المنصة', 'Platform metrics') }}</h2><p>{{ t('أرقام مستخرجة من قاعدة البيانات، وليست بيانات عرض تجريبية.', 'Values queried from the database, not demo data.') }}</p></div>
            <button class="outline-button" type="button" [disabled]="overviewLoading" (click)="refreshOverview()">{{ overviewLoading ? t('جارٍ التحديث…', 'Refreshing…') : t('تحديث البيانات', 'Refresh data') }}</button>
          </div>
          @if (overviewLoading && !overview) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t('جارٍ جلب المؤشرات من الخادم…', 'Loading live metrics from the server…') }}</div> }
          @if (overviewError && !overviewLoading) { <div class="notice error" role="alert">{{ overviewError }} <button class="text-action" type="button" (click)="refreshOverview()">{{ t('إعادة المحاولة', 'Retry') }}</button></div> }
          <article class="panel system-status-panel" aria-labelledby="system-status-title">
            <div class="panel-heading">
              <div><p class="eyebrow">{{ t('صحة التشغيل', 'RUNTIME HEALTH') }}</p><h3 id="system-status-title">{{ t('حالة النظام والإصدار', 'System status & release') }}</h3><p>{{ t('فحص آمن للجاهزية دون عرض أسرار أو بيانات عملاء.', 'Safe readiness checks without exposing secrets or customer data.') }}</p></div>
              <button type="button" class="outline-button" [disabled]="systemStatusLoading" (click)="refreshSystemStatus()">{{ systemStatusLoading ? t('جارٍ الفحص…', 'Checking…') : t('فحص الآن', 'Check now') }}</button>
            </div>
            @if (systemStatusLoading && !systemStatus) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t('جارٍ فحص الاعتمادات…', 'Checking dependencies…') }}</div> }
            @if (systemStatusError) { <div class="notice error" role="alert">{{ systemStatusError }} <button type="button" class="text-action" (click)="refreshSystemStatus()">{{ t('إعادة المحاولة', 'Retry') }}</button></div> }
            @if (systemStatus; as runtime) {
              <div class="runtime-summary">
                <span class="status-pill" [class.status-active]="runtime.status === 'healthy'" [class.status-inactive]="runtime.status !== 'healthy'">{{ runtime.status === 'healthy' ? t('سليم', 'Healthy') : t('يحتاج مراجعة', 'Degraded') }}</span>
                <span>{{ t('آخر فحص', 'Last checked') }}: {{ formatDate(runtime.checked_at) }}</span>
              </div>
              <div class="runtime-grid">
                <div><small>{{ t('إصدار API', 'API version') }}</small><strong>{{ runtime.release.version }}</strong></div>
                <div><small>{{ t('معرّف الإصدار', 'Commit') }}</small><strong class="runtime-commit">{{ runtime.release.commit }}</strong></div>
                <div><small>{{ t('البيئة', 'Environment') }}</small><strong>{{ runtime.release.environment }}</strong></div>
                <div><small>{{ t('قاعدة البيانات', 'Database') }}</small><strong [class.runtime-good]="runtime.dependencies.database === 'healthy'" [class.runtime-bad]="runtime.dependencies.database !== 'healthy'">{{ dependencyStatusLabel(runtime.dependencies.database) }}</strong></div>
                <div><small>{{ t('التحقق من الهوية', 'Identity verifier') }}</small><strong [class.runtime-good]="runtime.dependencies.identity_verifier === 'configured'" [class.runtime-bad]="runtime.dependencies.identity_verifier !== 'configured'">{{ dependencyStatusLabel(runtime.dependencies.identity_verifier) }}</strong></div>
              </div>
              <p class="runtime-note">{{ t('حالة التحقق تعني أن الإعداد موجود، ولا تثبت صحة رمز مستخدم بعينه.', 'Verifier status means configuration exists; it does not validate an individual user token.') }}</p>
            }
          </article>
          @if (overview; as data) {
            <div class="metric-grid">
              <article class="metric-card"><div class="metric-icon teal" aria-hidden="true">▦</div><span>{{ t('مساحات العمل', 'Workspaces') }}</span><strong>{{ data.businesses.total }}</strong><small>{{ data.businesses.active }} {{ t('نشطة', 'active') }} · {{ data.businesses.inactive }} {{ t('معطّلة', 'inactive') }}</small></article>
              <article class="metric-card"><div class="metric-icon blue" aria-hidden="true">♙</div><span>{{ t('هويات مرتبطة بعضوية', 'Member identities') }}</span><strong>{{ data.users.distinct_subjects }}</strong><small>{{ data.users.memberships }} {{ t('عضوية مساحة عمل', 'workspace memberships') }}</small></article>
              <article class="metric-card"><div class="metric-icon violet" aria-hidden="true">▤</div><span>{{ t('الفواتير', 'Invoices') }}</span><strong>{{ data.invoices.count }}</strong><small>{{ t('مسودات وصادرة وملغاة ضمن كل العملات', 'Draft, issued, and void across currencies') }}</small></article>
              <article class="metric-card"><div class="metric-icon amber" aria-hidden="true">↗</div><span>{{ t('سجلات المدفوعات', 'Payment records') }}</span><strong>{{ data.payments.count }}</strong><small>{{ data.audit_events.count }} {{ t('حدث تدقيق', 'audit events') }}</small></article>
            </div>
            <div class="content-grid">
              <article class="panel">
                <div class="panel-heading"><div><h3>{{ t('مدفوعات حسب العملة', 'Payments by currency') }}</h3><p>{{ t('قراءة فقط · لا يتم جمع العملات المختلفة', 'Read-only · currencies are never combined') }}</p></div><span class="read-only">{{ t('قراءة فقط', 'READ ONLY') }}</span></div>
                @if (data.payments.by_currency.length) {
                  <div class="currency-list">
                    @for (row of data.payments.by_currency; track row.currency_code) {
                      <div class="currency-row"><div><strong>{{ row.currency_code }}</strong><small>{{ row.count }} {{ t('سجل', 'records') }}</small></div><strong class="amount">{{ money(row.total) }} <span>{{ row.currency_code }}</span></strong></div>
                    }
                  </div>
                } @else { <p class="empty-state">{{ t('لا توجد سجلات مدفوعات في قاعدة البيانات.', 'No payment records found.') }}</p> }
              </article>
              <article class="panel">
                <div class="panel-heading"><div><h3>{{ t('حالات الفواتير', 'Invoice status') }}</h3><p>{{ t('عدد وإجمالي كل حالة مع فصل العملة', 'Counts and totals grouped by currency and status') }}</p></div></div>
                @if (data.invoices.by_currency_and_status.length) {
                  <div class="table-wrap compact-table" role="region" tabindex="0" [attr.aria-label]="t('ملخص الفواتير حسب العملة والحالة', 'Invoice summary by currency and status')"><table><thead><tr><th>{{ t('العملة', 'Currency') }}</th><th>{{ t('الحالة', 'Status') }}</th><th>{{ t('عدد', 'Count') }}</th><th>{{ t('الإجمالي', 'Total') }}</th></tr></thead><tbody>
                    @for (row of data.invoices.by_currency_and_status; track row.currency_code + row.status) {
                      <tr><td [attr.data-label]="t('العملة', 'Currency')"><strong>{{ row.currency_code }}</strong></td><td [attr.data-label]="t('الحالة', 'Status')"><span class="status-pill">{{ statusLabel(row.status) }}</span></td><td [attr.data-label]="t('عدد', 'Count')">{{ row.count }}</td><td class="amount" [attr.data-label]="t('الإجمالي', 'Total')">{{ money(row.total) }}</td></tr>
                    }
                  </tbody></table></div>
                } @else { <p class="empty-state">{{ t('لا توجد فواتير مسجلة.', 'No invoice records found.') }}</p> }
              </article>
            </div>
            <div class="data-note"><span aria-hidden="true">ⓘ</span><div><strong>{{ t('حدود البيانات', 'Data boundaries') }}</strong><p>{{ t('عدد المستخدمين يقتصر على الهويات التي لها عضوية مساحة عمل؛ لا تتاح قائمة حسابات Firebase كاملة. العمليات المالية هنا للعرض فقط.', 'User counts cover identities with workspace memberships; a complete Firebase user directory is not available. Financial operations are read-only here.') }}</p><small>{{ t('آخر تحديث', 'Last updated') }}: {{ formatDate(data.generated_at) }}</small></div></div>
          }
        </section>
      }

      @if (section === 'businesses') {
        <section class="section-content" aria-labelledby="businesses-title">
          <div class="section-heading"><div><p class="eyebrow">{{ t('دليل موحد', 'CENTRAL DIRECTORY') }}</p><h2 id="businesses-title">{{ t('مساحات العمل', 'Workspaces') }}</h2><p>{{ t('بحث وتصنيف وتفاصيل العضويات وإدارة حالة الوصول مع تسجيل السبب.', 'Search, filter, inspect memberships, and change access status with an audit reason.') }}</p></div><button class="outline-button" type="button" [disabled]="businessesLoading" (click)="loadBusinesses(businessOffset)">{{ t('تحديث القائمة', 'Refresh list') }}</button></div>
          <form class="filters" (ngSubmit)="loadBusinesses(0)">
            <label class="search-field"><span>{{ t('بحث', 'Search') }}</span><input name="businessSearch" [(ngModel)]="businessQuery" maxlength="160" [placeholder]="t('اسم الشركة أو البريد أو الهاتف', 'Company, email, or phone')" /></label>
            <label><span>{{ t('حالة الوصول', 'Access status') }}</span><select name="businessStatus" [(ngModel)]="businessStatus"><option value="all">{{ t('كل الحالات', 'All statuses') }}</option><option value="active">{{ t('نشطة', 'Active') }}</option><option value="inactive">{{ t('معطّلة', 'Inactive') }}</option></select></label>
            <label><span>{{ t('ترتيب حسب', 'Sort by') }}</span><select name="businessSortBy" [(ngModel)]="businessSortBy"><option value="created_at">{{ t('تاريخ الإنشاء', 'Creation date') }}</option><option value="name">{{ t('اسم مساحة العمل', 'Workspace name') }}</option><option value="members">{{ t('عدد الأعضاء', 'Member count') }}</option></select></label>
            <label><span>{{ t('اتجاه الترتيب', 'Sort direction') }}</span><select name="businessSortOrder" [(ngModel)]="businessSortOrder"><option value="desc">{{ t('تنازلي', 'Descending') }}</option><option value="asc">{{ t('تصاعدي', 'Ascending') }}</option></select></label>
            <button class="primary-button" type="submit" [disabled]="businessesLoading">{{ t('تطبيق', 'Apply') }}</button>
          </form>
          @if (businessesLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t('جارٍ تحميل مساحات العمل…', 'Loading workspaces…') }}</div> }
          @if (businessesError) { <div class="notice error" role="alert">{{ businessesError }} <button class="text-action" type="button" (click)="loadBusinesses(businessOffset)">{{ t('إعادة المحاولة', 'Retry') }}</button></div> }
          @if (!businessesLoading && !businessesError && !businesses.length) { <div class="empty-panel"><span class="empty-icon" aria-hidden="true">▦</span><h3>{{ businessQuery.trim() || businessStatus !== 'all' ? t('لا توجد مساحات عمل مطابقة', 'No matching workspaces') : businessOffset > 0 ? t('لا توجد مساحات عمل في هذه الصفحة', 'No workspaces on this page') : t('لا توجد مساحات عمل مسجلة بعد', 'No workspaces are registered yet') }}</h3><p>{{ businessQuery.trim() || businessStatus !== 'all' ? t('جرّب تغيير البحث أو حالة الوصول.', 'Try changing the search term or access status.') : businessOffset > 0 ? t('ارجع إلى الصفحة الأولى لعرض مساحات العمل المتاحة.', 'Return to the first page to browse available workspaces.') : t('ستظهر مساحات العمل هنا بعد تسجيلها.', 'Workspaces will appear here once registered.') }}</p></div> }
          @if (businesses.length) {
            <div class="table-wrap" role="region" tabindex="0" [attr.aria-label]="t('قائمة مساحات العمل، جدول قابل للتمرير أفقيًا', 'Workspace directory, horizontally scrollable table')"><table><thead><tr><th>{{ t('مساحة العمل', 'Workspace') }}</th><th>{{ t('الحالة', 'Status') }}</th><th>{{ t('العملة', 'Currency') }}</th><th>{{ t('الأعضاء', 'Members') }}</th><th>{{ t('تاريخ الإنشاء', 'Created') }}</th><th>{{ t('إجراء', 'Action') }}</th></tr></thead><tbody>
              @for (item of businesses; track item.id) {
                <tr><td [attr.data-label]="t('مساحة العمل', 'Workspace')"><button type="button" class="business-link" (click)="openBusiness(item)"><strong>{{ item.name }}</strong><small>{{ item.contact_email || item.phone || item.id }}</small></button></td><td [attr.data-label]="t('الحالة', 'Status')"><span class="status-pill" [class.status-active]="item.is_active" [class.status-inactive]="!item.is_active"><span class="status-dot"></span>{{ item.is_active ? t('نشطة', 'Active') : t('معطّلة', 'Inactive') }}</span></td><td [attr.data-label]="t('العملة', 'Currency')">{{ item.currency_code }}</td><td [attr.data-label]="t('الأعضاء', 'Members')">{{ item.member_count }}</td><td [attr.data-label]="t('تاريخ الإنشاء', 'Created')">{{ formatDate(item.created_at) }}</td><td [attr.data-label]="t('إجراء', 'Action')"><button type="button" class="outline-button small-button" (click)="openBusiness(item)">{{ t('التفاصيل', 'Details') }}</button></td></tr>
              }
            </tbody></table></div>
            <div class="pagination"><span>{{ t('عرض', 'Showing') }} {{ businesses.length ? businessOffset + 1 : 0 }}–{{ businessOffset + businesses.length }} {{ t('من', 'of') }} {{ businessTotal }}</span><div><button type="button" class="outline-button" [disabled]="businessOffset === 0 || businessesLoading" (click)="loadBusinesses(previousPageOffset(businessOffset))">{{ t('السابق', 'Previous') }}</button><button type="button" class="outline-button" [disabled]="businessOffset + pageSize >= businessTotal || businessesLoading" (click)="loadBusinesses(businessOffset + pageSize)">{{ t('التالي', 'Next') }}</button></div></div>
          }
          @if (detailsLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t('جارٍ تحميل التفاصيل…', 'Loading details…') }}</div> }
          @if (detailsError) { <div class="notice error" role="alert">{{ detailsError }}</div> }
          @if (selectedDetails; as detail) {
            <article class="panel detail-panel">
              <div class="panel-heading"><div><p class="eyebrow">{{ t('ملف مساحة العمل', 'WORKSPACE PROFILE') }}</p><h3>{{ detail.business.name }}</h3><p>{{ detail.business.id }}</p></div><button type="button" class="quiet-button" (click)="closeDetails()" [attr.aria-label]="t('إغلاق التفاصيل', 'Close details')">✕</button></div>
              <div class="detail-grid"><div><small>{{ t('الحالة', 'Status') }}</small><strong>{{ detail.business.is_active ? t('نشطة', 'Active') : t('معطّلة', 'Inactive') }}</strong></div><div><small>{{ t('العملة', 'Currency') }}</small><strong>{{ detail.business.currency_code }}</strong></div><div><small>{{ t('المنطقة الزمنية', 'Timezone') }}</small><strong>{{ detail.business.timezone }}</strong></div><div><small>{{ t('اللغة', 'Locale') }}</small><strong>{{ detail.business.locale }}</strong></div><div><small>{{ t('تاريخ الإنشاء', 'Created at') }}</small><strong>{{ formatDate(detail.business.created_at) }}</strong></div><div><small>{{ t('البريد', 'Contact email') }}</small><strong>{{ detail.business.contact_email || '—' }}</strong></div></div>
              <div class="divider"></div>
              <div class="panel-heading"><div><h3>{{ t('عضويات مساحة العمل', 'Workspace memberships') }}</h3><p>{{ t('لا تظهر كلمات مرور أو رموز جلسات. أسماء الملفات غير متاحة في نموذج البيانات الحالي.', 'No passwords or session tokens are exposed. Profile names are not available in the current data model.') }}</p></div><span class="read-only">{{ detail.memberships.length }} {{ t('عضوية', 'memberships') }}</span></div>
              @if (detail.memberships.length) {
                <div class="table-wrap compact-table" role="region" tabindex="0" [attr.aria-label]="t('أعضاء مساحة العمل', 'Workspace memberships')"><table><thead><tr><th>{{ t('هوية المستخدم', 'User subject') }}</th><th>{{ t('الدور', 'Role') }}</th><th>{{ t('تاريخ الانضمام', 'Joined') }}</th></tr></thead><tbody>
                  @for (member of detail.memberships; track member.id) { <tr><td class="subject" [attr.data-label]="t('هوية المستخدم', 'User subject')">{{ member.user_subject }}</td><td [attr.data-label]="t('الدور', 'Role')"><span class="role-pill">{{ roleLabel(member.role) }}</span></td><td [attr.data-label]="t('تاريخ الانضمام', 'Joined')">{{ formatDate(member.created_at) }}</td></tr> }
                </tbody></table></div>
              } @else { <p class="empty-state">{{ t('لا توجد عضويات.', 'No memberships found.') }}</p> }
              <div class="caution"><strong>{{ t('إدارة الوصول إلى مساحة العمل', 'Workspace access control') }}</strong><p>{{ t('تعطيل مساحة العمل يمنع الوصول إلى بياناتها عبر تحقق العضوية. لا يؤدي ذلك إلى حذف الشركة أو سجلاتها.', 'Deactivating a workspace blocks membership-based access to its data. It does not delete the company or its records.') }}</p></div>
              @if (canManageWorkspaceStatus) {
                <form class="status-form" (ngSubmit)="updateBusinessStatus()">
                  <label><span>{{ t('الحالة المطلوبة', 'Desired status') }}</span><select name="desiredStatus" [(ngModel)]="desiredStatus"><option [ngValue]="true">{{ t('تفعيل الوصول', 'Activate access') }}</option><option [ngValue]="false">{{ t('تعطيل الوصول', 'Deactivate access') }}</option></select></label>
                  <label class="reason-field"><span>{{ t('سبب إداري مطلوب', 'Required administrative reason') }}</span><textarea name="statusReason" [(ngModel)]="statusReason" maxlength="500" minlength="3" required rows="2" [placeholder]="t('اكتب سببًا واضحًا لتوثيقه في سجل التدقيق', 'Enter a meaningful reason; it will be recorded in the audit log')"></textarea></label>
                  <button type="submit" class="primary-button" [disabled]="statusSaving || desiredStatus === detail.business.is_active">{{ statusSaving ? t('جارٍ حفظ التغيير…', 'Saving…') : (desiredStatus ? t('تأكيد تفعيل الوصول', 'Confirm activation') : t('تأكيد تعطيل الوصول', 'Confirm deactivation')) }}</button>
                  @if (statusError) { <p class="field-error" role="alert">{{ statusError }}</p> }
                </form>
              } @else {
                <div class="notice" role="note">{{ t('صلاحية قراءة فقط: يمكنك مراجعة حالة مساحة العمل وعضوياتها، لكن تغيير حالتها يحتاج دور مشغّل مساحات العمل.', 'Read-only access: you can inspect workspace status and memberships, but changing status requires the Workspace Operator role.') }}</div>
              }
            </article>
          }
        </section>
      }

      @if (section === 'activity') {
        <section class="section-content" aria-labelledby="activity-title">
          <div class="section-heading"><div><p class="eyebrow">{{ t('سجل غير قابل للتعديل من الشاشة', 'READ-ONLY RECORD') }}</p><h2 id="activity-title">{{ t('سجل التدقيق والأمان', 'Audit & security activity') }}</h2><p>{{ t('أحداث إدارية من جميع مساحات العمل، للعرض والمراجعة فقط.', 'Administrative events across workspaces, for review only.') }}</p></div><div class="heading-actions"><button type="button" class="outline-button" [disabled]="auditLoading" (click)="loadAudit(auditOffset)">{{ t('تحديث', 'Refresh') }}</button><button type="button" class="primary-button" [disabled]="auditExporting" (click)="exportAudit()">{{ auditExporting ? t('جارٍ التصدير…', 'Exporting…') : t('تصدير CSV', 'Export CSV') }}</button></div></div>
          @if (auditExportError) { <div class="notice error" role="alert">{{ auditExportError }}</div> }
          @if (auditExportMessage) { <div class="notice success" role="status" aria-live="polite">{{ auditExportMessage }}</div> }
          <form class="filters audit-filters" (ngSubmit)="loadAudit(0)"><label class="search-field"><span>{{ t('نوع العملية', 'Action') }}</span><input name="auditAction" maxlength="80" [(ngModel)]="auditAction" [placeholder]="t('مثال: platform.business.deactivated', 'e.g. platform.business.deactivated')"></label><label><span>{{ t('هوية المنفّذ', 'Actor identity') }}</span><input name="auditActor" maxlength="128" [(ngModel)]="auditActor" [placeholder]="t('هوية Firebase الموثقة', 'Verified Firebase subject')"></label><label><span>{{ t('معرّف مساحة العمل', 'Workspace ID') }}</span><input name="auditBusinessId" maxlength="36" [(ngModel)]="auditBusinessId" placeholder="UUID"></label><label><span>{{ t('من تاريخ ووقت', 'Created after') }}</span><input type="datetime-local" name="auditFrom" [(ngModel)]="auditFrom"></label><label><span>{{ t('إلى تاريخ ووقت', 'Created before') }}</span><input type="datetime-local" name="auditTo" [(ngModel)]="auditTo"></label><button type="submit" class="primary-button" [disabled]="auditLoading">{{ t('تصفية', 'Filter') }}</button></form>
          @if (auditLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t('جارٍ تحميل سجل التدقيق…', 'Loading audit events…') }}</div> }
          @if (auditError) { <div class="notice error" role="alert">{{ auditError }} <button type="button" class="text-action" (click)="loadAudit(auditOffset)">{{ t('إعادة المحاولة', 'Retry') }}</button></div> }
          @if (!auditLoading && !auditError && !auditEvents.length) { <div class="empty-panel"><span class="empty-icon" aria-hidden="true">◷</span><h3>{{ t('لا توجد أحداث مطابقة', 'No matching events') }}</h3><p>{{ t('سيظهر هنا نشاط الإدارة المسجل.', 'Recorded admin activity will appear here.') }}</p></div> }
          @if (auditEvents.length) {
            <div class="table-wrap" role="region" tabindex="0" [attr.aria-label]="t('سجل نشاط المنصة، جدول قابل للتمرير أفقيًا', 'Platform activity log, horizontally scrollable table')"><table><thead><tr><th>{{ t('التاريخ', 'Timestamp') }}</th><th>{{ t('العملية', 'Action') }}</th><th>{{ t('الشركة', 'Workspace') }}</th><th>{{ t('المنفذ', 'Actor') }}</th><th>{{ t('الكيان', 'Target') }}</th><th>{{ t('الملخص', 'Summary') }}</th></tr></thead><tbody>
              @for (event of auditEvents; track event.id) { <tr><td class="date-cell" [attr.data-label]="t('التاريخ', 'Timestamp')">{{ formatDate(event.created_at) }}</td><td [attr.data-label]="t('العملية', 'Action')"><span class="status-pill">{{ auditActionLabel(event.action) }}</span></td><td [attr.data-label]="t('الشركة', 'Workspace')"><strong>{{ event.business_name }}</strong><small class="muted">{{ event.business_id }}</small></td><td class="subject" [attr.data-label]="t('المنفذ', 'Actor')">{{ event.actor_subject || '—' }}</td><td [attr.data-label]="t('الكيان', 'Target')">{{ auditTargetLabel(event.target_type) }}<small class="muted">{{ event.target_id || '—' }}</small></td><td class="summary-cell" [attr.data-label]="t('الملخص', 'Summary')">{{ event.change_summary || '—' }}</td></tr> }
            </tbody></table></div>
            <div class="pagination"><span>{{ t('عرض', 'Showing') }} {{ auditOffset + 1 }}–{{ auditOffset + auditEvents.length }} {{ t('من', 'of') }} {{ auditTotal }}</span><div><button type="button" class="outline-button" [disabled]="auditOffset === 0 || auditLoading" (click)="loadAudit(previousPageOffset(auditOffset))">{{ t('السابق', 'Previous') }}</button><button type="button" class="outline-button" [disabled]="auditOffset + pageSize >= auditTotal || auditLoading" (click)="loadAudit(auditOffset + pageSize)">{{ t('التالي', 'Next') }}</button></div></div>
          }
        </section>
      }


      @if (section === 'users' && canViewUsers) {
        <section class="section-content" aria-labelledby="users-title">
          <div class="section-heading">
            <div><p class="eyebrow">{{ t('هوية موحدة', 'AUTHORITATIVE IDENTITY DIRECTORY') }}</p><h2 id="users-title">{{ t('المستخدمون والصلاحيات', 'Users & access') }}</h2><p>{{ t('كل حسابات Firebase، حتى المستخدمين الذين لا ينتمون لأي مساحة عمل، مع عرض عضوياتهم وصلاحيات المنصة بشكل منفصل.', 'All Firebase accounts, including users without a workspace, with workspace memberships and platform permissions shown separately.') }}</p></div>
            <button class="outline-button" type="button" [disabled]="usersLoading" (click)="loadUsers(0, true)">{{ t('تحديث المستخدمين', 'Refresh users') }}</button>
          </div>
          <div class="data-note"><span aria-hidden="true">ⓘ</span><div><strong>{{ t('مصدر الهوية والصلاحيات', 'Identity and permissions source') }}</strong><p>{{ t('دليل الحسابات مصدره Firebase Auth. صلاحيات المنصة تُقرأ من الخادم؛ أدوار مالك/موظف تخص مساحة العمل فقط ولا تمنح صلاحية منصة تلقائيًا.', 'Firebase Auth is the identity source. Platform roles are resolved on the server; workspace owner/staff roles never grant platform access automatically.') }}</p><small>{{ t('لا يتم عرض كلمات مرور أو رموز دخول. البحث بالبريد أو UID تطابق دقيق، والتصفح يعرض كل الحسابات على صفحات.', 'Passwords and auth tokens are never displayed. Email/UID search is exact; blank search cursor-paginates all accounts.') }}</small></div></div>
          <form class="filters" (ngSubmit)="searchUsers()">
            <label class="search-field"><span>{{ t('البريد الإلكتروني أو UID', 'Email address or UID') }}</span><input name="userQuery" maxlength="254" [(ngModel)]="userQuery" [placeholder]="t('اكتب بريدًا كاملًا أو UID', 'Enter exact email or UID')"></label>
            <button type="submit" class="primary-button" [disabled]="usersLoading">{{ t('بحث', 'Search') }}</button>
            @if (userQuery) { <button type="button" class="outline-button" [disabled]="usersLoading" (click)="userQuery=''; searchUsers()">{{ t('عرض الكل', 'Show all') }}</button> }
          </form>
          @if (usersLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t('جارٍ تحميل الحسابات من Firebase…', 'Loading accounts from Firebase…') }}</div> }
          @if (usersError) { <div class="notice error" role="alert">{{ usersError }} <button type="button" class="text-action" (click)="loadUsers(userPageIndex)">{{ t('إعادة المحاولة', 'Retry') }}</button></div> }
          @if (!usersLoading && !usersError && !users.length) { <div class="empty-panel"><span class="empty-icon" aria-hidden="true">♙</span><h3>{{ userQuery.trim() ? t('لا توجد حسابات مطابقة', 'No matching accounts') : t('لا توجد حسابات مسجلة بعد', 'No user accounts are registered yet') }}</h3><p>{{ userQuery.trim() ? t('جرّب بريدًا كاملًا أو UID صحيحًا، أو امسح البحث لعرض القائمة.', 'Try an exact email or UID, or clear search to browse the directory.') : t('ستظهر حسابات Firebase المسجلة هنا عند توفرها.', 'Registered Firebase accounts will appear here when available.') }}</p></div> }
          @if (!usersLoading && users.length) {
            <div class="table-wrap" role="region" tabindex="0" [attr.aria-label]="t('دليل المستخدمين، جدول قابل للتمرير أفقيًا', 'User directory, horizontally scrollable table')">
              <table class="user-directory-table">
                <thead><tr><th>{{ t('المستخدم', 'User') }}</th><th>{{ t('حالة الحساب', 'Account status') }}</th><th>{{ t('صلاحيات المنصة', 'Platform roles') }}</th><th>{{ t('مساحات العمل', 'Workspace memberships') }}</th><th>{{ t('الإجراء', 'Action') }}</th></tr></thead>
                <tbody>
                  @for (user of users; track user.uid) {
                    <tr [class.selected-row]="selectedAdminUser?.uid === user.uid">
                      <td class="user-cell" [attr.data-label]="t('المستخدم', 'User')"><strong>{{ user.display_name || t('بدون اسم عرض', 'No display name') }}</strong><small>{{ user.email || t('لا يوجد بريد مسجل', 'No email on record') }}</small><small class="user-uid">{{ user.uid }}</small>@if (user.email) { <small>{{ user.email_verified ? t('البريد موثق', 'Email verified') : t('البريد غير موثق', 'Email not verified') }}</small> }</td>
                      <td [attr.data-label]="t('حالة الحساب', 'Account status')"><span class="status-pill" [class.runtime-good]="!user.disabled" [class.runtime-bad]="user.disabled">{{ user.disabled ? t('معطّل', 'Disabled') : t('نشط', 'Active') }}</span>@if (user.is_platform_super_admin) { <small class="user-root-label">{{ t('مسؤول الجذر', 'Bootstrap super admin') }}</small> }</td>
                      <td [attr.data-label]="t('صلاحيات المنصة', 'Platform roles')"><div class="user-role-list">@if (user.is_platform_super_admin) { <span class="role-pill accent">{{ t('مسؤول المنصة الأساسي', 'Platform Super Admin') }}</span> } @else if (user.roles.length) { @for (role of user.roles; track role) { <span class="role-pill" [title]="platformRoleDescription(role)">{{ platformRoleLabel(role) }}</span> } } @else { <span class="muted">{{ t('لا توجد صلاحية منصة', 'No platform role') }}</span> }</div></td>
                      <td [attr.data-label]="t('مساحات العمل', 'Workspace memberships')"><div class="membership-list">@if (user.memberships.length) { @for (membership of user.memberships; track membership.business_id) { <span class="membership-chip"><strong>{{ membership.business_name }}</strong><small>{{ membership.role === 'owner' ? t('مالك مساحة', 'Workspace owner') : t('موظف', 'Staff') }}</small></span> } } @else { <span class="muted">{{ t('لا ينتمي لمساحة عمل', 'No workspace membership') }}</span> }</div></td>
                      <td [attr.data-label]="t('الإجراء', 'Action')"><button class="outline-button small-button" type="button" [class.active]="selectedAdminUser?.uid === user.uid" (click)="selectAdminUser(user)">{{ selectedAdminUser?.uid === user.uid ? t('محدد', 'Selected') : t('التفاصيل', 'Details') }}</button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="pagination"><span>{{ t('صفحة', 'Page') }} {{ userPageIndex + 1 }} · {{ users.length }} {{ t('حساب في الصفحة', 'accounts on this page') }}@if (userSearchMode === 'exact_email_or_uid') { · {{ t('بحث دقيق', 'Exact lookup') }} }</span><div><button type="button" class="outline-button" [disabled]="userPageIndex === 0 || usersLoading" (click)="previousUsersPage()">{{ t('السابق', 'Previous') }}</button><button type="button" class="outline-button" [disabled]="!userNextPageToken || usersLoading" (click)="nextUsersPage()">{{ t('التالي', 'Next') }}</button></div></div>
          }
          @if (selectedAdminUser) {
            <article class="panel user-access-panel" aria-labelledby="selected-user-title">
              <div class="section-heading"><div><p class="eyebrow">{{ t('هوية المستخدم', 'USER IDENTITY') }}</p><h3 id="selected-user-title">{{ selectedAdminUser.display_name || selectedAdminUser.email || selectedAdminUser.uid }}</h3><p class="user-uid">{{ selectedAdminUser.subject }}</p></div><button class="quiet-button" type="button" (click)="selectedAdminUser = null">{{ t('إغلاق التفاصيل', 'Close details') }}</button></div>
              <div class="user-facts-grid"><div><small>{{ t('تاريخ إنشاء الحساب', 'Account created') }}</small><strong>{{ formatDate(selectedAdminUser.created_at) }}</strong></div><div><small>{{ t('آخر تسجيل دخول', 'Last sign-in') }}</small><strong>{{ formatDate(selectedAdminUser.last_sign_in_at) }}</strong></div><div><small>{{ t('حالة الحساب', 'Account state') }}</small><strong>{{ selectedAdminUser.disabled ? t('معطّل', 'Disabled') : t('نشط', 'Active') }}</strong></div><div><small>{{ t('نوع الصلاحية', 'Access type') }}</small><strong>{{ selectedAdminUser.is_platform_super_admin ? t('مسؤول جذر بإعداد الخادم', 'Server-configured root admin') : selectedAdminUser.roles.length ? t('دور منصة مفوّض', 'Delegated platform role') : t('مستخدم عادي', 'Regular user') }}</strong></div></div>
              @if (selectedAdminUser.is_platform_super_admin) {
                <div class="notice warn" role="note">{{ t('هذه الهوية ضمن قائمة مسؤول الجذر التي تُدار خارج التطبيق. لا يمكن منح هذه الصلاحية أو تعديلها أو إلغاؤها من الواجهة.', 'This identity is in the out-of-band bootstrap super-admin allowlist. Root access cannot be granted, changed, or revoked from this UI.') }}</div>
              } @else if (selectedAdminUser.subject === access?.subject) {
                <div class="notice warn" role="note">{{ t('لا يمكن للمسؤول تعديل صلاحيات حسابه بنفسه. استخدم مسؤول جذر آخر لإجراء التغيير.', 'An administrator cannot change their own access. Ask another bootstrap super admin to make the change.') }}</div>
              } @else if (canManagePlatformRoles) {
                <div class="role-editor">
                  <div><h4>{{ t('إسناد صلاحية منصة', 'Assign a platform role') }}</h4><p>{{ t('اختار الدور المحدد والصريح، واكتب سببًا لا يقل عن 3 أحرف. لا يوجد دور يسمح بترقية الذات إلى مسؤول الجذر.', 'Choose an explicit role and enter a reason of at least 3 characters. No role can grant bootstrap root access.') }}</p></div>
                  <form class="user-role-form" (ngSubmit)="savePlatformRole()">
                    <label><span>{{ t('الدور المراد منحه', 'Role to grant') }}</span><select name="selectedPlatformRole" [(ngModel)]="selectedPlatformRole"><option value="platform_viewer">{{ t('مشاهد المنصة — قراءة فقط', 'Platform Viewer — read-only') }}</option><option value="workspace_operator">{{ t('مشغّل مساحات العمل — عرض وتفعيل/تعطيل', 'Workspace Operator — view and change workspace status') }}</option><option value="user_manager">{{ t('مدير دليل المستخدمين — عرض الحسابات والعضويات', 'User Manager — view accounts and memberships') }}</option></select></label>
                    <label class="role-reason"><span>{{ t('سبب التغيير (إلزامي)', 'Reason (required)') }}</span><textarea name="roleReason" [(ngModel)]="roleReason" maxlength="500" rows="2" required [placeholder]="t('اكتب سببًا إداريًا واضحًا', 'Enter a clear administrative reason')"></textarea></label>
                    <div class="role-submit-actions"><button type="submit" class="primary-button" [disabled]="roleSaving || !hasMeaningfulPlatformAdminReason(roleReason)" (click)="roleChangeActive = true">{{ roleSaving ? t('جارٍ الحفظ…', 'Saving…') : t('منح الصلاحية', 'Grant role') }}</button><button type="submit" class="quiet-button signout" [disabled]="roleSaving || !hasMeaningfulPlatformAdminReason(roleReason) || !selectedAdminUser.roles.includes(selectedPlatformRole)" (click)="roleChangeActive = false">{{ t('إلغاء الصلاحية المحددة', 'Revoke selected role') }}</button></div>
                  </form>
                  @if (selectedAdminUser.roles.length) {
                    <div class="current-role-grants"><strong>{{ t('الصلاحيات المفوّضة الحالية', 'Current delegated roles') }}</strong>
                      @for (role of selectedAdminUser.roles; track role) {
                        <div class="grant-row"><div><span class="role-pill">{{ platformRoleLabel(role) }}</span><small>{{ platformRoleDescription(role) }}</small></div><button class="quiet-button" type="button" [disabled]="roleSaving" (click)="selectRoleForRevocation(role)">{{ t('اختيار للإلغاء', 'Select to revoke') }}</button></div>
                      }
                    </div>
                  }
                </div>
              } @else {
                <div class="notice" role="note">{{ t('دورك يسمح بقراءة دليل الحسابات فقط. إسناد أدوار المنصة محصور في مسؤول الجذر.', 'Your role allows directory read access only. Platform role grants are restricted to the bootstrap super admin.') }}</div>
              }
              @if (roleError) { <div class="notice error" role="alert">{{ roleError }}</div> }
              @if (roleMessage) { <div class="notice success" role="status" aria-live="polite">{{ roleMessage }}</div> }
              <div class="membership-details"><h4>{{ t('عضويات مساحات العمل', 'Workspace memberships') }}</h4>
                @if (selectedAdminUser.memberships.length) {
                  @for (membership of selectedAdminUser.memberships; track membership.business_id) {
                    <div class="membership-detail-row"><div><strong>{{ membership.business_name }}</strong><small>{{ membership.business_id }}</small></div><span class="role-pill">{{ membership.role === 'owner' ? t('مالك المساحة', 'Workspace Owner') : t('موظف', 'Staff') }}</span></div>
                  }
                } @else { <p class="muted">{{ t('هذا الحساب لا يملك عضوية في أي مساحة عمل حتى الآن.', 'This account has no workspace memberships.') }}</p> }
              </div>
            </article>
          }
          <article class="panel access-audit-panel">
            <div class="section-heading"><div><p class="eyebrow">{{ t('سجل غير قابل للتعديل من الشاشة', 'APPEND-ONLY ACCESS HISTORY') }}</p><h3>{{ t('آخر تغييرات الصلاحيات', 'Recent permission changes') }}</h3><p>{{ t('كل منح وإلغاء محفوظ باسم المنفّذ والهدف والسبب والتوقيت.', 'Every grant and revocation is persisted with actor, target, reason, and timestamp.') }}</p></div><button type="button" class="outline-button" [disabled]="roleAuditLoading" (click)="loadRoleAudit()">{{ t('تحديث السجل', 'Refresh audit') }}</button></div>
            @if (roleAuditLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t('جارٍ تحميل السجل…', 'Loading audit history…') }}</div> }
            @if (roleAuditError) { <div class="notice error" role="alert">{{ roleAuditError }}</div> }
            @if (!roleAuditLoading && !roleAuditError && !roleAuditEvents.length) { <p class="muted">{{ t('لا توجد تغييرات صلاحيات مسجلة حتى الآن.', 'No platform role changes recorded yet.') }}</p> }
            @if (roleAuditEvents.length) {
              <div class="table-wrap" role="region" tabindex="0" [attr.aria-label]="t('سجل تغييرات صلاحيات المنصة، جدول قابل للتمرير أفقيًا', 'Platform role history, horizontally scrollable table')"><table><thead><tr><th>{{ t('التوقيت', 'Timestamp') }}</th><th>{{ t('العملية', 'Action') }}</th><th>{{ t('المستخدم المستهدف', 'Target user') }}</th><th>{{ t('الدور', 'Role') }}</th><th>{{ t('السبب', 'Reason') }}</th><th>{{ t('المنفّذ', 'Actor') }}</th></tr></thead><tbody>
                @for (event of roleAuditEvents; track event.id) { <tr><td class="date-cell" [attr.data-label]="t('التوقيت', 'Timestamp')">{{ formatDate(event.created_at) }}</td><td [attr.data-label]="t('العملية', 'Action')">{{ auditActionLabel(event.action) }}</td><td class="subject" [attr.data-label]="t('المستخدم المستهدف', 'Target user')">{{ event.target_subject }}</td><td [attr.data-label]="t('الدور', 'Role')">{{ platformRoleLabel(event.role) }}</td><td class="summary-cell" [attr.data-label]="t('السبب', 'Reason')">{{ event.reason }}</td><td class="subject" [attr.data-label]="t('المنفّذ', 'Actor')">{{ event.actor_subject }}</td></tr> }
              </tbody></table></div>
            }
          </article>
        </section>
      }

      @if (section === 'permissions') {
        <section class="section-content" aria-labelledby="permissions-title">
          <div class="section-heading"><div><p class="eyebrow">{{ t('مبدأ أقل صلاحية', 'LEAST PRIVILEGE') }}</p><h2 id="permissions-title">{{ t('نموذج الصلاحيات الفعلي', 'Effective permission model') }}</h2><p>{{ t('عرض توثيقي للصلاحيات المنفذة، وليس محرر أدوار شكليًا.', 'Documentation of enforced permissions, not a cosmetic role editor.') }}</p></div></div>
          <div class="permission-grid">
            <article class="permission-card platform"><span class="permission-icon" aria-hidden="true">◇</span><div><span class="role-pill accent">{{ t('مدير المنصة', 'Platform Super Admin') }}</span><h3>{{ t('صلاحية منصّة مستقلة', 'Separate platform privilege') }}</h3><p>{{ t('القائمة المسموح بها على الخادم: PLATFORM_SUPER_ADMIN_UIDS. يجب أن تطابق القيمة هوية Firebase الموثقة كاملة بالشكل firebase:{project_id}:{uid}. عدم ضبطها يعني الرفض الافتراضي.', 'Server allowlist: PLATFORM_SUPER_ADMIN_UIDS. Entries must exactly match verified Firebase subjects in the form firebase:{project_id}:{uid}. An unset list denies access by default.') }}</p><ul><li>{{ t('مؤشرات المنصة وملفات الشركات', 'Platform metrics and workspace directory') }}</li><li>{{ t('تفعيل/تعطيل مساحة مع سبب وسجل تدقيق', 'Activate/deactivate a workspace with reason and audit trail') }}</li><li>{{ t('قراءة سجل التدقيق فقط', 'Read-only audit log') }}</li><li>{{ t('لا تعديل مباشر للمدفوعات أو الأرصدة ولا ترقية ذاتية', 'No direct payment/balance mutation or self-promotion') }}</li></ul></div></article>
            <article class="permission-card"><span class="permission-icon" aria-hidden="true">♙</span><div><span class="role-pill">{{ t('مالك مساحة العمل', 'Workspace Owner') }}</span><h3>{{ t('إدارة شركته فقط', 'Manage own workspace') }}</h3><p>{{ t('يعمل وفق عضويته الحالية في قاعدة البيانات. لا تمنحه عضويته صلاحية منصة تلقائيًا، وتظل العمليات المالية الحساسة خاضعة لقواعد الـ API القائمة.', 'Operates under the existing database membership. Ownership never implies platform access; sensitive financial actions remain governed by current API rules.') }}</p></div></article>
            <article class="permission-card"><span class="permission-icon" aria-hidden="true">♧</span><div><span class="role-pill">{{ t('موظف', 'Staff') }}</span><h3>{{ t('صلاحيات محدودة', 'Limited permissions') }}</h3><p>{{ t('لا يستطيع الدخول إلى واجهات منصة الإدارة أو تغيير الأدوار المحجوزة أو تنفيذ الوظائف التي يرفضها الخادم.', 'Cannot access platform administration or execute server-protected owner/platform operations.') }}</p></div></article>
            <article class="permission-card"><span class="permission-icon" aria-hidden="true">⛨</span><div><span class="role-pill muted-role">{{ t('غير مصرح', 'Unauthorized') }}</span><h3>{{ t('الرفض هو الوضع الافتراضي', 'Deny by default') }}</h3><p>{{ t('أي هوية غير موجودة في قائمة السماح تحصل على 403، والطلبات غير المصادق عليها تتوقف عند تحقق الهوية قبل الوصول إلى البيانات.', 'Any identity missing from the explicit allowlist receives 403. Unauthenticated requests are rejected before administrative data is queried.') }}</p></div></article>
          </div>
          <div class="notice warn" role="note"><strong>{{ t('قيود التنفيذ الحالية', 'Current implementation limits') }}</strong><p>{{ t('دليل المستخدمين الشامل يعتمد على Firebase Auth ويشمل الحسابات التي لا تملك مساحة عمل. مسؤول الجذر فقط يستطيع منح أو إلغاء أدوار المنصة المفوضة مع سبب وسجل تدقيق. أدوار مالك/موظف داخل كل مساحة تظل منفصلة، وإدارة قائمة الجذر نفسها تبقى بإعداد خادمي خارج الواجهة.', 'The full user directory is sourced from Firebase Auth and includes accounts without workspaces. Only the bootstrap super admin can grant/revoke delegated platform roles with a reason and audit record. Workspace owner/staff roles remain separate, and the root allowlist stays out-of-band in server configuration.') }}</p></div>
        </section>
      }
      <footer class="admin-footer"><span><span class="live-dot"></span>{{ t('متصل بالخادم عبر جلسة مصادقة موثقة', 'Connected through a verified authenticated session') }}</span><span>{{ t('لا توجد بيانات تجريبية', 'No demo data') }}</span></footer>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;color:var(--aba-color-text-primary,#172033)}
    *{box-sizing:border-box}
    button,input,select,textarea{font:inherit}
    button{cursor:pointer}
    button:disabled{opacity:.55;cursor:not-allowed}
    button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,a:focus-visible,summary:focus-visible{outline:var(--aba-focus-ring-width,3px) solid var(--aba-color-focus-ring,#2563eb);outline-offset:var(--aba-focus-ring-offset,2px)}
    .admin-shell{--ink:var(--aba-color-text-primary,#172033);--muted:var(--aba-color-text-secondary,#5d6878);--line:var(--aba-color-border,#e5eaf1);--panel:var(--aba-color-surface,#fff);--teal:var(--aba-color-primary,#0f766e);--background:var(--aba-color-page,#f5f7fb);--surface-soft:var(--aba-color-surface-subtle,#f8fafc);display:grid;gap:20px;min-width:0;color:var(--ink);font-size:14px;padding:2px 0 12px}
    .admin-shell.english{direction:ltr}
    .admin-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:10px 0 20px;border-bottom:1px solid var(--line);min-width:0}
    .heading{min-width:0}.eyebrow{margin:0 0 7px;color:var(--aba-color-primary);font-size:10px;font-weight:800;letter-spacing:.11em}.heading h1{margin:0;color:var(--aba-color-text-primary);font-size:clamp(25px,3vw,32px);line-height:1.15;letter-spacing:-.04em}.heading p:not(.eyebrow){color:var(--muted);font-size:13px;line-height:1.6;max-width:620px;margin:10px 0 0}
    .identity-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap;max-width:52%}.identity{display:flex;align-items:center;gap:10px;margin-inline-end:8px;min-width:0}.identity>span:last-child{display:grid;gap:3px;min-width:0}.identity strong{font-size:12px}.identity small{font-size:11px;color:var(--muted);max-width:220px;overflow-wrap:anywhere}.avatar{width:35px;height:35px;border-radius:12px;background:var(--aba-color-primary-soft);color:var(--aba-color-primary-strong);display:grid;place-items:center;font-weight:800;font-size:13px;flex:0 0 auto}
    .quiet-button,.outline-button,.primary-button,.text-action{border:1px solid var(--aba-color-border);background:var(--aba-color-surface);border-radius:9px;padding:9px 12px;color:var(--aba-color-text-primary);font-size:12px;font-weight:700;white-space:nowrap}.quiet-button:hover,.outline-button:hover{background:var(--aba-color-surface-hover);border-color:var(--aba-color-primary-border)}.signout{border-color:var(--aba-color-danger-border);color:var(--aba-color-danger-text)}.primary-button{background:var(--aba-color-primary);border-color:var(--aba-color-primary);color:white}.primary-button:hover{background:var(--aba-color-primary-strong)}.text-action{padding:0;border:0;background:transparent;color:var(--aba-color-primary)}
    .section-nav{display:flex;gap:6px;flex-wrap:wrap;padding:5px;background:var(--aba-color-surface-subtle);border:1px solid var(--aba-color-border-subtle);border-radius:12px;width:fit-content;max-width:100%}.section-nav button{display:flex;align-items:center;gap:8px;border:1px solid transparent;border-radius:9px;padding:10px 13px;color:var(--aba-color-text-secondary);background:transparent;font-size:12px;font-weight:700}.section-nav button.active{background:var(--aba-color-surface);border-color:var(--aba-color-border);color:var(--aba-color-primary);box-shadow:0 2px 8px #2033440b}.nav-count{background:var(--aba-color-primary-soft);color:var(--aba-color-primary);border-radius:20px;padding:2px 7px;font-size:10px}
    .section-content{display:grid;gap:17px;min-width:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0}.section-heading>div{min-width:0}.section-heading .eyebrow{margin-bottom:5px}.section-heading h2{margin:0;font-size:22px;letter-spacing:-.025em}.section-heading p:not(.eyebrow){margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.outline-button{flex:0 0 auto}.small-button{padding:6px 9px;font-size:11px}
    .system-status-panel{margin-bottom:16px}.runtime-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:11px;margin:10px 0 14px}.runtime-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.runtime-grid>div{display:grid;gap:6px;min-width:0;padding:11px;border:1px solid var(--line);border-radius:9px;background:var(--surface-soft)}.runtime-grid small{font-size:10px;color:var(--muted)}.runtime-grid strong{font-size:12px;overflow-wrap:anywhere}.runtime-grid .runtime-commit{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.runtime-good{color:var(--aba-color-success-text,#18784c)}.runtime-bad{color:var(--aba-color-danger-text,#a74436)}.runtime-note{font-size:10px;line-height:1.5;color:var(--muted);margin:12px 0 0}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric-card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:15px;box-shadow:0 6px 18px #243b5307;min-width:0}.metric-card{padding:16px;display:flex;flex-direction:column;align-items:flex-start;gap:7px;min-height:155px}.metric-icon{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-size:15px;margin-bottom:4px}.teal{background:var(--aba-color-primary-soft);color:var(--aba-color-primary)}.blue{background:var(--aba-color-info-soft);color:var(--aba-color-info-text)}.violet{background:#efeaff;color:#6c53ac}.amber{background:var(--aba-color-warning-soft);color:var(--aba-color-warning-text)}.metric-card>span:not(.metric-icon){font-size:12px;color:var(--aba-color-text-secondary);font-weight:650}.metric-card>strong{font-size:29px;letter-spacing:-.04em;color:var(--aba-color-text-primary);line-height:1.1;overflow-wrap:anywhere}.metric-card small{font-size:11px;color:var(--aba-color-text-secondary,#5d6878);line-height:1.45}
    .content-grid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.3fr);gap:14px}.panel{padding:17px}.panel-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;min-width:0}.panel-heading h3,.permission-card h3{margin:0;color:var(--aba-color-text-primary);font-size:15px}.panel-heading p{color:var(--muted);font-size:11px;line-height:1.5;margin:5px 0 0}.read-only{flex:0 0 auto;background:var(--aba-color-info-soft,#eff7f5);color:var(--aba-color-info-text,#0f766e);border-radius:7px;padding:5px 7px;font-size:9px;font-weight:800;letter-spacing:.06em}.currency-list{display:grid;margin-top:15px}.currency-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--aba-color-border-subtle)}.currency-row:last-child{border-bottom:0}.currency-row>div{display:grid;gap:3px}.currency-row>div strong{font-size:13px}.currency-row small{font-size:10px;color:var(--muted)}.amount{font-variant-numeric:tabular-nums;white-space:nowrap}.amount span{font-size:10px;color:var(--aba-color-text-secondary,#5d6878)}.empty-state{color:var(--aba-color-text-secondary,#5d6878);font-size:12px;line-height:1.5;padding:12px 0;margin:0}
    .table-wrap{min-width:0;max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:12px;background:white}.table-wrap table{border:0;border-collapse:separate;border-spacing:0;width:100%;min-width:760px;font-size:12px;text-align:start}.table-wrap th{background:var(--aba-color-surface-subtle);color:var(--aba-color-text-secondary);font-size:10px;font-weight:800;white-space:nowrap}.table-wrap th,.table-wrap td{padding:12px 13px;border-bottom:1px solid var(--aba-color-border-subtle);text-align:start;vertical-align:middle;max-width:300px}.table-wrap tr:last-child td{border-bottom:0}.table-wrap tbody tr:hover td{background:var(--aba-color-surface-hover)}.table-wrap td small{display:block;margin-top:4px}.compact-table table{min-width:420px}.compact-table th,.compact-table td{padding:10px}
    .filters{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;padding:14px;background:white;border:1px solid var(--line);border-radius:12px}.filters label,.status-form label{display:grid;gap:6px;color:var(--aba-color-text-secondary);font-size:11px;font-weight:750;min-width:0}.filters label>span,.status-form label>span{color:var(--aba-color-text-secondary)}.filters .search-field{flex:1 1 250px}.filters label:not(.search-field){flex:0 0 170px}.filters input,.filters select,.status-form select,.status-form textarea{min-width:0;width:100%;border:1px solid var(--aba-color-border-strong);border-radius:8px;padding:10px 11px;background:var(--aba-color-surface);color:var(--aba-color-text-primary);font-size:12px}.filters input::placeholder,.status-form textarea::placeholder{color:var(--aba-color-text-secondary,#5d6878);opacity:1}.business-link{display:grid;gap:4px;background:transparent;border:0;padding:0;text-align:start;color:var(--aba-color-text-primary);max-width:100%;white-space:normal}.business-link strong{font-size:12px}.business-link small{color:var(--aba-color-text-secondary,#5d6878);font-size:10px;overflow-wrap:anywhere}.status-pill,.role-pill{display:inline-flex;gap:6px;align-items:center;border-radius:99px;padding:5px 8px;background:var(--aba-color-surface-subtle,#eef3f6);color:var(--aba-color-text-muted,#52677a);font-size:10px;font-weight:750;white-space:nowrap}.status-active{background:var(--aba-color-success-soft,#e1f6ea);color:var(--aba-color-success-text,#18784c)}.status-inactive{background:var(--aba-color-danger-soft,#fff0ed);color:var(--aba-color-danger-text,#a74436)}.status-dot,.live-dot{width:6px;height:6px;display:inline-block;border-radius:50%;background:currentColor}.pagination{display:flex;justify-content:space-between;align-items:center;gap:12px;color:var(--muted);font-size:11px}.pagination>div{display:flex;gap:7px}.pagination button{padding:7px 10px}.empty-panel{border:1px dashed var(--aba-color-border-strong);border-radius:14px;background:white;padding:32px 18px;text-align:center}.empty-panel h3{margin:12px 0 4px;font-size:15px}.empty-panel p{margin:0;color:var(--muted);font-size:12px}.empty-icon{width:42px;height:42px;border-radius:13px;display:inline-grid;place-items:center;background:var(--aba-color-primary-soft,#eef8f5);color:var(--aba-color-primary,#0f766e);font-size:21px}
    .detail-panel{display:grid;gap:15px;scroll-margin-top:20px}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.detail-grid>div{display:grid;gap:7px;min-width:0;padding:12px;border:1px solid var(--aba-color-border-subtle);border-radius:9px}.detail-grid small{font-size:10px;color:var(--muted)}.detail-grid strong{font-size:12px;overflow-wrap:anywhere}.divider{height:1px;background:var(--line)}.subject{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;white-space:normal;max-width:260px;font-size:11px}.role-pill{background:var(--aba-color-surface-subtle)}.role-pill.accent{background:var(--aba-color-primary-soft,#e2f5ef);color:var(--aba-color-primary,#0e766e)}.muted-role{color:var(--aba-color-text-secondary,#5d6878)}.caution{padding:12px 14px;border:1px solid var(--aba-color-warning-border,#f2deb4);border-radius:10px;background:var(--aba-color-warning-soft,#fff9eb)}.caution strong{font-size:12px;color:var(--aba-color-warning-text,#85520d)}.caution p{color:var(--aba-color-warning-text,#876831);font-size:11px;line-height:1.6;margin:5px 0 0}.status-form{border-top:1px solid var(--line);padding-top:14px;display:grid;grid-template-columns:minmax(160px,.7fr) minmax(230px,1.5fr) auto;gap:12px;align-items:end}.status-form textarea{resize:vertical;line-height:1.5}.field-error{grid-column:1/-1;margin:0;color:var(--aba-color-danger-text,#af392c);font-size:11px}
    .heading-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.audit-filters label:not(.search-field){flex:1 1 185px}.date-cell{white-space:nowrap}.summary-cell{min-width:170px;white-space:normal;overflow-wrap:anywhere;line-height:1.5}.muted{color:var(--muted)}
    .permission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.permission-card{display:flex;align-items:flex-start;gap:13px;background:white;border:1px solid var(--line);border-radius:14px;padding:17px;min-width:0}.permission-icon{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;background:var(--aba-color-surface-subtle);border-radius:11px;color:#2a6270;font-size:16px}.permission-card.platform{grid-column:1/-1;background:linear-gradient(135deg,var(--aba-color-surface) 35%,var(--aba-color-primary-soft) 100%);border-color:var(--aba-color-primary-border)}.permission-card>div{min-width:0}.permission-card h3{margin:9px 0 6px}.permission-card p,.permission-card li{font-size:12px;color:var(--aba-color-text-secondary);line-height:1.7}.permission-card p{margin:0}.permission-card ul{margin:9px 0 0;padding-inline-start:20px;display:grid;gap:2px}.permission-card li::marker{color:var(--aba-color-primary)}.accent{background:var(--aba-color-primary-soft);color:var(--aba-color-primary)}.notice{border-radius:11px;padding:12px 14px;font-size:12px;line-height:1.6;display:flex;align-items:center;justify-content:space-between;gap:12px;overflow-wrap:anywhere}.notice p{margin:5px 0 0}.notice.error{color:var(--aba-color-danger-text,#94372c);border:1px solid var(--aba-color-danger-border,#f2d4cf);background:var(--aba-color-danger-soft,#fff7f6)}.notice.success{color:var(--aba-color-success-text,#176644);border:1px solid var(--aba-color-success-border,#c9ead8);background:var(--aba-color-success-soft,#f0fcf5)}.notice.warn{display:block;color:var(--aba-color-warning-text,#7b541b);border:1px solid var(--aba-color-warning-border,#efdcae);background:var(--aba-color-warning-soft,#fff9e9)}.loading-block{display:flex;align-items:center;gap:10px;padding:18px 14px;color:var(--aba-color-text-secondary,#5d6878);font-size:12px;border:1px dashed var(--aba-color-border-subtle);border-radius:12px;background:white}.spinner{width:16px;height:16px;border:2px solid var(--aba-color-border-subtle);border-top-color:var(--aba-color-primary);border-radius:50%;animation:spin .8s linear infinite;flex:0 0 auto}@keyframes spin{to{transform:rotate(360deg)}}.data-note{display:flex;gap:10px;align-items:flex-start;color:var(--aba-color-info-text,#506e82);background:var(--aba-color-info-soft,#eef7fb);border:1px solid var(--aba-color-info-border,#d7eaf2);border-radius:11px;padding:13px}.data-note>span{color:var(--aba-color-info-text,#0d7081);font-size:16px}.data-note strong{font-size:12px}.data-note p{font-size:11px;line-height:1.7;margin:4px 0 7px;color:var(--aba-color-info-text,#597184)}.data-note small{font-size:10px;color:var(--aba-color-text-secondary,#5d6878)}.admin-footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:14px;color:var(--aba-color-text-secondary,#5d6878);font-size:10px}.admin-footer>span{display:flex;align-items:center;gap:7px}.live-dot{background:var(--aba-color-success-text);box-shadow:0 0 0 3px #21a36c20}
    @media(max-width:1050px){.runtime-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.content-grid{grid-template-columns:1fr}.table-wrap table{min-width:700px}.status-form{grid-template-columns:1fr 1.5fr}.status-form .primary-button{grid-column:1/-1;justify-self:start}}
    .identity-access-summary{display:grid;gap:10px;padding:13px 14px;background:#f4f8fa;border:1px solid var(--aba-color-border-subtle);border-radius:12px;min-width:0}.identity-access-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}.identity-access-heading{display:grid;gap:5px;min-width:0}.identity-access-heading>strong,.identity-permissions>strong{font-size:11px;color:var(--aba-color-text-secondary)}.identity-access-heading>small{font-weight:500}.identity-role-pills,.identity-permission-tags{display:flex;flex-wrap:wrap;gap:6px;min-width:0}.identity-permissions{display:grid;gap:7px}.permission-token{display:inline-flex;align-items:center;border:1px solid var(--aba-color-border);border-radius:7px;padding:5px 8px;background:var(--aba-color-surface);color:var(--aba-color-text-secondary);font-size:10px;line-height:1.45;overflow-wrap:anywhere}
    .user-cell,.user-role-list,.membership-list{display:grid;gap:5px;min-width:0}.user-cell strong{font-size:12px}.user-cell small,.grant-row small,.membership-chip small{font-size:10px;color:var(--muted);overflow-wrap:anywhere}.user-uid,.subject{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;overflow-wrap:anywhere;word-break:break-word}.user-root-label{display:block;margin-top:5px;font-size:10px;font-weight:800;color:var(--aba-color-warning-text)}.user-directory-table tr.selected-row{background:var(--aba-color-primary-soft)}.user-role-list{display:flex;gap:5px;flex-wrap:wrap}.membership-list{min-width:160px}.membership-chip{display:grid;gap:2px;padding:7px 9px;border:1px solid var(--line);border-radius:8px;background:var(--aba-color-surface-subtle);min-width:0}.membership-chip strong{font-size:11px;overflow-wrap:anywhere}.user-access-panel,.access-audit-panel{display:grid;gap:15px}.user-access-panel .section-heading h3,.access-audit-panel .section-heading h3{margin:0;font-size:18px}.user-facts-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.user-facts-grid>div{display:grid;gap:6px;min-width:0;background:var(--aba-color-surface-subtle);border:1px solid var(--line);border-radius:10px;padding:11px}.user-facts-grid small{font-size:10px;color:var(--muted)}.user-facts-grid strong{font-size:11px;overflow-wrap:anywhere}.role-editor{border-top:1px solid var(--line);padding-top:14px;display:grid;gap:14px}.role-editor h4,.membership-details h4{margin:0;font-size:14px}.role-editor p{font-size:12px;color:var(--muted);line-height:1.6;margin:5px 0 0}.user-role-form{display:grid;grid-template-columns:minmax(180px,1fr) minmax(200px,2fr) auto;align-items:end;gap:10px}.user-role-form label{display:grid;gap:6px;min-width:0}.user-role-form label>span{font-size:11px;font-weight:700;color:var(--aba-color-text-secondary)}.user-role-form select,.user-role-form textarea{width:100%;min-width:0;max-width:100%;padding:10px;border:1px solid var(--aba-color-border);border-radius:9px;background:var(--aba-color-surface);color:var(--ink);font-size:12px}.current-role-grants{display:grid;gap:9px}.current-role-grants>strong{font-size:12px}.role-submit-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.grant-row,.membership-detail-row{display:flex;justify-content:space-between;align-items:center;gap:12px;border:1px solid var(--line);border-radius:10px;padding:10px;min-width:0}.grant-row>div,.membership-detail-row>div{display:grid;gap:5px;min-width:0}.grant-row small{display:block;line-height:1.5}.membership-details{display:grid;gap:9px;border-top:1px solid var(--line);padding-top:14px}.membership-detail-row strong{font-size:12px}.membership-detail-row small{font-size:10px;color:var(--muted);overflow-wrap:anywhere}.user-access-panel .notice{overflow-wrap:anywhere}
    @media(max-width:760px){.runtime-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-shell{gap:15px}.admin-header{display:grid;gap:14px}.identity-actions{max-width:none;justify-content:flex-start}.identity{flex:1 1 100%}.section-nav{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.section-nav button{justify-content:flex-start;padding:10px;min-width:0}.section-heading{align-items:flex-start}.section-heading h2{font-size:19px}.section-heading>.outline-button{max-width:45%;white-space:normal}.filters{align-items:stretch}.filters .search-field,.filters label:not(.search-field){flex:1 1 100%}.filters .primary-button{width:100%}.detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.permission-grid{grid-template-columns:1fr}.permission-card.platform{grid-column:auto}.user-facts-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.identity-access-top{display:grid}.user-role-form{grid-template-columns:1fr}.grant-row,.membership-detail-row{align-items:flex-start}.user-directory-table{min-width:0}.pagination{align-items:flex-start;flex-direction:column}.pagination>div{width:100%}.pagination button{flex:1}.table-wrap{margin-inline:-1px}.admin-footer{font-size:10px}}
    @media(max-width:600px){.section-heading{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.section-heading>.outline-button{max-width:100%;justify-self:start}}
    @media(max-width:480px){.heading h1{font-size:25px}.metric-grid{gap:9px}.metric-card{padding:12px;min-height:140px}.metric-card>strong{font-size:25px}.metric-card>span:not(.metric-icon){font-size:11px}.metric-card small{font-size:10px}.metric-icon{width:29px;height:29px}.panel{padding:12px}.detail-grid{grid-template-columns:1fr 1fr;gap:8px}.detail-grid>div{padding:9px}.status-form{grid-template-columns:1fr}.status-form .primary-button{grid-column:auto;width:100%}.identity small{max-width:160px}.quiet-button{padding:8px 10px}.section-nav button{gap:6px;font-size:11px}.notice{align-items:flex-start}}
    .system-status-panel{margin-bottom:16px}.runtime-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:11px;margin:10px 0 14px}.runtime-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.runtime-grid>div{display:grid;gap:6px;min-width:0;padding:11px;border:1px solid var(--line);border-radius:9px;background:var(--surface-soft)}.runtime-grid small{font-size:10px;color:var(--muted)}.runtime-grid strong{font-size:12px;overflow-wrap:anywhere}.runtime-grid .runtime-commit{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.runtime-good{color:var(--aba-color-success-text,#18784c)}.runtime-bad{color:var(--aba-color-danger-text,#a74436)}.runtime-note{font-size:10px;line-height:1.5;color:var(--muted);margin:12px 0 0}
    /* Mobile accessibility baseline: keep controls reachable and dense copy legible. */
    @media(max-width:760px){
      .section-nav button,.quiet-button,.outline-button,.primary-button,.text-action,.pagination button{min-height:44px}
      .filters input,.filters select,.status-form select,.status-form textarea,.user-role-form select,.user-role-form textarea{min-height:44px}
      .filters label,.status-form label,.user-role-form label>span{font-size:12px}
      .runtime-grid small,.runtime-note,.data-note small,.admin-footer{font-size:11px}
      .identity-access-heading>strong,.identity-permissions>strong{font-size:11px}
      .permission-token{min-height:32px;padding:5px 7px;font-size:11px;line-height:1.4}
    }
    @media(max-width:480px){
      .section-nav button{min-height:46px;font-size:12px}
      .metric-card>span:not(.metric-icon){font-size:12px}
      .metric-card small{font-size:11px}
      .compact-table th,.compact-table td{font-size:11px;line-height:1.4}
      .heading p:not(.eyebrow){font-size:14px}
      .section-heading p:not(.eyebrow){font-size:13px}
      .notice{font-size:13px}
    }
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}

    /* Compact admin identity summary and avoid needless horizontal scrolling. */
    .identity-access-summary{gap:7px;padding:9px 11px}
    .identity-access-top{gap:8px}
    .identity-access-heading{gap:3px}
    .identity-access-heading>strong,.identity-permissions>strong{font-size:10px}
    .identity-role-pills,.identity-permission-tags{gap:4px}
    .permission-token{padding:3px 6px;font-size:9px}
    .identity-permissions{gap:5px}
    .compact-table{overflow-x:hidden}
    .compact-table table{width:100%;min-width:0;table-layout:fixed}
    .compact-table th,.compact-table td{padding:8px 9px;overflow-wrap:anywhere;white-space:normal}
    .admin-header{gap:16px;padding-bottom:14px}
    @media(max-width:760px){
      .identity-access-summary{padding:8px}
      .identity-access-top{gap:7px}
      .identity-access-heading .user-uid{overflow-wrap:anywhere}
      .compact-table table{min-width:0}
      .compact-table th,.compact-table td{padding:7px 5px;font-size:11px;line-height:1.4}
      .compact-table th:nth-child(1),.compact-table td:nth-child(1){width:19%}
      .compact-table th:nth-child(2),.compact-table td:nth-child(2){width:33%}
      .compact-table th:nth-child(3),.compact-table td:nth-child(3){width:16%}
      .compact-table th:nth-child(4),.compact-table td:nth-child(4){width:32%}
    }
    @media(max-width:760px){
      .runtime-grid small,.runtime-note,.currency-row small,.business-link small,.detail-grid small,
      .user-cell small,.grant-row small,.membership-chip small,.membership-detail-row small,
      .user-facts-grid small,.user-root-label,.data-note small{font-size:12px;line-height:1.45}
      .read-only,.status-pill,.role-pill,.nav-count,.filters label,.status-form label,
      .user-role-form label>span,.panel-heading p,.caution p,.field-error,.data-note p,
      .permission-token,.identity-access-heading>strong,.identity-permissions>strong{font-size:12px}
      .metric-card small{font-size:12px}
      .data-note p{font-size:12px}
    }

    /* Convert admin data grids into readable, labeled record cards on phones. */
    @media(max-width:760px){
      .table-wrap{overflow:visible;border:0;background:transparent;margin-inline:0}
      .table-wrap table,.compact-table table,.user-directory-table{display:block;width:100%;min-width:0;table-layout:auto}
      .table-wrap thead{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .table-wrap tbody{display:grid;gap:10px}
      .table-wrap tbody tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));min-width:0;overflow:hidden;border:1px solid var(--aba-color-border-subtle);border-radius:12px;background:var(--aba-color-surface);box-shadow:0 3px 12px rgb(15 23 42 / 4%)}
      .table-wrap tbody td{display:grid;align-content:start;gap:5px;min-width:0;max-width:none;width:auto!important;padding:10px;border:0;overflow-wrap:anywhere;white-space:normal;text-align:start}
      .table-wrap tbody td::before{content:attr(data-label);color:var(--aba-color-text-secondary);font-size:11px;font-weight:700;line-height:1.35}
      .table-wrap tbody td:first-child{grid-column:1/-1;padding:12px;border-block-end:1px solid var(--aba-color-border-subtle);background:var(--aba-color-surface-subtle)}
      .table-wrap tbody tr:hover td{background:transparent}
      .table-wrap tbody tr:hover td:first-child{background:var(--aba-color-surface-subtle)}
      .table-wrap tbody td.amount{font-variant-numeric:tabular-nums;white-space:normal;text-align:start}
      .table-wrap .status-pill,.table-wrap .role-pill{justify-self:start;max-width:100%;white-space:normal}
      .user-directory-table{min-width:0}
    }
  `]
})
export class PlatformAdminComponent implements OnInit {
  @Input() language: 'ar' | 'en' = 'ar';
  @Input() userEmail = '';
  @Output() readonly signOutRequested = new EventEmitter<void>();
  @Output() readonly languageToggleRequested = new EventEmitter<void>();

  readonly pageSize = 25;
  section: AdminSection = 'overview';
  overview: PlatformAdminOverview | null = null;
  overviewLoading = false;
  overviewError = '';
  systemStatus: PlatformSystemStatus | null = null;
  systemStatusLoading = false;
  systemStatusError = '';
  pageError = '';
  successMessage = '';

  businesses: PlatformBusiness[] = [];
  businessesLoading = false;
  businessesError = '';
  businessQuery = '';
  businessStatus: 'all' | 'active' | 'inactive' = 'all';
  businessSortBy: 'created_at' | 'name' | 'members' = 'created_at';
  businessSortOrder: 'asc' | 'desc' = 'desc';
  businessOffset = 0;
  businessTotal = 0;

  selectedDetails: PlatformBusinessDetails | null = null;
  detailsLoading = false;
  detailsError = '';
  statusSaving = false;
  statusError = '';
  desiredStatus = true;
  statusReason = '';

  auditEvents: PlatformAuditEvent[] = [];
  auditTotal = 0;
  auditOffset = 0;
  auditLoading = false;
  auditError = '';
  auditExporting = false;
  auditExportError = '';
  auditExportMessage = '';
  auditAction = '';
  auditActor = '';
  auditBusinessId = '';
  auditFrom = '';
  auditTo = '';

  access: PlatformAdminAccess | null = null;
  accessLoading = false;
  users: PlatformAdminUser[] = [];
  usersLoading = false;
  usersError = '';
  userQuery = '';
  userSearchMode: PlatformAdminUsersPage['search_mode'] = 'cursor_pagination';
  userNextPageToken: string | null = null;
  userPageTokens: Array<string | null> = [null];
  userPageIndex = 0;
  selectedAdminUser: PlatformAdminUser | null = null;
  selectedPlatformRole: PlatformRole = 'platform_viewer';
  roleReason = '';
  roleSaving = false;
  roleChangeActive = true;
  roleError = '';
  roleMessage = '';
  roleAuditEvents: PlatformRoleAuditEvent[] = [];
  roleAuditLoading = false;
  roleAuditError = '';

  get canViewUsers(): boolean {
    return this.access?.permissions.includes('view_users') ?? false;
  }

  get canManagePlatformRoles(): boolean {
    return this.access?.is_platform_super_admin === true;
  }

  get canManageWorkspaceStatus(): boolean {
    return this.access?.permissions.includes('manage_workspace_status') ?? false;
  }

  readonly hasMeaningfulPlatformAdminReason = hasMeaningfulPlatformAdminReason;

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    void this.refreshAccess();
    void this.refreshOverview();
    void this.refreshSystemStatus();
    void this.loadBusinesses(0);
    void this.loadAudit(0);
  }

  async refreshAccess(): Promise<void> {
    this.accessLoading = true;
    try {
      this.access = await this.api.platformAdminAccess();
      if (!this.canViewUsers && this.section === 'users') this.section = 'overview';
    } catch (error) {
      this.access = null;
      this.pageError = this.errorText(error);
    } finally {
      this.accessLoading = false;
    }
  }


  previousPageOffset(offset: number): number {
    return Math.max(0, offset - this.pageSize);
  }

  get initials(): string {
    const value = this.userEmail.trim();
    return value ? value.slice(0, 1).toUpperCase() : 'A';
  }

  t(ar: string, en: string): string {
    return this.language === 'ar' ? ar : en;
  }

  money(value: string): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return value;
    return new Intl.NumberFormat(this.language === 'ar' ? 'ar-EG' : 'en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(parsed);
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return this.t('غير متاح', 'Not available');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return this.t('غير متاح', 'Not available');
    return new Intl.DateTimeFormat(this.language === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
  }

  auditActionLabel(action: string): string {
    return formatAuditActionLabel(action, this.language);
  }

  auditTargetLabel(target: string): string {
    return formatAuditTargetLabel(target, this.language);
  }

  statusLabel(status: string): string {
    const ar: Record<string, string> = { draft: 'مسودة', issued: 'صادرة', void: 'ملغاة' };
    const en: Record<string, string> = { draft: 'Draft', issued: 'Issued', void: 'Voided' };
    return (this.language === 'ar' ? ar : en)[status] || status;
  }

  roleLabel(role: PlatformMembership['role']): string {
    if (role === 'owner') return this.t('مالك', 'Owner');
    if (role === 'staff') return this.t('موظف', 'Staff');
    return role;
  }

  async refreshAll(): Promise<void> {
    this.pageError = '';
    await Promise.all([this.refreshOverview(), this.refreshSystemStatus(), this.loadBusinesses(this.businessOffset), this.loadAudit(this.auditOffset)]);
  }

  async refreshSystemStatus(): Promise<void> {
    this.systemStatusLoading = true;
    this.systemStatusError = '';
    try {
      this.systemStatus = await this.api.platformAdminSystemStatus();
    } catch (error) {
      this.systemStatus = null;
      this.systemStatusError = this.errorText(error);
    } finally {
      this.systemStatusLoading = false;
    }
  }

  dependencyStatusLabel(status: string): string {
    const labels: Record<string, { ar: string; en: string }> = {
      healthy: { ar: 'سليم', en: 'Healthy' },
      unavailable: { ar: 'غير متاح', en: 'Unavailable' },
      unconfigured: { ar: 'غير مُعد', en: 'Not configured' },
      configured: { ar: 'مُعد', en: 'Configured' },
    };
    return labels[status]?.[this.language === 'ar' ? 'ar' : 'en'] || status;
  }

  async refreshOverview(): Promise<void> {
    this.overviewLoading = true;
    this.overviewError = '';
    try {
      this.overview = await this.api.platformAdminOverview();
    } catch (error) {
      this.overview = null;
      this.overviewError = this.errorText(error);
      this.pageError = this.overviewError;
    } finally {
      this.overviewLoading = false;
    }
  }

  setSection(section: AdminSection): void {
    if (section === 'users' && !this.canViewUsers) return;
    this.section = section;
    if (section === 'businesses' && this.businesses.length === 0) void this.loadBusinesses(0);
    if (section === 'activity' && this.auditEvents.length === 0) void this.loadAudit(0);
    if (section === 'users' && this.users.length === 0) {
      void this.loadUsers(0, true);
      void this.loadRoleAudit();
    }
  }


  async loadUsers(pageIndex = this.userPageIndex, reset = false): Promise<void> {
    if (!this.canViewUsers) return;
    if (reset) {
      this.userPageIndex = 0;
      this.userPageTokens = [null];
      pageIndex = 0;
    }
    this.usersLoading = true;
    this.usersError = '';
    this.roleError = '';
    const pageToken = this.userPageTokens[pageIndex] || undefined;
    try {
      const result = await this.api.platformAdminUsers({
        q: this.userQuery.trim() || undefined,
        page_token: pageToken,
        limit: 25
      });
      this.users = result.items;
      this.userSearchMode = result.search_mode;
      this.userNextPageToken = result.next_page_token;
      this.userPageIndex = pageIndex;
      if (result.next_page_token) this.userPageTokens[pageIndex + 1] = result.next_page_token;
      if (this.selectedAdminUser) {
        this.selectedAdminUser = this.users.find(user => user.uid === this.selectedAdminUser?.uid) || null;
      }
    } catch (error) {
      this.users = [];
      this.userNextPageToken = null;
      this.usersError = this.errorText(error);
    } finally {
      this.usersLoading = false;
    }
  }

  searchUsers(): void {
    this.userPageIndex = 0;
    this.userPageTokens = [null];
    this.selectedAdminUser = null;
    void this.loadUsers(0, true);
  }

  nextUsersPage(): void {
    if (!this.userNextPageToken || this.usersLoading || this.userQuery.trim()) return;
    const nextIndex = this.userPageIndex + 1;
    this.userPageTokens[nextIndex] = this.userNextPageToken;
    void this.loadUsers(nextIndex);
  }

  previousUsersPage(): void {
    if (this.userPageIndex <= 0 || this.usersLoading) return;
    void this.loadUsers(this.userPageIndex - 1);
  }

  selectAdminUser(user: PlatformAdminUser): void {
    this.selectedAdminUser = user;
    this.selectedPlatformRole = 'platform_viewer';
    this.roleChangeActive = true;
    this.roleReason = '';
    this.roleError = '';
    this.roleMessage = '';
  }

  platformRoleLabel(role: string): string {
    const labels: Record<string, { ar: string; en: string }> = {
      platform_super_admin: { ar: 'مسؤول المنصة الأساسي', en: 'Platform Super Admin' },
      platform_viewer: { ar: 'مشاهد المنصة', en: 'Platform Viewer' },
      workspace_operator: { ar: 'مشغّل مساحات العمل', en: 'Workspace Operator' },
      user_manager: { ar: 'مدير دليل المستخدمين', en: 'User Manager' }
    };
    return labels[role]?.[this.language === 'ar' ? 'ar' : 'en'] || role;
  }

  platformPermissionLabel(permission: string): string {
    const labels: Record<string, { ar: string; en: string }> = {
      view_overview: { ar: 'قراءة مؤشرات المنصة', en: 'View platform overview' },
      view_workspaces: { ar: 'عرض مساحات العمل', en: 'View workspaces' },
      view_audit: { ar: 'قراءة سجل التدقيق', en: 'Read audit history' },
      view_system_status: { ar: 'عرض حالة النظام', en: 'View system status' },
      view_users: { ar: 'عرض دليل جميع المستخدمين', en: 'View all users' },
      manage_workspace_status: { ar: 'تفعيل/تعطيل مساحة بسبب موثق', en: 'Change workspace status with a reason' },
      manage_platform_roles: { ar: 'منح وإلغاء أدوار المنصة', en: 'Grant and revoke platform roles' }
    };
    return labels[permission]?.[this.language === 'ar' ? 'ar' : 'en'] || permission;
  }

  platformRoleDescription(role: string): string {
    const descriptions: Record<string, { ar: string; en: string }> = {
      platform_viewer: { ar: 'قراءة المؤشرات والمساحات وسجل التدقيق وحالة النظام.', en: 'Read platform metrics, workspaces, audit records and system status.' },
      workspace_operator: { ar: 'صلاحيات القراءة مع تفعيل أو تعطيل مساحة عمل بسبب موثق.', en: 'Read access plus reasoned workspace activation/deactivation.' },
      user_manager: { ar: 'قراءة جميع حسابات Firebase وعضوياتها؛ لا يمنح أدوار منصة.', en: 'Read all Firebase accounts and memberships; cannot grant platform roles.' }
    };
    return descriptions[role]?.[this.language === 'ar' ? 'ar' : 'en'] || this.t('صلاحية الجذر تُدار من إعداد الخادم فقط.', 'Bootstrap root access is managed only in server configuration.');
  }

  async savePlatformRole(active = this.roleChangeActive): Promise<void> {
    const user = this.selectedAdminUser;
    if (!user || !this.canManagePlatformRoles || user.is_platform_super_admin
        || user.subject === this.access?.subject || !hasMeaningfulPlatformAdminReason(this.roleReason)) return;
    this.roleSaving = true;
    this.roleError = '';
    this.roleMessage = '';
    try {
      const result = await this.api.platformAdminChangeUserRole(user.uid, {
        role: this.selectedPlatformRole,
        active,
        reason: this.roleReason.trim()
      });
      this.roleMessage = this.t(
        result.changed ? 'تم حفظ التغيير وتسجيله في سجل التدقيق.' : 'الصلاحية بالفعل بالحالة المطلوبة.',
        result.message
      );
      this.roleReason = '';
      await Promise.all([this.loadUsers(this.userPageIndex), this.loadRoleAudit()]);
      this.selectedAdminUser = this.users.find(item => item.uid === user.uid) || null;
    } catch (error) {
      this.roleError = this.errorText(error);
    } finally {
      this.roleSaving = false;
    }
  }

  selectRoleForRevocation(role: string): void {
    if (role !== 'platform_viewer' && role !== 'workspace_operator' && role !== 'user_manager') return;
    this.selectedPlatformRole = role;
    this.roleChangeActive = false;
    this.roleMessage = this.t('تم اختيار الدور للإلغاء. اكتب السبب ثم اضغط «إلغاء الصلاحية المحددة».', 'Role selected for revocation. Enter a reason, then select “Revoke selected role”.');
    this.roleError = '';
  }

  async loadRoleAudit(): Promise<void> {
    if (!this.canViewUsers) return;
    this.roleAuditLoading = true;
    this.roleAuditError = '';
    try {
      const result = await this.api.platformRoleAuditEvents({ limit: 20, offset: 0 });
      this.roleAuditEvents = result.items;
    } catch (error) {
      this.roleAuditEvents = [];
      this.roleAuditError = this.errorText(error);
    } finally {
      this.roleAuditLoading = false;
    }
  }

  async loadBusinesses(offset: number): Promise<void> {
    this.businessesLoading = true;
    this.businessesError = '';
    this.statusError = '';
    this.pageError = '';
    this.businessOffset = Math.max(0, offset);
    try {
      const result = await this.api.platformBusinesses({
        q: this.businessQuery.trim() || undefined,
        status: this.businessStatus,
        sort_by: this.businessSortBy,
        sort_order: this.businessSortOrder,
        limit: this.pageSize,
        offset: this.businessOffset
      });
      this.businesses = result.items;
      this.businessTotal = result.total;
      this.businessOffset = result.offset;
      if (this.selectedDetails) {
        const updated = this.businesses.find(item => item.id === this.selectedDetails?.business.id);
        if (updated && updated.is_active !== this.selectedDetails.business.is_active) {
          this.selectedDetails.business = updated;
          this.desiredStatus = updated.is_active;
        }
      }
    } catch (error) {
      this.businesses = [];
      this.businessTotal = 0;
      this.businessesError = this.errorText(error);
      this.pageError = this.businessesError;
    } finally {
      this.businessesLoading = false;
    }
  }

  async openBusiness(item: PlatformBusiness): Promise<void> {
    this.selectedDetails = null;
    this.detailsLoading = true;
    this.detailsError = '';
    this.statusError = '';
    this.statusReason = '';
    this.desiredStatus = !item.is_active;
    try {
      this.selectedDetails = await this.api.platformBusinessDetails(item.id);
      this.desiredStatus = this.selectedDetails.business.is_active;
    } catch (error) {
      this.detailsError = this.errorText(error);
    } finally {
      this.detailsLoading = false;
    }
  }

  closeDetails(): void {
    this.selectedDetails = null;
    this.detailsError = '';
    this.statusError = '';
    this.statusReason = '';
  }

  async updateBusinessStatus(): Promise<void> {
    const details = this.selectedDetails;
    const current = details?.business;
    const reason = this.statusReason.trim();
    if (!details || !current || this.statusSaving) return;
    if (!hasMeaningfulPlatformAdminReason(reason)) {
      this.statusError = this.t('اكتب سببًا واضحًا لا يقل عن 3 أحرف.', 'Enter a meaningful reason of at least 3 characters.');
      return;
    }
    if (this.desiredStatus === current.is_active) {
      this.statusError = this.t('اختر حالة مختلفة عن الحالة الحالية.', 'Choose a status different from the current state.');
      return;
    }
    const question = this.desiredStatus
      ? this.t('تأكيد تفعيل الوصول لمساحة العمل؟ سيتم تسجيل العملية.', 'Activate access for this workspace? The action will be audited.')
      : this.t('تأكيد تعطيل الوصول لمساحة العمل؟ سيتم منع أعضاء الشركة من الوصول دون حذف البيانات.', 'Deactivate access for this workspace? Its members will lose access; no data will be deleted.');
    if (!window.confirm(question)) return;

    this.statusSaving = true;
    this.statusError = '';
    this.successMessage = '';
    try {
      const result = await this.api.platformBusinessStatus(current.id, { is_active: this.desiredStatus, reason });
      this.successMessage = result.message;
      details.business = result.business;
      if (this.selectedDetails === details) {
        this.statusReason = '';
        this.desiredStatus = result.business.is_active;
      }
      await Promise.all([this.loadBusinesses(this.businessOffset), this.refreshOverview(), this.loadAudit(0)]);
    } catch (error) {
      this.statusError = this.errorText(error);
    } finally {
      this.statusSaving = false;
    }
  }

  async exportAudit(): Promise<void> {
    this.auditExporting = true;
    this.auditExportError = '';
    this.auditExportMessage = '';
    try {
      const result = await this.api.platformAuditEventsCsv({
        action: this.auditAction.trim() || undefined,
        actor_subject: this.auditActor.trim() || undefined,
        business_id: this.auditBusinessId.trim() || undefined,
        created_after: this.toIsoDateTime(this.auditFrom),
        created_before: this.toIsoDateTime(this.auditTo),
        limit: 1000
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'platform-audit-events.csv';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.auditExportMessage = result.truncated
        ? this.t(`تم تنزيل أول ${result.rowCount} سجل فقط؛ توجد سجلات إضافية مطابقة.`, `Downloaded the first ${result.rowCount} matching rows; more records are available.`)
        : this.t(`تم تنزيل ${result.rowCount} سجل.`, `Downloaded ${result.rowCount} rows.`);
    } catch (error) {
      this.auditExportError = this.errorText(error);
    } finally {
      this.auditExporting = false;
    }
  }

  async loadAudit(offset: number): Promise<void> {
    this.auditLoading = true;
    this.auditError = '';
    this.pageError = '';
    this.auditOffset = Math.max(0, offset);
    try {
      const result = await this.api.platformAuditEvents({
        action: this.auditAction.trim() || undefined,
        actor_subject: this.auditActor.trim() || undefined,
        business_id: this.auditBusinessId.trim() || undefined,
        created_after: this.toIsoDateTime(this.auditFrom),
        created_before: this.toIsoDateTime(this.auditTo),
        limit: this.pageSize,
        offset: this.auditOffset
      });
      this.auditEvents = result.items;
      this.auditTotal = result.total;
      this.auditOffset = result.offset;
    } catch (error) {
      this.auditEvents = [];
      this.auditTotal = 0;
      this.auditError = this.errorText(error);
      this.pageError = this.auditError;
    } finally {
      this.auditLoading = false;
    }
  }

  private toIsoDateTime(value: string): string | undefined {
    if (!value.trim()) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  private errorText(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (/401|403|administrator access/i.test(message)) {
      return this.t('انتهت صلاحية الوصول الإداري أو لم تعد الصلاحية متاحة. سجّل الدخول مجددًا أو تواصل مع مسؤول المنصة.', 'Administrative access is expired or not granted. Sign in again or contact the platform administrator.');
    }
    return message || this.t('حدث خطأ غير متوقع أثناء الاتصال بالخادم.', 'An unexpected server error occurred.');
  }
}
