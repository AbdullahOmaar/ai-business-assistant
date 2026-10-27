import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ApiService, PlatformAdminOverview, PlatformAuditEvent, PlatformBusiness,
  PlatformBusinessDetails, PlatformMembership, PlatformSystemStatus
} from './api.service';

type AdminSection = 'overview' | 'businesses' | 'activity' | 'permissions';

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
          <div class="identity"><span class="avatar" aria-hidden="true">{{ initials }}</span><span><strong>{{ t('مدير المنصة', 'Platform administrator') }}</strong><small>{{ userEmail || t('جلسة إدارية موثقة', 'Verified admin session') }}</small></span></div>
          <button class="quiet-button" type="button" (click)="languageToggleRequested.emit()" [attr.aria-label]="t('تغيير اللغة', 'Change language')">{{ language === 'ar' ? 'English' : 'العربية' }}</button>
          <button class="quiet-button signout" type="button" (click)="signOutRequested.emit()">{{ t('خروج', 'Sign out') }}</button>
        </div>
      </header>

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
                  <div class="table-wrap compact-table"><table><thead><tr><th>{{ t('العملة', 'Currency') }}</th><th>{{ t('الحالة', 'Status') }}</th><th>{{ t('عدد', 'Count') }}</th><th>{{ t('الإجمالي', 'Total') }}</th></tr></thead><tbody>
                    @for (row of data.invoices.by_currency_and_status; track row.currency_code + row.status) {
                      <tr><td><strong>{{ row.currency_code }}</strong></td><td><span class="status-pill">{{ statusLabel(row.status) }}</span></td><td>{{ row.count }}</td><td class="amount">{{ money(row.total) }}</td></tr>
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
          @if (!businessesLoading && !businessesError && !businesses.length) { <div class="empty-panel"><span class="empty-icon" aria-hidden="true">▦</span><h3>{{ t('لا توجد نتائج', 'No workspaces found') }}</h3><p>{{ t('جرّب تغيير البحث أو الفلتر.', 'Try changing the search term or filter.') }}</p></div> }
          @if (businesses.length) {
            <div class="table-wrap"><table><thead><tr><th>{{ t('مساحة العمل', 'Workspace') }}</th><th>{{ t('الحالة', 'Status') }}</th><th>{{ t('العملة', 'Currency') }}</th><th>{{ t('الأعضاء', 'Members') }}</th><th>{{ t('تاريخ الإنشاء', 'Created') }}</th><th>{{ t('إجراء', 'Action') }}</th></tr></thead><tbody>
              @for (item of businesses; track item.id) {
                <tr><td><button type="button" class="business-link" (click)="openBusiness(item)"><strong>{{ item.name }}</strong><small>{{ item.contact_email || item.phone || item.id }}</small></button></td><td><span class="status-pill" [class.status-active]="item.is_active" [class.status-inactive]="!item.is_active"><span class="status-dot"></span>{{ item.is_active ? t('نشطة', 'Active') : t('معطّلة', 'Inactive') }}</span></td><td>{{ item.currency_code }}</td><td>{{ item.member_count }}</td><td>{{ formatDate(item.created_at) }}</td><td><button type="button" class="outline-button small-button" (click)="openBusiness(item)">{{ t('التفاصيل', 'Details') }}</button></td></tr>
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
                <div class="table-wrap compact-table"><table><thead><tr><th>{{ t('هوية المستخدم', 'User subject') }}</th><th>{{ t('الدور', 'Role') }}</th><th>{{ t('تاريخ الانضمام', 'Joined') }}</th></tr></thead><tbody>
                  @for (member of detail.memberships; track member.id) { <tr><td class="subject">{{ member.user_subject }}</td><td><span class="role-pill">{{ roleLabel(member.role) }}</span></td><td>{{ formatDate(member.created_at) }}</td></tr> }
                </tbody></table></div>
              } @else { <p class="empty-state">{{ t('لا توجد عضويات.', 'No memberships found.') }}</p> }
              <div class="caution"><strong>{{ t('إدارة الوصول إلى مساحة العمل', 'Workspace access control') }}</strong><p>{{ t('تعطيل مساحة العمل يمنع الوصول إلى بياناتها عبر تحقق العضوية. لا يؤدي ذلك إلى حذف الشركة أو سجلاتها.', 'Deactivating a workspace blocks membership-based access to its data. It does not delete the company or its records.') }}</p></div>
              <form class="status-form" (ngSubmit)="updateBusinessStatus()">
                <label><span>{{ t('الحالة المطلوبة', 'Desired status') }}</span><select name="desiredStatus" [(ngModel)]="desiredStatus"><option [ngValue]="true">{{ t('تفعيل الوصول', 'Activate access') }}</option><option [ngValue]="false">{{ t('تعطيل الوصول', 'Deactivate access') }}</option></select></label>
                <label class="reason-field"><span>{{ t('سبب إداري مطلوب', 'Required administrative reason') }}</span><textarea name="statusReason" [(ngModel)]="statusReason" maxlength="500" minlength="3" required rows="2" [placeholder]="t('اكتب سببًا واضحًا لتوثيقه في سجل التدقيق', 'Enter a meaningful reason; it will be recorded in the audit log')"></textarea></label>
                <button type="submit" class="primary-button" [disabled]="statusSaving || desiredStatus === detail.business.is_active">{{ statusSaving ? t('جارٍ حفظ التغيير…', 'Saving…') : (desiredStatus ? t('تأكيد تفعيل الوصول', 'Confirm activation') : t('تأكيد تعطيل الوصول', 'Confirm deactivation')) }}</button>
                @if (statusError) { <p class="field-error" role="alert">{{ statusError }}</p> }
              </form>
            </article>
          }
        </section>
      }

      @if (section === 'activity') {
        <section class="section-content" aria-labelledby="activity-title">
          <div class="section-heading"><div><p class="eyebrow">{{ t('سجل غير قابل للتعديل من الشاشة', 'READ-ONLY RECORD') }}</p><h2 id="activity-title">{{ t('سجل التدقيق والأمان', 'Audit & security activity') }}</h2><p>{{ t('أحداث إدارية من جميع مساحات العمل، للعرض والمراجعة فقط.', 'Administrative events across workspaces, for review only.') }}</p></div><button type="button" class="outline-button" [disabled]="auditLoading" (click)="loadAudit(auditOffset)">{{ t('تحديث', 'Refresh') }}</button></div>
          <form class="filters audit-filters" (ngSubmit)="loadAudit(0)"><label class="search-field"><span>{{ t('نوع العملية', 'Action') }}</span><input name="auditAction" maxlength="80" [(ngModel)]="auditAction" [placeholder]="t('مثال: platform.business.deactivated', 'e.g. platform.business.deactivated')"></label><label><span>{{ t('هوية المنفّذ', 'Actor identity') }}</span><input name="auditActor" maxlength="128" [(ngModel)]="auditActor" [placeholder]="t('هوية Firebase الموثقة', 'Verified Firebase subject')"></label><label><span>{{ t('معرّف مساحة العمل', 'Workspace ID') }}</span><input name="auditBusinessId" maxlength="36" [(ngModel)]="auditBusinessId" placeholder="UUID"></label><label><span>{{ t('من تاريخ ووقت', 'Created after') }}</span><input type="datetime-local" name="auditFrom" [(ngModel)]="auditFrom"></label><label><span>{{ t('إلى تاريخ ووقت', 'Created before') }}</span><input type="datetime-local" name="auditTo" [(ngModel)]="auditTo"></label><button type="submit" class="primary-button" [disabled]="auditLoading">{{ t('تصفية', 'Filter') }}</button></form>
          @if (auditLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t('جارٍ تحميل سجل التدقيق…', 'Loading audit events…') }}</div> }
          @if (auditError) { <div class="notice error" role="alert">{{ auditError }} <button type="button" class="text-action" (click)="loadAudit(auditOffset)">{{ t('إعادة المحاولة', 'Retry') }}</button></div> }
          @if (!auditLoading && !auditError && !auditEvents.length) { <div class="empty-panel"><span class="empty-icon" aria-hidden="true">◷</span><h3>{{ t('لا توجد أحداث مطابقة', 'No matching events') }}</h3><p>{{ t('سيظهر هنا نشاط الإدارة المسجل.', 'Recorded admin activity will appear here.') }}</p></div> }
          @if (auditEvents.length) {
            <div class="table-wrap"><table><thead><tr><th>{{ t('التاريخ', 'Timestamp') }}</th><th>{{ t('العملية', 'Action') }}</th><th>{{ t('الشركة', 'Workspace') }}</th><th>{{ t('المنفذ', 'Actor') }}</th><th>{{ t('الكيان', 'Target') }}</th><th>{{ t('الملخص', 'Summary') }}</th></tr></thead><tbody>
              @for (event of auditEvents; track event.id) { <tr><td class="date-cell">{{ formatDate(event.created_at) }}</td><td><span class="status-pill">{{ event.action }}</span></td><td><strong>{{ event.business_name }}</strong><small class="muted">{{ event.business_id }}</small></td><td class="subject">{{ event.actor_subject || '—' }}</td><td>{{ event.target_type }}<small class="muted">{{ event.target_id || '—' }}</small></td><td class="summary-cell">{{ event.change_summary || '—' }}</td></tr> }
            </tbody></table></div>
            <div class="pagination"><span>{{ t('عرض', 'Showing') }} {{ auditOffset + 1 }}–{{ auditOffset + auditEvents.length }} {{ t('من', 'of') }} {{ auditTotal }}</span><div><button type="button" class="outline-button" [disabled]="auditOffset === 0 || auditLoading" (click)="loadAudit(previousPageOffset(auditOffset))">{{ t('السابق', 'Previous') }}</button><button type="button" class="outline-button" [disabled]="auditOffset + pageSize >= auditTotal || auditLoading" (click)="loadAudit(auditOffset + pageSize)">{{ t('التالي', 'Next') }}</button></div></div>
          }
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
          <div class="notice warn" role="note"><strong>{{ t('قيود التنفيذ الحالية', 'Current implementation limits') }}</strong><p>{{ t('لا توجد قاعدة مستخدمين محلية أو آلية دعوة مستخدم إداري جاهزة؛ لذلك لا يتم إنشاء حسابات أو تغيير عضويات/أدوار من هذه الشاشة. قائمة مدير المنصة يجب أن يضبطها مسؤول البنية التحتية خارج الواجهة.', 'No local user directory or safe admin-invitation workflow exists yet; this screen therefore cannot create accounts or mutate memberships/roles. The platform admin allowlist must be configured out-of-band by infrastructure administration.') }}</p></div>
        </section>
      }
      <footer class="admin-footer"><span><span class="live-dot"></span>{{ t('متصل بالخادم عبر جلسة مصادقة موثقة', 'Connected through a verified authenticated session') }}</span><span>{{ t('لا توجد بيانات تجريبية', 'No demo data') }}</span></footer>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;color:#142333}
    *{box-sizing:border-box}
    button,input,select,textarea{font:inherit}
    button{cursor:pointer}
    button:disabled{opacity:.55;cursor:not-allowed}
    button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #0f766e;outline-offset:3px}
    .admin-shell{--ink:#142333;--muted:#637487;--line:#e2e9ef;--panel:#fff;--teal:#0e766e;--background:#f6f9fb;display:grid;gap:20px;min-width:0;color:var(--ink);font-size:14px;padding:2px 0 12px}
    .admin-shell.english{direction:ltr}
    .admin-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:10px 0 20px;border-bottom:1px solid var(--line);min-width:0}
    .heading{min-width:0}.eyebrow{margin:0 0 7px;color:#0e766e;font-size:10px;font-weight:800;letter-spacing:.11em}.heading h1{margin:0;color:#12253a;font-size:clamp(25px,3vw,32px);line-height:1.15;letter-spacing:-.04em}.heading p:not(.eyebrow){color:var(--muted);font-size:13px;line-height:1.6;max-width:620px;margin:10px 0 0}
    .identity-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap;max-width:52%}.identity{display:flex;align-items:center;gap:10px;margin-inline-end:8px;min-width:0}.identity>span:last-child{display:grid;gap:3px;min-width:0}.identity strong{font-size:12px}.identity small{font-size:11px;color:var(--muted);max-width:220px;overflow-wrap:anywhere}.avatar{width:35px;height:35px;border-radius:12px;background:#dff5ef;color:#087267;display:grid;place-items:center;font-weight:800;font-size:13px;flex:0 0 auto}
    .quiet-button,.outline-button,.primary-button,.text-action{border:1px solid #d8e2e9;background:#fff;border-radius:9px;padding:9px 12px;color:#284256;font-size:12px;font-weight:700;white-space:nowrap}.quiet-button:hover,.outline-button:hover{background:#f1f7f8;border-color:#b8d5d2}.signout{border-color:#e4d8d6;color:#9a4944}.primary-button{background:#0f766e;border-color:#0f766e;color:white}.primary-button:hover{background:#0b625b}.text-action{padding:0;border:0;background:transparent;color:#0f766e}
    .section-nav{display:flex;gap:6px;flex-wrap:wrap;padding:5px;background:#edf3f6;border:1px solid #e4ebf0;border-radius:12px;width:fit-content;max-width:100%}.section-nav button{display:flex;align-items:center;gap:8px;border:1px solid transparent;border-radius:9px;padding:10px 13px;color:#627387;background:transparent;font-size:12px;font-weight:700}.section-nav button.active{background:#fff;border-color:#e2e9ef;color:#0f766e;box-shadow:0 2px 8px #2033440b}.nav-count{background:#e7f5f2;color:#0f766e;border-radius:20px;padding:2px 7px;font-size:10px}
    .section-content{display:grid;gap:17px;min-width:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0}.section-heading>div{min-width:0}.section-heading .eyebrow{margin-bottom:5px}.section-heading h2{margin:0;font-size:22px;letter-spacing:-.025em}.section-heading p:not(.eyebrow){margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.55}.outline-button{flex:0 0 auto}.small-button{padding:6px 9px;font-size:11px}
    .system-status-panel{margin-bottom:16px}.runtime-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:11px;margin:10px 0 14px}.runtime-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.runtime-grid>div{display:grid;gap:6px;min-width:0;padding:11px;border:1px solid var(--line);border-radius:9px;background:var(--surface-soft)}.runtime-grid small{font-size:10px;color:var(--muted)}.runtime-grid strong{font-size:12px;overflow-wrap:anywhere}.runtime-grid .runtime-commit{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.runtime-good{color:#18784c}.runtime-bad{color:#a74436}.runtime-note{font-size:10px;line-height:1.5;color:var(--muted);margin:12px 0 0}
    .metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.metric-card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:15px;box-shadow:0 6px 18px #243b5307;min-width:0}.metric-card{padding:16px;display:flex;flex-direction:column;align-items:flex-start;gap:7px;min-height:155px}.metric-icon{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;font-size:15px;margin-bottom:4px}.teal{background:#dff5ee;color:#09776b}.blue{background:#e5f0ff;color:#2c62a2}.violet{background:#efeaff;color:#6c53ac}.amber{background:#fff2dc;color:#986015}.metric-card>span:not(.metric-icon){font-size:12px;color:#65778a;font-weight:650}.metric-card>strong{font-size:29px;letter-spacing:-.04em;color:#12263a;line-height:1.1;overflow-wrap:anywhere}.metric-card small{font-size:11px;color:#6c7c8e;line-height:1.45}
    .content-grid{display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.3fr);gap:14px}.panel{padding:17px}.panel-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;min-width:0}.panel-heading h3,.permission-card h3{margin:0;color:#1a2c40;font-size:15px}.panel-heading p{color:var(--muted);font-size:11px;line-height:1.5;margin:5px 0 0}.read-only{flex:0 0 auto;background:#eff7f5;color:#0f766e;border-radius:7px;padding:5px 7px;font-size:9px;font-weight:800;letter-spacing:.06em}.currency-list{display:grid;margin-top:15px}.currency-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid #edf1f4}.currency-row:last-child{border-bottom:0}.currency-row>div{display:grid;gap:3px}.currency-row>div strong{font-size:13px}.currency-row small{font-size:10px;color:var(--muted)}.amount{font-variant-numeric:tabular-nums;white-space:nowrap}.amount span{font-size:10px;color:#718195}.empty-state{color:#75879a;font-size:12px;line-height:1.5;padding:12px 0;margin:0}
    .table-wrap{min-width:0;max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:12px;background:white}.table-wrap table{border:0;border-collapse:separate;border-spacing:0;width:100%;min-width:760px;font-size:12px;text-align:start}.table-wrap th{background:#f7fafb;color:#63758a;font-size:10px;font-weight:800;white-space:nowrap}.table-wrap th,.table-wrap td{padding:12px 13px;border-bottom:1px solid #ebf0f3;text-align:start;vertical-align:middle;max-width:300px}.table-wrap tr:last-child td{border-bottom:0}.table-wrap tbody tr:hover td{background:#fbfdfd}.table-wrap td small{display:block;margin-top:4px}.compact-table table{min-width:420px}.compact-table th,.compact-table td{padding:10px}
    .filters{display:flex;align-items:flex-end;flex-wrap:wrap;gap:12px;padding:14px;background:white;border:1px solid var(--line);border-radius:12px}.filters label,.status-form label{display:grid;gap:6px;color:#485d72;font-size:11px;font-weight:750;min-width:0}.filters label>span,.status-form label>span{color:#5f7387}.filters .search-field{flex:1 1 250px}.filters label:not(.search-field){flex:0 0 170px}.filters input,.filters select,.status-form select,.status-form textarea{min-width:0;width:100%;border:1px solid #d9e3e9;border-radius:8px;padding:10px 11px;background:#fff;color:#24374a;font-size:12px}.filters input::placeholder,.status-form textarea::placeholder{color:#95a4b2}.business-link{display:grid;gap:4px;background:transparent;border:0;padding:0;text-align:start;color:#173a4c;max-width:100%;white-space:normal}.business-link strong{font-size:12px}.business-link small{color:#6e8090;font-size:10px;overflow-wrap:anywhere}.status-pill,.role-pill{display:inline-flex;gap:6px;align-items:center;border-radius:99px;padding:5px 8px;background:#eef3f6;color:#52677a;font-size:10px;font-weight:750;white-space:nowrap}.status-active{background:#e1f6ea;color:#18784c}.status-inactive{background:#fff0ed;color:#a74436}.status-dot,.live-dot{width:6px;height:6px;display:inline-block;border-radius:50%;background:currentColor}.pagination{display:flex;justify-content:space-between;align-items:center;gap:12px;color:var(--muted);font-size:11px}.pagination>div{display:flex;gap:7px}.pagination button{padding:7px 10px}.empty-panel{border:1px dashed #d4e0e7;border-radius:14px;background:white;padding:32px 18px;text-align:center}.empty-panel h3{margin:12px 0 4px;font-size:15px}.empty-panel p{margin:0;color:var(--muted);font-size:12px}.empty-icon{width:42px;height:42px;border-radius:13px;display:inline-grid;place-items:center;background:#eef8f5;color:#0f766e;font-size:21px}
    .detail-panel{display:grid;gap:15px;scroll-margin-top:20px}.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.detail-grid>div{display:grid;gap:7px;min-width:0;padding:12px;border:1px solid #edf1f4;border-radius:9px}.detail-grid small{font-size:10px;color:var(--muted)}.detail-grid strong{font-size:12px;overflow-wrap:anywhere}.divider{height:1px;background:var(--line)}.subject{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;white-space:normal;max-width:260px;font-size:11px}.role-pill{background:#eff4f7}.role-pill.accent{background:#e2f5ef;color:#0e766e}.muted-role{color:#6d7781}.caution{padding:12px 14px;border:1px solid #f2deb4;border-radius:10px;background:#fff9eb}.caution strong{font-size:12px;color:#85520d}.caution p{color:#876831;font-size:11px;line-height:1.6;margin:5px 0 0}.status-form{border-top:1px solid var(--line);padding-top:14px;display:grid;grid-template-columns:minmax(160px,.7fr) minmax(230px,1.5fr) auto;gap:12px;align-items:end}.status-form textarea{resize:vertical;line-height:1.5}.field-error{grid-column:1/-1;margin:0;color:#af392c;font-size:11px}
    .audit-filters label:not(.search-field){flex:1 1 185px}.date-cell{white-space:nowrap}.summary-cell{min-width:170px;white-space:normal;overflow-wrap:anywhere;line-height:1.5}.muted{color:var(--muted)}
    .permission-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.permission-card{display:flex;align-items:flex-start;gap:13px;background:white;border:1px solid var(--line);border-radius:14px;padding:17px;min-width:0}.permission-icon{width:34px;height:34px;flex:0 0 34px;display:grid;place-items:center;background:#edf4f7;border-radius:11px;color:#2a6270;font-size:16px}.permission-card.platform{grid-column:1/-1;background:linear-gradient(135deg,#ffffff 35%,#f0faf7 100%);border-color:#cce7df}.permission-card>div{min-width:0}.permission-card h3{margin:9px 0 6px}.permission-card p,.permission-card li{font-size:12px;color:#5c6f82;line-height:1.7}.permission-card p{margin:0}.permission-card ul{margin:9px 0 0;padding-inline-start:20px;display:grid;gap:2px}.permission-card li::marker{color:#0f766e}.accent{background:#e0f5ee;color:#0e766e}.notice{border-radius:11px;padding:12px 14px;font-size:12px;line-height:1.6;display:flex;align-items:center;justify-content:space-between;gap:12px;overflow-wrap:anywhere}.notice p{margin:5px 0 0}.notice.error{color:#94372c;border:1px solid #f2d4cf;background:#fff7f6}.notice.success{color:#176644;border:1px solid #c9ead8;background:#f0fcf5}.notice.warn{display:block;color:#7b541b;border:1px solid #efdcae;background:#fff9e9}.loading-block{display:flex;align-items:center;gap:10px;padding:18px 14px;color:#697c8e;font-size:12px;border:1px dashed #dbe5eb;border-radius:12px;background:white}.spinner{width:16px;height:16px;border:2px solid #d7e7e7;border-top-color:#0f766e;border-radius:50%;animation:spin .8s linear infinite;flex:0 0 auto}@keyframes spin{to{transform:rotate(360deg)}}.data-note{display:flex;gap:10px;align-items:flex-start;color:#506e82;background:#eef7fb;border:1px solid #d7eaf2;border-radius:11px;padding:13px}.data-note>span{color:#0d7081;font-size:16px}.data-note strong{font-size:12px}.data-note p{font-size:11px;line-height:1.7;margin:4px 0 7px;color:#597184}.data-note small{font-size:10px;color:#758b9b}.admin-footer{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:14px;color:#758698;font-size:10px}.admin-footer>span{display:flex;align-items:center;gap:7px}.live-dot{background:#21a36c;box-shadow:0 0 0 3px #21a36c20}
    @media(max-width:1050px){.runtime-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.content-grid{grid-template-columns:1fr}.table-wrap table{min-width:700px}.status-form{grid-template-columns:1fr 1.5fr}.status-form .primary-button{grid-column:1/-1;justify-self:start}}
    @media(max-width:760px){.runtime-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-shell{gap:15px}.admin-header{display:grid;gap:14px}.identity-actions{max-width:none;justify-content:flex-start}.identity{flex:1 1 100%}.section-nav{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.section-nav button{justify-content:flex-start;padding:10px;min-width:0}.section-heading{align-items:flex-start}.section-heading h2{font-size:19px}.section-heading>.outline-button{max-width:45%;white-space:normal}.filters{align-items:stretch}.filters .search-field,.filters label:not(.search-field){flex:1 1 100%}.filters .primary-button{width:100%}.detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.permission-grid{grid-template-columns:1fr}.permission-card.platform{grid-column:auto}.pagination{align-items:flex-start;flex-direction:column}.pagination>div{width:100%}.pagination button{flex:1}.table-wrap{margin-inline:-1px}.admin-footer{font-size:10px}}
    @media(max-width:480px){.heading h1{font-size:25px}.metric-grid{gap:9px}.metric-card{padding:12px;min-height:140px}.metric-card>strong{font-size:25px}.metric-card>span:not(.metric-icon){font-size:11px}.metric-card small{font-size:10px}.metric-icon{width:29px;height:29px}.panel{padding:12px}.detail-grid{grid-template-columns:1fr 1fr;gap:8px}.detail-grid>div{padding:9px}.status-form{grid-template-columns:1fr}.status-form .primary-button{grid-column:auto;width:100%}.identity small{max-width:160px}.quiet-button{padding:8px 10px}.section-nav button{gap:6px;font-size:11px}.notice{align-items:flex-start}}
    .system-status-panel{margin-bottom:16px}.runtime-summary{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:11px;margin:10px 0 14px}.runtime-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.runtime-grid>div{display:grid;gap:6px;min-width:0;padding:11px;border:1px solid var(--line);border-radius:9px;background:var(--surface-soft)}.runtime-grid small{font-size:10px;color:var(--muted)}.runtime-grid strong{font-size:12px;overflow-wrap:anywhere}.runtime-grid .runtime-commit{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.runtime-good{color:#18784c}.runtime-bad{color:#a74436}.runtime-note{font-size:10px;line-height:1.5;color:var(--muted);margin:12px 0 0}
    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
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
  auditAction = '';
  auditActor = '';
  auditBusinessId = '';
  auditFrom = '';
  auditTo = '';

  constructor(private readonly api: ApiService) {}

  ngOnInit(): void {
    void this.refreshOverview();
    void this.refreshSystemStatus();
    void this.loadBusinesses(0);
    void this.loadAudit(0);
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
      this.overviewError = this.errorText(error);
      this.pageError = this.overviewError;
    } finally {
      this.overviewLoading = false;
    }
  }

  setSection(section: AdminSection): void {
    this.section = section;
    if (section === 'businesses' && this.businesses.length === 0) void this.loadBusinesses(0);
    if (section === 'activity' && this.auditEvents.length === 0) void this.loadAudit(0);
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
    if (reason.length < 3) {
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
