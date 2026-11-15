import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import type { Customer } from './api.service';
import { LocalizationService } from './localization.service';

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
          <p class="customer-editor__eyebrow">{{ t('customerEditor.eyebrow') }}</p>
          <h2 id="customer-editor-title">{{ customer() ? t('customerEditor.editTitle') : t('customerEditor.createTitle') }}</h2>
          <p>{{ t('customerEditor.description') }}</p>
        </div>
        <button class="customer-editor__close" type="button" (click)="cancel.emit()" [attr.aria-label]="t('customerEditor.close')">×</button>
      </header>

      <form (submit)="submit($event)" novalidate>
        <div class="customer-editor__grid">
          <label class="customer-editor__field customer-editor__field--wide">
            <span>{{ t('customerEditor.name') }} <b aria-hidden="true">*</b></span>
            <input name="name" autocomplete="name" maxlength="160" required [value]="name()" (input)="name.set(readValue($event))" [attr.aria-invalid]="submitted() && !name().trim() ? 'true' : null" [placeholder]="t('customerEditor.namePlaceholder')">
            @if (submitted() && !name().trim()) { <small role="alert">{{ t('customerEditor.nameRequired') }}</small> }
          </label>
          <label class="customer-editor__field">
            <span>{{ t('customerEditor.phone') }}</span>
            <input name="phone" type="tel" autocomplete="tel" maxlength="32" inputmode="tel" [value]="phone()" (input)="phone.set(readValue($event))" dir="auto" placeholder="+20">
          </label>
          <label class="customer-editor__field">
            <span>{{ t('customerEditor.email') }}</span>
            <input name="email" type="email" autocomplete="email" maxlength="254" [value]="email()" (input)="email.set(readValue($event))" dir="ltr" placeholder="name@example.com" [attr.aria-invalid]="submitted() && emailInvalid() ? 'true' : null">
            @if (submitted() && emailInvalid()) { <small role="alert">{{ t('customerEditor.emailInvalid') }}</small> }
          </label>
          <label class="customer-editor__field customer-editor__field--wide">
            <span>{{ t('customerEditor.address') }}</span>
            <input name="address" autocomplete="street-address" maxlength="500" [value]="address()" (input)="address.set(readValue($event))" [placeholder]="t('customerEditor.addressPlaceholder')">
          </label>
          <label class="customer-editor__field customer-editor__field--wide">
            <span>{{ t('customerEditor.notes') }}</span>
            <textarea name="notes" rows="3" maxlength="1000" [value]="notes()" (input)="notes.set(readValue($event))" [placeholder]="t('customerEditor.notesPlaceholder')"></textarea>
            <small>{{ notes().length }}/1000</small>
          </label>
        </div>
        @if (error()) { <p class="customer-editor__error" role="alert">{{ error() }}</p> }
        <footer class="customer-editor__footer">
          <button class="customer-editor__secondary" type="button" (click)="cancel.emit()" [disabled]="busy()">{{ t('customerEditor.cancel') }}</button>
          <button class="customer-editor__primary" type="submit" [disabled]="busy()">{{ busy() ? t('customerEditor.saving') : t('customerEditor.save') }}</button>
        </footer>
      </form>
    </section>
  `,
  styleUrl: './customer-editor.component.css',
})
export class CustomerEditorComponent {
  private readonly localization = inject(LocalizationService);
  t(key: string): string { return this.localization.translate(key); }
  readonly customer = input<Customer | null>(null);
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
    if (!value) return false;
    const at = value.indexOf('@');
    const dot = value.lastIndexOf('.');
    const hasWhitespace = value.split('').some(character => character.charCodeAt(0) <= 32);
    return at <= 0 || at !== value.lastIndexOf('@') || dot <= at + 1 ||
      dot >= value.length - 1 || hasWhitespace;
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
