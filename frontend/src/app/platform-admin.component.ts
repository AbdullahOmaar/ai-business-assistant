import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LocalizationService } from './localization.service';
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
          <p class="eyebrow">{{ t("ui.m_155faki") }}</p>
          <h1>{{ t("ui.m_56p24") }}</h1>
          <p>{{ t("ui.m_3ejvw0") }}</p>
        </div>
        <div class="identity-actions">
          <div class="identity"><span class="avatar" aria-hidden="true">{{ initials }}</span><span><strong>{{ access?.is_platform_super_admin ? t("ui.m_1tjgh5f") : t("ui.m_7fhsvk") }}</strong><small>{{ userEmail || t("ui.m_9x0vvs") }}</small></span></div>
          <button class="quiet-button" type="button" (click)="languageToggleRequested.emit()" [attr.aria-label]="t("ui.m_1bzusoy")">{{ language === 'ar' ? 'English' : 'العربية' }}</button>
          <button class="quiet-button signout" type="button" (click)="signOutRequested.emit()">{{ t("ui.m_1ivd8ld") }}</button>
        </div>
      </header>

      @if (access; as currentAccess) {
        <section class="identity-access-summary" [attr.aria-label]="t("ui.m_jpiw37")">
          <div class="identity-access-top">
            <div class="identity-access-heading"><strong>{{ t("ui.m_ovbttk") }}</strong><small class="user-uid">{{ currentAccess.subject }}</small></div>
            <div class="identity-role-pills">@for (role of currentAccess.roles; track role) { <span class="role-pill" [class.accent]="role === 'platform_super_admin'">{{ platformRoleLabel(role) }}</span> }</div>
          </div>
          <div class="identity-permissions"><strong>{{ t("ui.m_dkxeji") }}</strong><div class="identity-permission-tags">@for (permission of currentAccess.permissions; track permission) { <span class="permission-token">{{ platformPermissionLabel(permission) }}</span> }</div></div>
        </section>
      }

      @if (pageError) {
        <div class="notice error" role="alert"><span>{{ pageError }}</span><button type="button" class="text-action" (click)="refreshAll()">{{ t("ui.m_worzj7") }}</button></div>
      }
      @if (successMessage) {
        <div class="notice success" role="status" aria-live="polite">{{ successMessage }}</div>
      }

      <p class="admin-visually-hidden admin-section-announcement" role="status" aria-live="polite" aria-atomic="true">{{ sectionAnnouncement }}</p>

      <nav class="section-nav" [attr.aria-label]="t("ui.m_ugxotp")">
        <button type="button" [class.active]="section === 'overview'" [attr.aria-current]="section === 'overview' ? 'page' : null" (click)="setSection('overview')"><span aria-hidden="true">◫</span>{{ t("ui.m_kazjgg") }}</button>
        <button type="button" [class.active]="section === 'businesses'" [attr.aria-current]="section === 'businesses' ? 'page' : null" (click)="setSection('businesses')"><span aria-hidden="true">▦</span>{{ t("ui.m_1p3i223") }}<span class="nav-count">{{ overview?.businesses?.total ?? '—' }}</span></button>
        <button type="button" [class.active]="section === 'activity'" [attr.aria-current]="section === 'activity' ? 'page' : null" (click)="setSection('activity')"><span aria-hidden="true">◷</span>{{ t("ui.m_t34ukc") }}</button>
        @if (canViewUsers) { <button type="button" [class.active]="section === 'users'" [attr.aria-current]="section === 'users' ? 'page' : null" (click)="setSection('users')"><span aria-hidden="true">♙</span>{{ t("ui.m_qv5wq3") }}<span class="nav-count">{{ users.length || '—' }}</span></button> }
        <button type="button" [class.active]="section === 'permissions'" [attr.aria-current]="section === 'permissions' ? 'page' : null" (click)="setSection('permissions')"><span aria-hidden="true">◇</span>{{ t("ui.m_1ivb1p6") }}</button>
      </nav>

      @if (section === 'overview') {
        <section class="section-content" aria-labelledby="overview-title">
          <div class="section-heading">
            <div><p class="eyebrow">{{ t("ui.m_12uuupk") }}</p><h2 id="overview-title">{{ t("ui.m_1wgrtvq") }}</h2><p>{{ t("ui.m_148yegh") }}</p></div>
            <button class="outline-button" type="button" [disabled]="overviewLoading" (click)="refreshOverview()">{{ overviewLoading ? t("ui.m_9itqx5") : t("ui.m_82ies4") }}</button>
          </div>
          @if (overviewLoading && !overview) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t("ui.m_xvsoti") }}</div> }
          @if (overviewError && !overviewLoading) { <div class="notice error" role="alert">{{ overviewError }} <button class="text-action" type="button" (click)="refreshOverview()">{{ t("ui.m_worzj7") }}</button></div> }
          <article class="panel system-status-panel" aria-labelledby="system-status-title">
            <div class="panel-heading">
              <div><p class="eyebrow">{{ t("ui.m_jzstn9") }}</p><h3 id="system-status-title">{{ t("ui.m_1dccarp") }}</h3><p>{{ t("ui.m_1rpjlyg") }}</p></div>
              <button type="button" class="outline-button" [disabled]="systemStatusLoading" (click)="refreshSystemStatus()">{{ systemStatusLoading ? t("ui.m_1v22gnm") : t("ui.m_s4cze9") }}</button>
            </div>
            @if (systemStatusLoading && !systemStatus) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t("ui.m_m1a8l7") }}</div> }
            @if (systemStatusError) { <div class="notice error" role="alert">{{ systemStatusError }} <button type="button" class="text-action" (click)="refreshSystemStatus()">{{ t("ui.m_worzj7") }}</button></div> }
            @if (systemStatus; as runtime) {
              <div class="runtime-summary">
                <span class="status-pill" [class.status-active]="runtime.status === 'healthy'" [class.status-inactive]="runtime.status !== 'healthy'">{{ runtime.status === 'healthy' ? t("ui.m_1nehj8y") : t("ui.m_124oetm") }}</span>
                <span>{{ t("ui.m_j0rvp2") }}: {{ formatDate(runtime.checked_at) }}</span>
              </div>
              <div class="runtime-grid">
                <div><small>{{ t("ui.m_rstf48") }}</small><strong>{{ runtime.release.version }}</strong></div>
                <div><small>{{ t("ui.m_kfa737") }}</small><strong class="runtime-commit">{{ runtime.release.commit }}</strong></div>
                <div><small>{{ t("ui.m_18jbefg") }}</small><strong>{{ runtime.release.environment }}</strong></div>
                <div><small>{{ t("ui.m_19gqnqb") }}</small><strong [class.runtime-good]="runtime.dependencies.database === 'healthy'" [class.runtime-bad]="runtime.dependencies.database !== 'healthy'">{{ dependencyStatusLabel(runtime.dependencies.database) }}</strong></div>
                <div><small>{{ t("ui.m_4w9yov") }}</small><strong [class.runtime-good]="runtime.dependencies.identity_verifier === 'configured'" [class.runtime-bad]="runtime.dependencies.identity_verifier !== 'configured'">{{ dependencyStatusLabel(runtime.dependencies.identity_verifier) }}</strong></div>
              </div>
              <p class="runtime-note">{{ t("ui.m_b2hg4d") }}</p>
            }
          </article>
          @if (overview; as data) {
            <div class="metric-grid">
              <article class="metric-card"><div class="metric-icon teal" aria-hidden="true">▦</div><span>{{ t("ui.m_1p3i223") }}</span><strong>{{ data.businesses.total }}</strong><small>{{ data.businesses.active }} {{ t("ui.m_1c1qlur") }} · {{ data.businesses.inactive }} {{ t("ui.m_hycebt") }}</small></article>
              <article class="metric-card"><div class="metric-icon blue" aria-hidden="true">♙</div><span>{{ t("ui.m_1y8yhc5") }}</span><strong>{{ data.users.distinct_subjects }}</strong><small>{{ data.users.memberships }} {{ t("ui.m_xh7u06") }}</small></article>
              <article class="metric-card"><div class="metric-icon violet" aria-hidden="true">▤</div><span>{{ t("ui.m_1h7f08p") }}</span><strong>{{ data.invoices.count }}</strong><small>{{ t("ui.m_bbxnum") }}</small></article>
              <article class="metric-card"><div class="metric-icon amber" aria-hidden="true">↗</div><span>{{ t("ui.m_jas5j") }}</span><strong>{{ data.payments.count }}</strong><small>{{ data.audit_events.count }} {{ t("ui.m_m1qy2r") }}</small></article>
            </div>
            <div class="content-grid">
              <article class="panel">
                <div class="panel-heading"><div><h3>{{ t("ui.m_j4ycx3") }}</h3><p>{{ t("ui.m_hekau") }}</p></div><span class="read-only">{{ t("ui.m_1bvwx8l") }}</span></div>
                @if (data.payments.by_currency.length) {
                  <div class="currency-list">
                    @for (row of data.payments.by_currency; track row.currency_code) {
                      <div class="currency-row"><div><strong>{{ row.currency_code }}</strong><small>{{ row.count }} {{ t("ui.m_189ya4o") }}</small></div><strong class="amount">{{ money(row.total) }} <span>{{ row.currency_code }}</span></strong></div>
                    }
                  </div>
                } @else { <p class="empty-state">{{ t("ui.m_1uba10p") }}</p> }
              </article>
              <article class="panel">
                <div class="panel-heading"><div><h3>{{ t("ui.m_muhair") }}</h3><p>{{ t("ui.m_1q2w084") }}</p></div></div>
                @if (data.invoices.by_currency_and_status.length) {
                  <div class="table-wrap compact-table" role="region" tabindex="0" [attr.aria-label]="t("ui.m_g7rvs3")"><table><thead><tr><th>{{ t("ui.m_1jd5ck6") }}</th><th>{{ t("ui.m_jnmvwl") }}</th><th>{{ t("ui.m_xmzt5p") }}</th><th>{{ t("ui.m_l97slj") }}</th></tr></thead><tbody>
                    @for (row of data.invoices.by_currency_and_status; track row.currency_code + row.status) {
                      <tr><td [attr.data-label]="t("ui.m_1jd5ck6")"><strong>{{ row.currency_code }}</strong></td><td [attr.data-label]="t("ui.m_jnmvwl")"><span class="status-pill">{{ statusLabel(row.status) }}</span></td><td [attr.data-label]="t("ui.m_xmzt5p")">{{ row.count }}</td><td class="amount" [attr.data-label]="t("ui.m_l97slj")">{{ money(row.total) }}</td></tr>
                    }
                  </tbody></table></div>
                } @else { <p class="empty-state">{{ t("ui.m_1veyhcz") }}</p> }
              </article>
            </div>
            <div class="data-note"><span aria-hidden="true">ⓘ</span><div><strong>{{ t("ui.m_1c296wr") }}</strong><p>{{ t("ui.m_ht8e62") }}</p><small>{{ t("ui.m_on0mak") }}: {{ formatDate(data.generated_at) }}</small></div></div>
          }
        </section>
      }

      @if (section === 'businesses') {
        <section class="section-content" aria-labelledby="businesses-title">
          <div class="section-heading"><div><p class="eyebrow">{{ t("ui.m_x1ssgf") }}</p><h2 id="businesses-title">{{ t("ui.m_1p3i223") }}</h2><p>{{ t("ui.m_sfjizi") }}</p></div><button class="outline-button" type="button" [disabled]="businessesLoading" (click)="loadBusinesses(businessOffset)">{{ t("ui.m_1xv1qef") }}</button></div>
          <form class="filters" (ngSubmit)="loadBusinesses(0)">
            <label class="search-field"><span>{{ t("ui.m_11ucx5t") }}</span><input name="businessSearch" [(ngModel)]="businessQuery" maxlength="160" [placeholder]="t("ui.m_1m8fzmr")" /></label>
            <label><span>{{ t("ui.m_1f79eee") }}</span><select name="businessStatus" [(ngModel)]="businessStatus"><option value="all">{{ t("ui.m_1cyu9lp") }}</option><option value="active">{{ t("ui.m_1vhpjk3") }}</option><option value="inactive">{{ t("ui.m_1qniai1") }}</option></select></label>
            <label><span>{{ t("ui.m_tpfmbp") }}</span><select name="businessSortBy" [(ngModel)]="businessSortBy"><option value="created_at">{{ t("ui.m_cpho72") }}</option><option value="name">{{ t("ui.m_1htn242") }}</option><option value="members">{{ t("ui.m_1aktafq") }}</option></select></label>
            <label><span>{{ t("ui.m_1b0eoyh") }}</span><select name="businessSortOrder" [(ngModel)]="businessSortOrder"><option value="desc">{{ t("ui.m_1gc9ofo") }}</option><option value="asc">{{ t("ui.m_1gvraov") }}</option></select></label>
            <button class="primary-button" type="submit" [disabled]="businessesLoading">{{ t("ui.m_agqz0i") }}</button>
          </form>
          @if (businessesLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t("ui.m_6s36po") }}</div> }
          @if (businessesError) { <div class="notice error" role="alert">{{ businessesError }} <button class="text-action" type="button" (click)="loadBusinesses(businessOffset)">{{ t("ui.m_worzj7") }}</button></div> }
          @if (!businessesLoading && !businessesError && !businesses.length) { <div class="empty-panel"><span class="empty-icon" aria-hidden="true">▦</span><h3>{{ businessQuery.trim() || businessStatus !== 'all' ? t("ui.m_11xxs14") : businessOffset > 0 ? t("ui.m_9jlflr") : t("ui.m_anqh3m") }}</h3><p>{{ businessQuery.trim() || businessStatus !== 'all' ? t("ui.m_3to1hb") : businessOffset > 0 ? t("ui.m_1s5fo") : t("ui.m_z3jx15") }}</p></div> }
          @if (businesses.length) {
            <div class="table-wrap" role="region" tabindex="0" [attr.aria-label]="t("ui.m_1adics7")"><table><thead><tr><th>{{ t("ui.m_criw1m") }}</th><th>{{ t("ui.m_jnmvwl") }}</th><th>{{ t("ui.m_1jd5ck6") }}</th><th>{{ t("ui.m_1po8c03") }}</th><th>{{ t("ui.m_1pb5uxl") }}</th><th>{{ t("ui.m_1tj6aj7") }}</th></tr></thead><tbody>
              @for (item of businesses; track item.id) {
                <tr><td [attr.data-label]="t("ui.m_criw1m")"><button type="button" class="business-link" (click)="openBusiness(item)"><strong>{{ item.name }}</strong><small>{{ item.contact_email || item.phone || item.id }}</small></button></td><td [attr.data-label]="t("ui.m_jnmvwl")"><span class="status-pill" [class.status-active]="item.is_active" [class.status-inactive]="!item.is_active"><span class="status-dot"></span>{{ item.is_active ? t("ui.m_1vhpjk3") : t("ui.m_1qniai1") }}</span></td><td [attr.data-label]="t("ui.m_1jd5ck6")">{{ item.currency_code }}</td><td [attr.data-label]="t("ui.m_1po8c03")">{{ item.member_count }}</td><td [attr.data-label]="t("ui.m_1pb5uxl")">{{ formatDate(item.created_at) }}</td><td [attr.data-label]="t("ui.m_1tj6aj7")"><button type="button" class="outline-button small-button" (click)="openBusiness(item)">{{ t("ui.m_1pjqkqz") }}</button></td></tr>
              }
            </tbody></table></div>
            <div class="pagination"><span>{{ t("ui.m_dxe4hc") }} {{ businesses.length ? businessOffset + 1 : 0 }}–{{ businessOffset + businesses.length }} {{ t("ui.m_14bv2kn") }} {{ businessTotal }}</span><div><button type="button" class="outline-button" [disabled]="businessOffset === 0 || businessesLoading" (click)="loadBusinesses(previousPageOffset(businessOffset))">{{ t("ui.m_14wy3hz") }}</button><button type="button" class="outline-button" [disabled]="businessOffset + pageSize >= businessTotal || businessesLoading" (click)="loadBusinesses(businessOffset + pageSize)">{{ t("ui.m_thb9eg") }}</button></div></div>
          }
          @if (detailsLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t("ui.m_19lf0pe") }}</div> }
          @if (detailsError) { <div class="notice error" role="alert">{{ detailsError }}</div> }
          @if (selectedDetails; as detail) {
            <article class="panel detail-panel">
              <div class="panel-heading"><div><p class="eyebrow">{{ t("ui.m_jvy8eb") }}</p><h3>{{ detail.business.name }}</h3><p>{{ detail.business.id }}</p></div><button type="button" class="quiet-button" (click)="closeDetails()" [attr.aria-label]="t("ui.m_a27klb")">✕</button></div>
              <div class="detail-grid"><div><small>{{ t("ui.m_jnmvwl") }}</small><strong>{{ detail.business.is_active ? t("ui.m_1vhpjk3") : t("ui.m_1qniai1") }}</strong></div><div><small>{{ t("ui.m_1jd5ck6") }}</small><strong>{{ detail.business.currency_code }}</strong></div><div><small>{{ t("ui.m_z76sxh") }}</small><strong>{{ detail.business.timezone }}</strong></div><div><small>{{ t("ui.m_1tll4bb") }}</small><strong>{{ detail.business.locale }}</strong></div><div><small>{{ t("ui.m_1gs5fxq") }}</small><strong>{{ formatDate(detail.business.created_at) }}</strong></div><div><small>{{ t("ui.m_1gx4tuu") }}</small><strong>{{ detail.business.contact_email || '—' }}</strong></div></div>
              <div class="divider"></div>
              <div class="panel-heading"><div><h3>{{ t("ui.m_u221id") }}</h3><p>{{ t("ui.m_87wf3m") }}</p></div><span class="read-only">{{ detail.memberships.length }} {{ t("ui.m_1rmkf0y") }}</span></div>
              @if (detail.memberships.length) {
                <div class="table-wrap compact-table" role="region" tabindex="0" [attr.aria-label]="t("ui.m_1jgl90d")"><table><thead><tr><th>{{ t("ui.m_11tlzkd") }}</th><th>{{ t("ui.m_d13ak8") }}</th><th>{{ t("ui.m_aoacnl") }}</th></tr></thead><tbody>
                  @for (member of detail.memberships; track member.id) { <tr><td class="subject" [attr.data-label]="t("ui.m_11tlzkd")">{{ member.user_subject }}</td><td [attr.data-label]="t("ui.m_d13ak8")"><span class="role-pill">{{ roleLabel(member.role) }}</span></td><td [attr.data-label]="t("ui.m_aoacnl")">{{ formatDate(member.created_at) }}</td></tr> }
                </tbody></table></div>
              } @else { <p class="empty-state">{{ t("ui.m_15cikyt") }}</p> }
              <div class="caution"><strong>{{ t("ui.m_35cyug") }}</strong><p>{{ t("ui.m_g1s438") }}</p></div>
              @if (canManageWorkspaceStatus) {
                <form class="status-form" (ngSubmit)="updateBusinessStatus()">
                  <label><span>{{ t("ui.m_1cj2kup") }}</span><select name="desiredStatus" [(ngModel)]="desiredStatus"><option [ngValue]="true">{{ t("ui.m_1ju5tzi") }}</option><option [ngValue]="false">{{ t("ui.m_1dleja9") }}</option></select></label>
                  <label class="reason-field"><span>{{ t("ui.m_goumq7") }}</span><textarea name="statusReason" [(ngModel)]="statusReason" maxlength="500" minlength="3" required rows="2" [placeholder]="t("ui.m_lg7oo9")"></textarea></label>
                  <button type="submit" class="primary-button" [disabled]="statusSaving || desiredStatus === detail.business.is_active">{{ statusSaving ? t("ui.m_ihp010") : (desiredStatus ? t("ui.m_1xvwxr2") : t("ui.m_1ph4efb")) }}</button>
                  @if (statusError) { <p class="field-error" role="alert">{{ statusError }}</p> }
                </form>
              } @else {
                <div class="notice" role="note">{{ t("ui.m_1snq8pd") }}</div>
              }
            </article>
          }
        </section>
      }

      @if (section === 'activity') {
        <section class="section-content" aria-labelledby="activity-title">
          <div class="section-heading"><div><p class="eyebrow">{{ t("ui.m_81mof2") }}</p><h2 id="activity-title">{{ t("ui.m_1fkz3i8") }}</h2><p>{{ t("ui.m_1ngougt") }}</p></div><div class="heading-actions"><button type="button" class="outline-button" [disabled]="auditLoading" (click)="loadAudit(auditOffset)">{{ t("ui.m_5kbtnp") }}</button><button type="button" class="primary-button" [disabled]="auditExporting" (click)="exportAudit()">{{ auditExporting ? t("ui.m_14clr52") : t("ui.m_nbsw3y") }}</button></div></div>
          @if (auditExportError) { <div class="notice error" role="alert">{{ auditExportError }}</div> }
          @if (auditExportMessage) { <div class="notice success" role="status" aria-live="polite">{{ auditExportMessage }}</div> }
          <form class="filters audit-filters" (ngSubmit)="loadAudit(0)"><label class="search-field"><span>{{ t("ui.m_16u0xte") }}</span><input name="auditAction" maxlength="80" [(ngModel)]="auditAction" [placeholder]="t("ui.m_twpwlc")"></label><label><span>{{ t("ui.m_11omtlm") }}</span><input name="auditActor" maxlength="128" [(ngModel)]="auditActor" [placeholder]="t("ui.m_1fly0iz")"></label><label><span>{{ t("ui.m_14i0qtu") }}</span><input name="auditBusinessId" maxlength="36" [(ngModel)]="auditBusinessId" placeholder="UUID"></label><label><span>{{ t("ui.m_1yem9by") }}</span><input type="datetime-local" name="auditFrom" [(ngModel)]="auditFrom"></label><label><span>{{ t("ui.m_1ue0nva") }}</span><input type="datetime-local" name="auditTo" [(ngModel)]="auditTo"></label><button type="submit" class="primary-button" [disabled]="auditLoading">{{ t("ui.m_11q6v6c") }}</button></form>
          @if (auditLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t("ui.m_vtd5n1") }}</div> }
          @if (auditError) { <div class="notice error" role="alert">{{ auditError }} <button type="button" class="text-action" (click)="loadAudit(auditOffset)">{{ t("ui.m_worzj7") }}</button></div> }
          @if (!auditLoading && !auditError && !auditEvents.length) { <div class="empty-panel"><span class="empty-icon" aria-hidden="true">◷</span><h3>{{ t("ui.m_7kra7p") }}</h3><p>{{ t("ui.m_vn6jmq") }}</p></div> }
          @if (auditEvents.length) {
            <div class="table-wrap" role="region" tabindex="0" [attr.aria-label]="t("ui.m_x4vism")"><table><thead><tr><th>{{ t("ui.m_vucw08") }}</th><th>{{ t("ui.m_bnvfl5") }}</th><th>{{ t("ui.m_17isxeg") }}</th><th>{{ t("ui.m_s2x2wd") }}</th><th>{{ t("ui.m_lm1d6n") }}</th><th>{{ t("ui.m_1tfe97u") }}</th></tr></thead><tbody>
              @for (event of auditEvents; track event.id) { <tr><td class="date-cell" [attr.data-label]="t("ui.m_vucw08")">{{ formatDate(event.created_at) }}</td><td [attr.data-label]="t("ui.m_bnvfl5")"><span class="status-pill">{{ auditActionLabel(event.action) }}</span></td><td [attr.data-label]="t("ui.m_17isxeg")"><strong>{{ event.business_name }}</strong><small class="muted">{{ event.business_id }}</small></td><td class="subject" [attr.data-label]="t("ui.m_s2x2wd")">{{ event.actor_subject || '—' }}</td><td [attr.data-label]="t("ui.m_lm1d6n")">{{ auditTargetLabel(event.target_type) }}<small class="muted">{{ event.target_id || '—' }}</small></td><td class="summary-cell" [attr.data-label]="t("ui.m_1tfe97u")">{{ event.change_summary || '—' }}</td></tr> }
            </tbody></table></div>
            <div class="pagination"><span>{{ t("ui.m_dxe4hc") }} {{ auditOffset + 1 }}–{{ auditOffset + auditEvents.length }} {{ t("ui.m_14bv2kn") }} {{ auditTotal }}</span><div><button type="button" class="outline-button" [disabled]="auditOffset === 0 || auditLoading" (click)="loadAudit(previousPageOffset(auditOffset))">{{ t("ui.m_14wy3hz") }}</button><button type="button" class="outline-button" [disabled]="auditOffset + pageSize >= auditTotal || auditLoading" (click)="loadAudit(auditOffset + pageSize)">{{ t("ui.m_thb9eg") }}</button></div></div>
          }
        </section>
      }


      @if (section === 'users' && canViewUsers) {
        <section class="section-content" aria-labelledby="users-title">
          <div class="section-heading">
            <div><p class="eyebrow">{{ t("ui.m_159ttlt") }}</p><h2 id="users-title">{{ t("ui.m_qv5wq3") }}</h2><p>{{ t("ui.m_v3vm8j") }}</p></div>
            <button class="outline-button" type="button" [disabled]="usersLoading" (click)="loadUsers(0, true)">{{ t("ui.m_3h5ms6") }}</button>
          </div>
          <div class="data-note"><span aria-hidden="true">ⓘ</span><div><strong>{{ t("ui.m_8u8pdx") }}</strong><p>{{ t("ui.m_7m4mfn") }}</p><small>{{ t("ui.m_1lnx01m") }}</small></div></div>
          <form class="filters" (ngSubmit)="searchUsers()">
            <label class="search-field"><span>{{ t("ui.m_1aeosv4") }}</span><input name="userQuery" maxlength="254" [(ngModel)]="userQuery" [placeholder]="t("ui.m_13pefsd")"></label>
            <button type="submit" class="primary-button" [disabled]="usersLoading">{{ t("ui.m_11ucx5t") }}</button>
            @if (userQuery) { <button type="button" class="outline-button" [disabled]="usersLoading" (click)="userQuery=''; searchUsers()">{{ t("ui.m_yxfbrp") }}</button> }
          </form>
          @if (usersLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t("ui.m_1jn0uis") }}</div> }
          @if (usersError) { <div class="notice error" role="alert">{{ usersError }} <button type="button" class="text-action" (click)="loadUsers(userPageIndex)">{{ t("ui.m_worzj7") }}</button></div> }
          @if (!usersLoading && !usersError && !users.length) { <div class="empty-panel"><span class="empty-icon" aria-hidden="true">♙</span><h3>{{ userQuery.trim() ? t("ui.m_120nvvf") : t("ui.m_hfxoa") }}</h3><p>{{ userQuery.trim() ? t("ui.m_fgk9ur") : t("ui.m_knureo") }}</p></div> }
          @if (!usersLoading && users.length) {
            <div class="table-wrap" role="region" tabindex="0" [attr.aria-label]="t("ui.m_cgc8yt")">
              <table class="user-directory-table">
                <thead><tr><th>{{ t("ui.m_kerw1t") }}</th><th>{{ t("ui.m_9or57p") }}</th><th>{{ t("ui.m_1b60x1n") }}</th><th>{{ t("ui.m_1o7vynn") }}</th><th>{{ t("ui.m_l9dhr0") }}</th></tr></thead>
                <tbody>
                  @for (user of users; track user.uid) {
                    <tr [class.selected-row]="selectedAdminUser?.uid === user.uid">
                      <td class="user-cell" [attr.data-label]="t("ui.m_kerw1t")"><strong>{{ user.display_name || t("ui.m_1pr5t8z") }}</strong><small>{{ user.email || t("ui.m_ym1kns") }}</small><small class="user-uid">{{ user.uid }}</small>@if (user.email) { <small>{{ user.email_verified ? t("ui.m_2c2fzm") : t("ui.m_xzmlsm") }}</small> }</td>
                      <td [attr.data-label]="t("ui.m_9or57p")"><span class="status-pill" [class.runtime-good]="!user.disabled" [class.runtime-bad]="user.disabled">{{ user.disabled ? t("ui.m_10igywj") : t("ui.m_sjpv56") }}</span>@if (user.is_platform_super_admin) { <small class="user-root-label">{{ t("ui.m_11p1ltb") }}</small> }</td>
                      <td [attr.data-label]="t("ui.m_1b60x1n")"><div class="user-role-list">@if (user.is_platform_super_admin) { <span class="role-pill accent">{{ t("ui.m_1tjgh5f") }}</span> } @else if (user.roles.length) { @for (role of user.roles; track role) { <span class="role-pill" [title]="platformRoleDescription(role)">{{ platformRoleLabel(role) }}</span> } } @else { <span class="muted">{{ t("ui.m_ngvec0") }}</span> }</div></td>
                      <td [attr.data-label]="t("ui.m_1o7vynn")"><div class="membership-list">@if (user.memberships.length) { @for (membership of user.memberships; track membership.business_id) { <span class="membership-chip"><strong>{{ membership.business_name }}</strong><small>{{ membership.role === 'owner' ? t("ui.m_76vc2d") : t("ui.m_1bfbo3p") }}</small></span> } } @else { <span class="muted">{{ t("ui.m_6tvyvw") }}</span> }</div></td>
                      <td [attr.data-label]="t("ui.m_l9dhr0")"><button class="outline-button small-button" type="button" [class.active]="selectedAdminUser?.uid === user.uid" (click)="selectAdminUser(user)">{{ selectedAdminUser?.uid === user.uid ? t("ui.m_1ms145q") : t("ui.m_1pjqkqz") }}</button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="pagination"><span>{{ t("ui.m_10p2ncg") }} {{ userPageIndex + 1 }} · {{ users.length }} {{ t("ui.m_18ynhr6") }}@if (userSearchMode === 'exact_email_or_uid') { · {{ t("ui.m_58dr7r") }} }</span><div><button type="button" class="outline-button" [disabled]="userPageIndex === 0 || usersLoading" (click)="previousUsersPage()">{{ t("ui.m_14wy3hz") }}</button><button type="button" class="outline-button" [disabled]="!userNextPageToken || usersLoading" (click)="nextUsersPage()">{{ t("ui.m_thb9eg") }}</button></div></div>
          }
          @if (selectedAdminUser) {
            <article class="panel user-access-panel" aria-labelledby="selected-user-title">
              <div class="section-heading"><div><p class="eyebrow">{{ t("ui.m_1tjws1t") }}</p><h3 id="selected-user-title">{{ selectedAdminUser.display_name || selectedAdminUser.email || selectedAdminUser.uid }}</h3><p class="user-uid">{{ selectedAdminUser.subject }}</p></div><button class="quiet-button" type="button" (click)="selectedAdminUser = null">{{ t("ui.m_a27klb") }}</button></div>
              <div class="user-facts-grid"><div><small>{{ t("ui.m_33znlv") }}</small><strong>{{ formatDate(selectedAdminUser.created_at) }}</strong></div><div><small>{{ t("ui.m_zkxisf") }}</small><strong>{{ formatDate(selectedAdminUser.last_sign_in_at) }}</strong></div><div><small>{{ t("ui.m_1bonz6s") }}</small><strong>{{ selectedAdminUser.disabled ? t("ui.m_10igywj") : t("ui.m_sjpv56") }}</strong></div><div><small>{{ t("ui.m_18iqnlj") }}</small><strong>{{ selectedAdminUser.is_platform_super_admin ? t("ui.m_lyooko") : selectedAdminUser.roles.length ? t("ui.m_m6vu13") : t("ui.m_e4ry89") }}</strong></div></div>
              @if (selectedAdminUser.is_platform_super_admin) {
                <div class="notice warn" role="note">{{ t("ui.m_1kn2qmi") }}</div>
              } @else if (selectedAdminUser.subject === access?.subject) {
                <div class="notice warn" role="note">{{ t("ui.m_1c8x336") }}</div>
              } @else if (canManagePlatformRoles) {
                <div class="role-editor">
                  <div><h4>{{ t("ui.m_18c51ox") }}</h4><p>{{ t("ui.m_1082ttk") }}</p></div>
                  <form class="user-role-form" (ngSubmit)="savePlatformRole()">
                    <label><span>{{ t("ui.m_i1mc5d") }}</span><select name="selectedPlatformRole" [(ngModel)]="selectedPlatformRole"><option value="platform_viewer">{{ t("ui.m_1d5lfg1") }}</option><option value="workspace_operator">{{ t("ui.m_b6p418") }}</option><option value="user_manager">{{ t("ui.m_w5p3jt") }}</option></select></label>
                    <label class="role-reason"><span>{{ t("ui.m_1q9d63w") }}</span><textarea name="roleReason" [(ngModel)]="roleReason" maxlength="500" rows="2" required [placeholder]="t("ui.m_rirq1m")"></textarea></label>
                    <div class="role-submit-actions"><button type="submit" class="primary-button" [disabled]="roleSaving || !hasMeaningfulPlatformAdminReason(roleReason)" (click)="roleChangeActive = true">{{ roleSaving ? t("ui.m_jol8r9") : t("ui.m_95h1o2") }}</button><button type="submit" class="quiet-button signout" [disabled]="roleSaving || !hasMeaningfulPlatformAdminReason(roleReason) || !selectedAdminUser.roles.includes(selectedPlatformRole)" (click)="roleChangeActive = false">{{ t("ui.m_1t6whqg") }}</button></div>
                  </form>
                  @if (selectedAdminUser.roles.length) {
                    <div class="current-role-grants"><strong>{{ t("ui.m_1uv4ogk") }}</strong>
                      @for (role of selectedAdminUser.roles; track role) {
                        <div class="grant-row"><div><span class="role-pill">{{ platformRoleLabel(role) }}</span><small>{{ platformRoleDescription(role) }}</small></div><button class="quiet-button" type="button" [disabled]="roleSaving" (click)="selectRoleForRevocation(role)">{{ t("ui.m_f1ev92") }}</button></div>
                      }
                    </div>
                  }
                </div>
              } @else {
                <div class="notice" role="note">{{ t("ui.m_nwwmtz") }}</div>
              }
              @if (roleError) { <div class="notice error" role="alert">{{ roleError }}</div> }
              @if (roleMessage) { <div class="notice success" role="status" aria-live="polite">{{ roleMessage }}</div> }
              <div class="membership-details"><h4>{{ t("ui.m_idhyfl") }}</h4>
                @if (selectedAdminUser.memberships.length) {
                  @for (membership of selectedAdminUser.memberships; track membership.business_id) {
                    <div class="membership-detail-row"><div><strong>{{ membership.business_name }}</strong><small>{{ membership.business_id }}</small></div><span class="role-pill">{{ membership.role === 'owner' ? t("ui.m_t1bf6g") : t("ui.m_1bfbo3p") }}</span></div>
                  }
                } @else { <p class="muted">{{ t("ui.m_1iis0oe") }}</p> }
              </div>
            </article>
          }
          <article class="panel access-audit-panel">
            <div class="section-heading"><div><p class="eyebrow">{{ t("ui.m_1y9xwyl") }}</p><h3>{{ t("ui.m_1q8bq94") }}</h3><p>{{ t("ui.m_yq23lk") }}</p></div><button type="button" class="outline-button" [disabled]="roleAuditLoading" (click)="loadRoleAudit()">{{ t("ui.m_1vmd166") }}</button></div>
            @if (roleAuditLoading) { <div class="loading-block" role="status"><span class="spinner"></span>{{ t("ui.m_1twbn0h") }}</div> }
            @if (roleAuditError) { <div class="notice error" role="alert">{{ roleAuditError }}</div> }
            @if (!roleAuditLoading && !roleAuditError && !roleAuditEvents.length) { <p class="muted">{{ t("ui.m_v6uvym") }}</p> }
            @if (roleAuditEvents.length) {
              <div class="table-wrap" role="region" tabindex="0" [attr.aria-label]="t("ui.m_1khy7v3")"><table><thead><tr><th>{{ t("ui.m_20f9m2") }}</th><th>{{ t("ui.m_bnvfl5") }}</th><th>{{ t("ui.m_t3ndvm") }}</th><th>{{ t("ui.m_d13ak8") }}</th><th>{{ t("ui.m_1e6a91l") }}</th><th>{{ t("ui.m_jn683o") }}</th></tr></thead><tbody>
                @for (event of roleAuditEvents; track event.id) { <tr><td class="date-cell" [attr.data-label]="t("ui.m_20f9m2")">{{ formatDate(event.created_at) }}</td><td [attr.data-label]="t("ui.m_bnvfl5")">{{ auditActionLabel(event.action) }}</td><td class="subject" [attr.data-label]="t("ui.m_t3ndvm")">{{ event.target_subject }}</td><td [attr.data-label]="t("ui.m_d13ak8")">{{ platformRoleLabel(event.role) }}</td><td class="summary-cell" [attr.data-label]="t("ui.m_1e6a91l")">{{ event.reason }}</td><td class="subject" [attr.data-label]="t("ui.m_jn683o")">{{ event.actor_subject }}</td></tr> }
              </tbody></table></div>
            }
          </article>
        </section>
      }

      @if (section === 'permissions') {
        <section class="section-content" aria-labelledby="permissions-title">
          <div class="section-heading"><div><p class="eyebrow">{{ t("ui.m_x2bdot") }}</p><h2 id="permissions-title">{{ t("ui.m_197qdex") }}</h2><p>{{ t("ui.m_1sso1of") }}</p></div></div>
          <div class="permission-grid">
            <article class="permission-card platform"><span class="permission-icon" aria-hidden="true">◇</span><div><span class="role-pill accent">{{ t("ui.m_h4f111") }}</span><h3>{{ t("ui.m_1k9kh6j") }}</h3><p>{{ t("ui.m_1rqjb5a") }}</p><ul><li>{{ t("ui.m_qshbwa") }}</li><li>{{ t("ui.m_771dsy") }}</li><li>{{ t("ui.m_1xk4a0w") }}</li><li>{{ t("ui.m_fa93gt") }}</li></ul></div></article>
            <article class="permission-card"><span class="permission-icon" aria-hidden="true">♙</span><div><span class="role-pill">{{ t("ui.m_i1ciyu") }}</span><h3>{{ t("ui.m_1rs5cv7") }}</h3><p>{{ t("ui.m_93zc98") }}</p></div></article>
            <article class="permission-card"><span class="permission-icon" aria-hidden="true">♧</span><div><span class="role-pill">{{ t("ui.m_1bfbo3p") }}</span><h3>{{ t("ui.m_1n3bwoy") }}</h3><p>{{ t("ui.m_6ohgsl") }}</p></div></article>
            <article class="permission-card"><span class="permission-icon" aria-hidden="true">⛨</span><div><span class="role-pill muted-role">{{ t("ui.m_bthecq") }}</span><h3>{{ t("ui.m_1qg2kkw") }}</h3><p>{{ t("ui.m_fiy96p") }}</p></div></article>
          </div>
          <div class="notice warn" role="note"><strong>{{ t("ui.m_1dmv9bf") }}</strong><p>{{ t("ui.m_6vghot") }}</p></div>
        </section>
      }
      <footer class="admin-footer"><span><span class="live-dot"></span>{{ t("ui.m_i95nob") }}</span><span>{{ t("ui.m_2tz1y1") }}</span></footer>
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
    .admin-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
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
  sectionAnnouncement = '';
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

  constructor(private readonly api: ApiService, private readonly localization: LocalizationService) {}

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
      if (!this.canViewUsers && this.section === 'users') {
        this.section = 'overview';
        this.sectionAnnouncement = this.sectionAnnouncementFor('overview');
      }
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

  t(keyOrArabic: string, paramsOrEnglish?: Record<string, string | number> | string): string {
    if (typeof paramsOrEnglish === 'string') {
      return this.language === 'ar' ? keyOrArabic : paramsOrEnglish;
    }
    return this.localization.translate(keyOrArabic, paramsOrEnglish);
  }

  money(value: string): string {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return value;
    return new Intl.NumberFormat(this.language === 'ar' ? 'ar-EG' : 'en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(parsed);
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return this.t("ui.m_1tnh3kh");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return this.t("ui.m_1tnh3kh");
    return new Intl.DateTimeFormat(this.language === 'ar' ? 'ar-EG' : 'en-GB', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
  }

  auditActionLabel(action: string): string {
    return this.t(formatAuditActionLabel(action));
  }

  auditTargetLabel(target: string): string {
    return this.t(formatAuditTargetLabel(target));
  }

  statusLabel(status: string): string {
    const ar: Record<string, string> = { draft: 'مسودة', issued: 'صادرة', void: 'ملغاة' };
    const en: Record<string, string> = { draft: 'Draft', issued: 'Issued', void: 'Voided' };
    return (this.language === 'ar' ? ar : en)[status] || status;
  }

  roleLabel(role: PlatformMembership['role']): string {
    if (role === 'owner') return this.t("ui.m_13uvj3r");
    if (role === 'staff') return this.t("ui.m_1bfbo3p");
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

  sectionAnnouncementFor(section: AdminSection): string {
    const labels: Record<AdminSection, { ar: string; en: string }> = {
      overview: { ar: 'تم فتح قسم نظرة عامة', en: 'Opened Overview section' },
      businesses: { ar: 'تم فتح قسم مساحات العمل', en: 'Opened Workspaces section' },
      activity: { ar: 'تم فتح قسم سجل التدقيق', en: 'Opened Audit activity section' },
      users: { ar: 'تم فتح قسم المستخدمين والصلاحيات', en: 'Opened Users and access section' },
      permissions: { ar: 'تم فتح قسم الصلاحيات', en: 'Opened Permissions section' },
    };
    return this.t(labels[section].ar, labels[section].en);
  }

  setSection(section: AdminSection): void {
    if (section === 'users' && !this.canViewUsers) return;
    this.section = section;
    this.sectionAnnouncement = this.sectionAnnouncementFor(section);
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
    return descriptions[role]?.[this.language === 'ar' ? 'ar' : 'en'] || this.t("ui.m_vmuvn2");
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
    this.roleMessage = this.t("ui.m_bbmarv");
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
      this.statusError = this.t("ui.m_rxwtky");
      return;
    }
    if (this.desiredStatus === current.is_active) {
      this.statusError = this.t("ui.m_mtsipq");
      return;
    }
    const question = this.desiredStatus
      ? this.t("ui.m_in72vk")
      : this.t("ui.m_1vlka61");
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
        ? this.t("ui.m_o3n4vf", { rowCount: result.rowCount })
        : this.t("ui.m_1g8bs7h", { rowCount: result.rowCount });
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
      return this.t("ui.m_1nyfduf");
    }
    return message || this.t("ui.m_nqwudl");
  }
}
