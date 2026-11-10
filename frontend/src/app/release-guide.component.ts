import { Component, Input } from '@angular/core';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { FEATURE_CATALOG, RELEASE_HISTORY } from './release-guide';

/** Lazy-loaded, bilingual in-app guide for currently supported workspace modules. */
@Component({
  selector: 'aba-release-guide',
  standalone: true,
  imports: [AbaCardComponent, AbaSectionHeaderComponent],
  template: `
    <section abaCard class="panel release-guide-panel" aria-labelledby="release-guide-title">
      <p class="release-guide-eyebrow">{{ t('دليل مبسط', 'QUICK GUIDE') }}</p>
      <aba-section-header
        [titleId]="'release-guide-title'"
        [title]="t('مميزات التطبيق والإصدارات', 'App features & versions')"
        [description]="t('اعرف الموجود في التطبيق، ثم افتح الإصدار لمعرفة ما أُضيف مقارنة بالإصدارات السابقة.', 'Browse what the app offers, then open a version to see what changed from earlier releases.')">
        <span class="release-guide-version-pill">{{ t('إصدار الواجهة', 'UI version') }} · v{{ appVersion }}</span>
      </aba-section-header>

      <aba-section-header
        [level]="3"
        [title]="t('المميزات المتاحة', 'Available features')"
        [description]="t('افتح القسم الذي تحتاجه فقط. بعض الأدوات تعتمد على صلاحية الحساب أو إعداد الخدمة.', 'Open only the section you need. Some tools depend on your account permissions or service setup.')" />
      <div class="release-guide-groups">
        @for (group of featureCatalog; track group.id) {
          <details class="release-feature-group">
            <summary>
              <strong>{{ t(group.titleAr, group.titleEn) }}</strong>
              <small>{{ t(group.noteAr, group.noteEn) }}</small>
            </summary>
            <ul>
              @for (feature of group.features; track feature.titleEn) {
                <li>
                  <strong>{{ t(feature.titleAr, feature.titleEn) }}</strong>
                  <span>{{ t(feature.detailAr, feature.detailEn) }}</span>
                </li>
              }
            </ul>
          </details>
        }
      </div>

      <div class="release-history-title">
        <aba-section-header
          [title]="t('سجل الإصدارات', 'Version history')"
          [description]="t('كل إصدار يعرض الإضافات والتحسينات الجديدة فقط.', 'Each version lists only its new additions and improvements.')" />
      </div>
      <div class="release-history">
        @for (release of releaseHistory; track release.version) {
          <details class="release-version" [open]="release.version === appVersion">
            <summary>
              <span class="release-guide-version-pill">v{{ release.version }}</span>
              <strong>{{ t(release.titleAr, release.titleEn) }}</strong>
              @if (release.version === appVersion) {
                <span class="release-guide-current-badge">{{ t('الإصدار الحالي', 'Current version') }}</span>
              }
            </summary>
            @if (language === 'ar') {
              <ul>
                @for (change of release.changesAr; track change) { <li>{{ change }}</li> }
              </ul>
            } @else {
              <ul>
                @for (change of release.changesEn; track change) { <li>{{ change }}</li> }
              </ul>
            }
          </details>
        }
      </div>
      <p class="release-guide-footnote">{{ t('يتم تحديث هذا الدليل عند تجهيز إصدار جديد. الميزات التي تتطلب صلاحية أو إعدادًا تظهر ملاحظتها داخل قسمها.', 'This guide is updated for each new version. Features requiring permissions or setup are identified in their section.') }}</p>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .release-guide-panel{margin-top:4px}
    .release-guide-eyebrow{margin:0 0 6px;color:var(--aba-color-text-tertiary,#6b7280);font-size:10px;font-weight:800;letter-spacing:1.6px}
    .release-guide-version-pill{display:inline-flex;align-items:center;justify-content:center;max-width:100%;padding:6px 9px;border:1px solid var(--aba-color-border-strong,#cbd5e1);border-radius:999px;background:var(--aba-color-surface-subtle,#f8fafc);color:var(--aba-color-text-primary,#334155);font-size:11px;font-weight:800;white-space:normal;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
    .release-guide-current-badge{display:inline-flex;align-items:center;padding:7px 9px;border-radius:999px;background:var(--aba-color-primary-soft,#ecfdf5);color:var(--aba-color-primary,#0f766e);font-size:11px;font-weight:700;white-space:nowrap}
    .release-guide-groups,.release-history{display:grid;gap:12px;margin:12px 0 22px;min-width:0}
    .release-feature-group,.release-version{border:1px solid var(--aba-color-border,#dbe4ea);border-radius:13px;background:var(--aba-color-surface,#fff);min-width:0;overflow:hidden}
    .release-feature-group>summary,.release-version>summary{display:flex;align-items:center;gap:10px;flex-wrap:wrap;list-style:none;cursor:pointer;padding:13px 14px;min-height:52px;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .release-feature-group>summary::-webkit-details-marker,.release-version>summary::-webkit-details-marker{display:none}
    .release-feature-group>summary:after,.release-version>summary:after{content:'⌄';margin-inline-start:auto;display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:9px;background:var(--aba-color-surface-hover,#f1f5f9);color:var(--aba-color-text-muted,#334155);font-size:19px;line-height:1;transition:transform 160ms ease}
    .release-feature-group[open]>summary,.release-version[open]>summary{background:var(--aba-color-surface-subtle,#f8fafc)}
    .release-feature-group[open]>summary:after,.release-version[open]>summary:after{transform:rotate(180deg)}
    .release-feature-group>summary strong{font-size:14px;flex:1 1 160px}
    .release-feature-group>summary small{flex:1 1 100%;font-size:12px;color:var(--aba-color-text-secondary,#64748b);line-height:1.5;overflow-wrap:anywhere}
    .release-feature-group ul,.release-version ul{margin:0;padding-block-end:14px;padding-inline-start:32px;padding-inline-end:0;display:grid;gap:10px;font-size:13px;line-height:1.55}
    .release-feature-group li strong{display:block;font-size:13px}
    .release-feature-group li span{display:block;margin-top:2px;color:var(--aba-color-text-muted,#475569);font-size:12px;overflow-wrap:anywhere}
    .release-guide-footnote{margin:15px 0 0;color:var(--aba-color-text-secondary,#64748b);font-size:12px;line-height:1.6}
    .release-guide-panel summary:focus-visible{outline:var(--aba-focus-ring-width,3px) solid var(--aba-color-focus-ring,#2563eb);outline-offset:-2px}
    @media(prefers-reduced-motion:reduce){.release-feature-group>summary:after,.release-version>summary:after{transition:none}}
    .release-history-title{margin-top:26px}
    @media(max-width:600px){
      .release-guide-panel{padding:16px}
      .release-feature-group>summary,.release-version>summary{padding:12px}
      .release-guide-version-pill{font-size:11px}
    }
    @media(max-width:380px){
      .release-guide-panel{padding:12px}
      .release-feature-group>summary,.release-version>summary{padding:10px;gap:8px}
    }
  `],
})
export class ReleaseGuideComponent {
  @Input() language: 'ar' | 'en' = 'ar';
  @Input() appVersion = '';

  readonly featureCatalog = FEATURE_CATALOG;
  readonly releaseHistory = RELEASE_HISTORY;

  t(arabic: string, english: string): string {
    return this.language === 'ar' ? arabic : english;
  }
}
