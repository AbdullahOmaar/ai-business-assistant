import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { Product } from './api.service';
import { LocalizationService } from './localization.service';

/** Product details are read from the API. This surface never mutates price or stock. */
@Component({
  selector: 'aba-product-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="product-profile" aria-labelledby="product-profile-name">
      <header><div class="product-profile__mark" aria-hidden="true">▦</div><div class="product-profile__identity"><p>{{ t('productProfile.eyebrow') }}</p><h2 id="product-profile-name">{{ product().name }}</h2></div><button type="button" (click)="edit.emit()">{{ t('productProfile.edit') }}</button></header>
      <section class="product-profile__grid">
        <div><span>{{ t('productProfile.sku') }}</span><strong><bdi dir="ltr">{{ product().sku || '—' }}</bdi></strong></div>
        <div><span>{{ t('productProfile.unit') }}</span><strong>{{ product().unit || '—' }}</strong></div>
        <div class="product-profile__wide"><span>{{ t('productProfile.description') }}</span><p>{{ product().description || t('productProfile.emptyDescription') }}</p></div>
        <div><span>{{ t('productProfile.price') }}</span><strong class="product-profile__price"><bdi dir="ltr">{{ product().unit_price }} {{ product().currency_code || currencyCode() }}</bdi></strong></div>
        <div><span>{{ t('productProfile.stock') }}</span><strong>{{ product().is_stock_tracked ? product().stock_quantity ?? '0' : t('productProfile.notTracked') }}</strong></div>
      </section>
      <p class="product-profile__note">{{ product().is_stock_tracked ? t('productProfile.stockTracked') : t('productProfile.notTracked') }}</p>
    </article>
  `,
  styles: [`
    :host{display:block;min-width:0}.product-profile{display:grid;gap:16px;padding:clamp(16px,3vw,24px);border:1px solid var(--aiba-line,#e2e8f0);border-radius:16px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033)}.product-profile header{display:flex;align-items:center;gap:12px}.product-profile__mark{display:grid;place-items:center;flex:0 0 48px;width:48px;height:48px;border-radius:14px;background:var(--aiba-brand-soft,#ecfdf5);color:var(--aiba-brand-strong,#115e59);font-size:22px}.product-profile__identity{flex:1;min-width:0}.product-profile__identity p{margin:0 0 4px;color:var(--aiba-brand-strong,#115e59);font-size:10px;font-weight:800;letter-spacing:.08em}.product-profile h2{margin:0;font-size:19px;overflow-wrap:anywhere}.product-profile button{min-height:44px;padding:8px 12px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:9px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);font:inherit;font-size:12px;font-weight:750;cursor:pointer}.product-profile__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.product-profile__grid>div{display:grid;gap:6px;min-width:0;padding:11px;border:1px solid var(--aiba-line,#e2e8f0);border-radius:11px;background:var(--aiba-page,#f8fafc)}.product-profile__grid>div>span{color:var(--aiba-muted,#64748b);font-size:11px;font-weight:700}.product-profile__grid strong,.product-profile__grid p{margin:0;color:var(--aiba-ink,#172033);font-size:13px;line-height:1.5;overflow-wrap:anywhere}.product-profile__wide{grid-column:1/-1}.product-profile__price{color:var(--aiba-brand-strong,#115e59)!important;font-variant-numeric:tabular-nums}.product-profile__note{margin:0;color:var(--aiba-muted,#64748b);font-size:11px}.product-profile :is(button):focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}@media(max-width:480px){.product-profile{padding:14px;border-radius:14px}.product-profile header{flex-wrap:wrap}.product-profile header button{width:100%}.product-profile__grid{grid-template-columns:minmax(0,1fr)}.product-profile__wide{grid-column:auto}}@media(forced-colors:active){.product-profile,.product-profile__grid>div,.product-profile button{border:1px solid CanvasText}.product-profile button:focus-visible{outline-color:Highlight}}
  `],
})
export class ProductProfileComponent {
  private readonly localization = inject(LocalizationService);
  t(key: string): string { return this.localization.translate(key); }
  readonly product = input.required<Product>();
  readonly currencyCode = input('');
  readonly edit = output<void>();
}
