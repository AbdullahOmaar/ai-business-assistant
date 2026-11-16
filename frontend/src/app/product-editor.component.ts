import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import type { Product } from './api.service';
import { LocalizationService } from './localization.service';

export interface ProductEditorValue { name: string; sku?: string; description?: string; unit: string; }

/** Safe descriptive product fields only. Price and stock controls remain outside this editor. */
@Component({
  selector: 'aba-product-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="product-editor" aria-labelledby="product-editor-title">
      <header><div><p>{{ t('productEditor.eyebrow') }}</p><h2 id="product-editor-title">{{ product() ? t('productEditor.editTitle') : t('productEditor.createTitle') }}</h2><small>{{ t('productEditor.description') }}</small></div>
        <button type="button" class="product-editor__close" (click)="cancel.emit()" [attr.aria-label]="t('customerEditor.close')">×</button>
      </header>
      <form (submit)="submit($event)" novalidate>
        <label><span>{{ t('productEditor.name') }} *</span><input name="name" required maxlength="160" [value]="name()" (input)="name.set(readValue($event))" [placeholder]="t('productEditor.namePlaceholder')" [attr.aria-invalid]="submitted() && !name().trim() ? 'true' : null">@if (submitted() && !name().trim()) { <small role="alert">{{ t('productEditor.nameRequired') }}</small> }</label>
        <label><span>{{ t('productEditor.sku') }}</span><input name="sku" maxlength="80" [value]="sku()" (input)="sku.set(readValue($event))" [placeholder]="t('productEditor.skuPlaceholder')" dir="ltr"></label>
        <label><span>{{ t('productEditor.unit') }} *</span><input name="unit" required maxlength="32" [value]="unit()" (input)="unit.set(readValue($event))" [placeholder]="t('productEditor.unitPlaceholder')" [attr.aria-invalid]="submitted() && !unit().trim() ? 'true' : null">@if (submitted() && !unit().trim()) { <small role="alert">{{ t('productEditor.unitRequired') }}</small> }</label>
        <label><span>{{ t('productEditor.descriptionLabel') }}</span><textarea name="description" maxlength="1000" rows="3" [value]="description()" (input)="description.set(readValue($event))" [placeholder]="t('productEditor.descriptionPlaceholder')"></textarea><small>{{ description().length }}/1000</small></label>
        @if (error()) { <p class="product-editor__error" role="alert">{{ error() }}</p> }
        <footer><button type="button" (click)="cancel.emit()" [disabled]="busy()">{{ t('productEditor.cancel') }}</button><button class="product-editor__primary" type="submit" [disabled]="busy()">{{ busy() ? t('productEditor.saving') : t('productEditor.save') }}</button></footer>
      </form>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}.product-editor{display:grid;gap:16px;padding:clamp(16px,3vw,24px);border:1px solid var(--aiba-line,#e2e8f0);border-radius:16px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033)}
    .product-editor header{display:flex;justify-content:space-between;gap:12px}.product-editor header p{margin:0 0 5px;color:var(--aiba-brand-strong,#115e59);font-size:10px;font-weight:800;letter-spacing:.08em}.product-editor h2{margin:0;font-size:20px}.product-editor header small{display:block;margin-block-start:6px;color:var(--aiba-muted,#64748b);font-size:12px;line-height:1.5}
    .product-editor__close{flex:0 0 40px;width:40px;height:40px;border:1px solid var(--aiba-line,#e2e8f0);border-radius:10px;background:var(--aiba-page,#f8fafc);font-size:23px;cursor:pointer}
    .product-editor form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.product-editor label{display:grid;gap:6px;min-width:0;color:var(--aiba-ink-soft,#344256);font-size:12px;font-weight:700}.product-editor label:first-child,.product-editor label:last-of-type{grid-column:1/-1}
    .product-editor input,.product-editor textarea{box-sizing:border-box;width:100%;min-width:0;min-height:44px;padding:10px 12px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:9px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);font:inherit;font-size:14px;font-weight:450}.product-editor textarea{min-height:88px;resize:vertical}.product-editor label small{font-size:11px;color:var(--aiba-muted,#64748b)}.product-editor label small[role=alert],.product-editor__error{color:var(--aiba-danger,#b91c1c)}.product-editor__error{grid-column:1/-1;margin:0;font-size:12px}
    .product-editor footer{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;padding-block-start:12px;border-block-start:1px solid var(--aiba-line,#e2e8f0)}.product-editor footer button{min-height:44px;padding:8px 14px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:9px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);font:inherit;font-size:12px;font-weight:750;cursor:pointer}.product-editor footer .product-editor__primary{border-color:var(--aiba-brand,#0f766e);background:var(--aiba-brand,#0f766e);color:#fff}.product-editor button:focus-visible,.product-editor input:focus-visible,.product-editor textarea:focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}
    @media(max-width:520px){.product-editor form{grid-template-columns:minmax(0,1fr)}.product-editor label:first-child,.product-editor label:last-of-type{grid-column:auto}.product-editor footer{display:grid;grid-template-columns:1fr 1fr}.product-editor footer button{padding-inline:8px}}
    @media(forced-colors:active){.product-editor,.product-editor input,.product-editor textarea,.product-editor button{border:1px solid CanvasText}.product-editor :is(button,input,textarea):focus-visible{outline-color:Highlight}}
  `],
})
export class ProductEditorComponent {
  private readonly localization = inject(LocalizationService);
  t(key: string): string { return this.localization.translate(key); }
  readonly product = input<Product | null>(null);
  readonly busy = input(false);
  readonly error = input('');
  readonly cancel = output<void>();
  readonly save = output<ProductEditorValue>();
  readonly name = signal('');
  readonly sku = signal('');
  readonly description = signal('');
  readonly unit = signal('unit');
  readonly submitted = signal(false);

  constructor() {
    effect(() => {
      const product = this.product();
      this.name.set(product?.name ?? '');
      this.sku.set(product?.sku ?? '');
      this.description.set(product?.description ?? '');
      this.unit.set(product?.unit ?? 'unit');
      this.submitted.set(false);
    });
  }
  readValue(event: Event): string { return (event.currentTarget as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? ''; }
  submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    if (!this.name().trim() || !this.unit().trim() || this.busy()) return;
    const optional = (value: string) => value.trim() || undefined;
    this.save.emit({ name: this.name().trim(), unit: this.unit().trim(), sku: optional(this.sku()), description: optional(this.description()) });
  }
}
