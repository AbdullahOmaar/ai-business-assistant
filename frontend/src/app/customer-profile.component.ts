import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Customer } from './api.service';

/** Read-only customer identity and contact surface; financial values are intentionally excluded. */
@Component({
  selector: 'aba-customer-profile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="customer-profile" [attr.aria-labelledby]="'customer-profile-name'">
      <header class="customer-profile__hero">
        <div class="customer-profile__avatar" aria-hidden="true">{{ initials() }}</div>
        <div class="customer-profile__identity">
          <p>{{ locale() === 'ar' ? 'ملف العميل' : 'CUSTOMER PROFILE' }}</p>
          <h2 id="customer-profile-name">{{ customer().name }}</h2>
          <span>{{ locale() === 'ar' ? 'عميل مسجل' : 'Customer record' }}</span>
        </div>
        <button class="customer-profile__edit" type="button" (click)="edit.emit()">{{ locale() === 'ar' ? 'تعديل البيانات' : 'Edit details' }}</button>
      </header>
      <section class="customer-profile__details" [attr.aria-label]="locale() === 'ar' ? 'بيانات التواصل' : 'Contact details'">
        <div class="customer-profile__item">
          <span>{{ locale() === 'ar' ? 'رقم الموبايل' : 'Phone' }}</span>
          @if (customer().phone) { <a [href]="'tel:' + customer().phone"><bdi dir="ltr">{{ customer().phone }}</bdi></a> }
          @else { <strong>—</strong> }
        </div>
        <div class="customer-profile__item">
          <span>{{ locale() === 'ar' ? 'البريد الإلكتروني' : 'Email' }}</span>
          @if (customer().email) { <a [href]="'mailto:' + customer().email"><bdi dir="ltr">{{ customer().email }}</bdi></a> }
          @else { <strong>—</strong> }
        </div>
        <div class="customer-profile__item customer-profile__item--wide">
          <span>{{ locale() === 'ar' ? 'العنوان' : 'Address' }}</span>
          <strong>{{ customer().address || '—' }}</strong>
        </div>
        <div class="customer-profile__item customer-profile__item--wide">
          <span>{{ locale() === 'ar' ? 'ملاحظات' : 'Notes' }}</span>
          <p>{{ customer().notes || (locale() === 'ar' ? 'لا توجد ملاحظات مضافة' : 'No notes added') }}</p>
        </div>
        @if (customer().created_at) {
          <div class="customer-profile__item">
            <span>{{ locale() === 'ar' ? 'تاريخ الإضافة' : 'Added on' }}</span>
            <strong><bdi dir="ltr">{{ customer().created_at | date:'mediumDate' }}</bdi></strong>
          </div>
        }
      </section>
      <footer class="customer-profile__actions">
        <button type="button" class="customer-profile__secondary" (click)="invoices.emit()">{{ locale() === 'ar' ? 'فواتير العميل' : 'Customer invoices' }}</button>
        <button type="button" class="customer-profile__primary" (click)="statement.emit()">{{ locale() === 'ar' ? 'كشف الحساب' : 'View statement' }}</button>
      </footer>
      <p class="customer-profile__note">{{ locale() === 'ar' ? 'الأرصدة وإجمالي المشتريات تظهر فقط من بيانات مالية معتمدة.' : 'Balances and purchase totals are shown only when backed by an approved financial source.' }}</p>
    </article>
  `,
  styles: [`
    :host{display:block;min-width:0}.customer-profile{display:grid;gap:18px;min-width:0;padding:clamp(16px,3vw,24px);border:1px solid var(--aiba-line,#e2e8f0);border-radius:18px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);box-shadow:0 12px 34px rgb(15 23 42 / 5%)}
    .customer-profile__hero{display:flex;align-items:center;gap:13px;min-width:0}.customer-profile__avatar{display:grid;place-items:center;flex:0 0 54px;width:54px;height:54px;border-radius:17px;background:var(--aiba-brand-soft,#ecfdf5);color:var(--aiba-brand-strong,#115e59);font-size:18px;font-weight:850}
    .customer-profile__identity{flex:1;min-width:0}.customer-profile__identity p{margin:0 0 3px;color:var(--aiba-brand-strong,#115e59);font-size:10px;font-weight:800;letter-spacing:.08em}.customer-profile__identity h2{margin:0;overflow-wrap:anywhere;font-size:20px;font-weight:800}.customer-profile__identity span{display:block;margin-block-start:4px;color:var(--aiba-muted,#64748b);font-size:11px}
    .customer-profile button{min-height:44px;padding:8px 12px;border:1px solid var(--aiba-line-strong,#cbd5e1);border-radius:10px;background:var(--aiba-surface,#fff);color:var(--aiba-ink,#172033);font:inherit;font-size:12px;font-weight:750;cursor:pointer}.customer-profile__edit{flex:0 0 auto}
    .customer-profile__details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.customer-profile__item{display:grid;align-content:start;gap:6px;min-width:0;padding:12px;border:1px solid var(--aiba-line,#e2e8f0);border-radius:12px;background:var(--aiba-page,#f8fafc)}.customer-profile__item--wide{grid-column:1/-1}.customer-profile__item>span{color:var(--aiba-muted,#64748b);font-size:11px;font-weight:700}.customer-profile__item strong,.customer-profile__item a,.customer-profile__item p{margin:0;color:var(--aiba-ink,#172033);font-size:13px;font-weight:650;line-height:1.5;overflow-wrap:anywhere}.customer-profile__item a{text-decoration:none}.customer-profile__item a:hover{text-decoration:underline}.customer-profile__actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.customer-profile .customer-profile__primary{border-color:var(--aiba-brand,#0f766e);background:var(--aiba-brand,#0f766e);color:#fff}.customer-profile__note{margin:0;color:var(--aiba-muted,#64748b);font-size:11px;line-height:1.5}.customer-profile :is(button,a):focus-visible{outline:3px solid var(--aiba-focus,#2563eb);outline-offset:2px}
    @media(max-width:480px){.customer-profile{gap:14px;padding:14px;border-radius:14px}.customer-profile__hero{flex-wrap:wrap}.customer-profile__avatar{width:46px;height:46px;flex-basis:46px;border-radius:14px}.customer-profile__identity h2{font-size:17px}.customer-profile__edit{width:100%}.customer-profile__details{grid-template-columns:minmax(0,1fr)}.customer-profile__item--wide{grid-column:auto}.customer-profile__actions{grid-template-columns:minmax(0,1fr)}}
    @media(forced-colors:active){.customer-profile,.customer-profile__item,.customer-profile button{border:1px solid CanvasText}.customer-profile :is(button,a):focus-visible{outline-color:Highlight}}
  `],
})
export class CustomerProfileComponent {
  readonly customer = input.required<Customer>();
  readonly locale = input<'ar' | 'en'>('ar');
  readonly edit = output<void>();
  readonly invoices = output<void>();
  readonly statement = output<void>();

  initials(): string {
    return this.customer().name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? '').join('').toLocaleUpperCase();
  }
}
