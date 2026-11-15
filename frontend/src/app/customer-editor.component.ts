import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import type { Customer } from './api.service';

export interface CustomerEditorValue {
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

/** Feature-local customer create/edit form. Persistence and authorization stay with the workspace owner. */
@Component({
  selector: 'aba-customer-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="customer-editor" [attr.aria-labelledby]="'customer-editor-title'">
      <header class="customer-editor__header">
        <div>
          <p class="customer-editor__eyebrow">{{ locale() === 'ar' ? 'العملاء' : 'CUSTOMERS' }}</p>
          <h2 id="customer-editor-title">{{ customer() ? (locale() === 'ar' ? 'تعديل بيانات العميل' : 'Edit customer') : (locale() === 'ar' ? 'إضافة عميل جديد' : 'Add customer') }}</h2>
          <p>{{ locale() === 'ar' ? 'بيانات التواصل الأساسية — تقدر تعدلها في أي وقت' : 'Core contact details — you can update them any time.' }}</p>
        </div>
        <button class="customer-editor__close" type="button" (click)="cancel.emit()" [attr.aria-label]="locale() === 'ar' ? 'إغلاق' : 'Close'">×</button>
      </header>

      <form (submit)="submit($event)" novalidate>
        <div class="customer-editor__grid">
          <label class="customer-editor__field customer-editor__field--wide">
            <span>{{ locale() === 'ar' ? 'اسم العميل' : 'Customer name' }} <b aria-hidden="true">*</b></span>
            <input name="name" autocomplete="name" maxlength="160" required [value]="name()" (input)="name.set(readValue($event))" [attr.aria-invalid]="submitted() && !name().trim() ? 'true' : null" [placeholder]="locale() === 'ar' ? 'مثال: أحمد محمد' : 'e.g. Alex Morgan'">
            @if (submitted() && !name().trim()) { <small role="alert">{{ locale() === 'ar' ? 'اسم العميل مطلوب' : 'Customer name is required' }}</small> }
          </label>
          <label class="customer-editor__field">
            <span>{{ locale() === 'ar' ? 'رقم الموبايل' : 'Phone number' }}</span>
            <input name="phone" type="tel" autocomplete="tel" maxlength="32" inputmode="tel" [value]="phone()" (input)="phone.set(readValue($event))" dir="auto" placeholder="+20">
          </label>
          <label class="customer-editor__field">
            <span>{{ locale() === 'ar' ? 'البريد الإلكتروني' : 'Email address' }}</span>
            <input name="email" type="email" autocomplete="email" maxlength="254" [value]="email()" (input)="email.set(readValue($event))" dir="ltr" placeholder="name@example.com" [attr.aria-invalid]="submitted() && emailInvalid() ? 'true' : null">
            @if (submitted() && emailInvalid()) { <small role="alert">{{ locale() === 'ar' ? 'أدخل بريد إلكتروني صحيح' : 'Enter a valid email address' }}</small> }
          </label>
          <label class="customer-editor__field customer-editor__field--wide">
            <span>{{ locale() === 'ar' ? 'العنوان' : 'Address' }}</span>
            <input name="address" autocomplete="street-address" maxlength="500" [value]="address()" (input)="address.set(readValue($event))" [placeholder]="locale() === 'ar' ? 'المدينة، المنطقة، الشارع' : 'City, area, street'">
          </label>
          <label class="customer-editor__field customer-editor__field--wide">
            <span>{{ locale() === 'ar' ? 'ملاحظات' : 'Notes' }}</span>
            <textarea name="notes" rows="3" maxlength="1000" [value]="notes()" (input)="notes.set(readValue($event))" [placeholder]="locale() === 'ar' ? 'ملاحظات تساعدك في التعامل مع العميل' : 'Useful context for your team'"></textarea>
            <small>{{ notes().length }}/1000</small>
          </label>
        </div>
        @if (error()) { <p class="customer-editor__error" role="alert">{{ error() }}</p> }
        <footer class="customer-editor__footer">
          <button class="customer-editor__secondary" type="button" (click)="cancel.emit()" [disabled]="busy()">{{ locale() === 'ar' ? 'إلغاء' : 'Cancel' }}</button>
          <button class="customer-editor__primary" type="submit" [disabled]="busy()">{{ busy() ? (locale() === 'ar' ? 'جارٍ الحفظ…' : 'Saving…') : (locale() === 'ar' ? 'حفظ البيانات' : 'Save customer') }}</button>
        </footer>
      </form>
    </section>
  `,
  styleUrl: './customer-editor.component.css',
})
export class CustomerEditorComponent {
  readonly customer = input<Customer | null>(null);
  readonly locale = input<'ar' | 'en'>('ar');
  readonly busy = input(false);
  readonly error = input('');
  readonly cancel = output<void>();
  readonly save = output<CustomerEditorValue>();

  readonly name = signal('');
  readonly email = signal('');
  readonly phone = signal('');
  readonly address = signal('');
  readonly notes = signal('');
  readonly submitted = signal(false);

  constructor() {
    effect(() => {
    const customer = this.customer();
    this.name.set(customer?.name ?? '');
    this.email.set(customer?.email ?? '');
    this.phone.set(customer?.phone ?? '');
    this.address.set(customer?.address ?? '');
    this.notes.set(customer?.notes ?? '');
      this.submitted.set(false);
    });
  }

  emailInvalid(): boolean {
    const value = this.email().trim();
    return value.length > 0 && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);
  }

  readValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? '';
  }

  submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    const name = this.name().trim();
    if (!name || this.emailInvalid() || this.busy()) return;
    const optional = (value: string) => value.trim() || undefined;
    this.save.emit({
      name,
      email: optional(this.email()),
      phone: optional(this.phone()),
      address: optional(this.address()),
      notes: optional(this.notes()),
    });
  }
}
