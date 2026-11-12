import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { Customer } from './api.service';
import type { AbaRecordTableActionEvent } from './shared/ui/aba-record-table.component';
import { sortCustomers, type CustomerSortField, type SortDirection } from './directory-sort';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';


/**
 * Customer-specific directory presentation.
 * Search and business actions stay with the owning screen; this component only
 * sorts the already-filtered page and presents existing customer fields/actions.
 */
@Component({
  selector: 'aba-customer-directory',
  standalone: true,
  imports: [AbaStateMessageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="customer-directory" [attr.aria-label]="ariaLabel()">
      @if (loading()) {
        <aba-state-message kind="loading" [description]="loadingDescription()" />
      } @else if (customers().length) {
        <div class="customer-directory__mobile-sort">
          <label for="customer-directory-sort">
            <span>{{ locale() === 'ar' ? 'ترتيب حسب' : 'Sort by' }}</span>
            <select id="customer-directory-sort" [value]="mobileSortValue" (change)="onMobileSortChange($event)">
              <option value="name:asc">{{ locale() === 'ar' ? 'الاسم: أ–ي' : 'Name: A–Z' }}</option>
              <option value="name:desc">{{ locale() === 'ar' ? 'الاسم: ي–أ' : 'Name: Z–A' }}</option>
              <option value="email:asc">{{ locale() === 'ar' ? 'البريد: أ–ي' : 'Email: A–Z' }}</option>
              <option value="email:desc">{{ locale() === 'ar' ? 'البريد: ي–أ' : 'Email: Z–A' }}</option>
              <option value="phone:asc">{{ locale() === 'ar' ? 'الهاتف: تصاعدي' : 'Phone: ascending' }}</option>
              <option value="phone:desc">{{ locale() === 'ar' ? 'الهاتف: تنازلي' : 'Phone: descending' }}</option>
            </select>
          </label>
        </div>

        <div class="customer-directory__desktop" role="region" tabindex="0" [attr.aria-label]="ariaLabel()">
          <table>
            <caption class="customer-directory__sr-only">{{ ariaLabel() }}</caption>
            <thead>
              <tr>
                <th scope="col" [attr.aria-sort]="ariaSort('name')">
                  <button type="button" (click)="toggleSort('name')">
                    {{ locale() === 'ar' ? 'العميل' : 'Customer' }}
                    <span aria-hidden="true">{{ sortIndicator('name') }}</span>
                  </button>
                </th>
                <th scope="col" [attr.aria-sort]="ariaSort('email')">
                  <button type="button" (click)="toggleSort('email')">
                    {{ locale() === 'ar' ? 'البريد الإلكتروني' : 'Email' }}
                    <span aria-hidden="true">{{ sortIndicator('email') }}</span>
                  </button>
                </th>
                <th scope="col" [attr.aria-sort]="ariaSort('phone')">
                  <button type="button" (click)="toggleSort('phone')">
                    {{ locale() === 'ar' ? 'الهاتف' : 'Phone' }}
                    <span aria-hidden="true">{{ sortIndicator('phone') }}</span>
                  </button>
                </th>
                <th scope="col">{{ locale() === 'ar' ? 'إجراءات' : 'Actions' }}</th>
              </tr>
            </thead>
            <tbody>
              @for (customer of sortedCustomers(); track customer.id) {
                <tr>
                  <th scope="row" class="customer-directory__name">{{ customer.name }}</th>
                  <td>
                    @if (customer.email) {
                      <a [href]="'mailto:' + customer.email"><bdi dir="ltr">{{ customer.email }}</bdi></a>
                    } @else {
                      <span class="customer-directory__muted">{{ locale() === 'ar' ? 'غير مسجل' : 'Not provided' }}</span>
                    }
                  </td>
                  <td>
                    @if (customer.phone) {
                      <a [href]="'tel:' + customer.phone"><bdi dir="ltr">{{ customer.phone }}</bdi></a>
                    } @else {
                      <span class="customer-directory__muted">{{ locale() === 'ar' ? 'غير مسجل' : 'Not provided' }}</span>
                    }
                  </td>
                  <td>
                    <div class="customer-directory__actions">
                      <button class="customer-directory__action" type="button" (click)="emitAction(customer.id, 'invoices', $event)" [attr.aria-label]="actionAriaLabel(customer, 'invoices')">
                        {{ locale() === 'ar' ? 'الفواتير' : 'Invoices' }}
                      </button>
                      <button class="customer-directory__action customer-directory__action--primary" type="button" (click)="emitAction(customer.id, 'statement', $event)" [attr.aria-label]="actionAriaLabel(customer, 'statement')">
                        {{ locale() === 'ar' ? 'كشف الحساب' : 'Statement' }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <ol class="customer-directory__mobile-list" [attr.aria-label]="ariaLabel()">
          @for (customer of sortedCustomers(); track customer.id) {
            <li class="customer-directory__mobile-row">
              <div class="customer-directory__identity">
                <h3>{{ customer.name }}</h3>
                <div class="customer-directory__contact">
                  @if (customer.phone) {
                    <a [href]="'tel:' + customer.phone" [attr.aria-label]="(locale() === 'ar' ? 'اتصال بـ ' : 'Call ') + customer.name"><bdi dir="ltr">{{ customer.phone }}</bdi></a>
                  }
                  @if (customer.email) {
                    <a [href]="'mailto:' + customer.email" [attr.aria-label]="(locale() === 'ar' ? 'مراسلة ' : 'Email ') + customer.name"><bdi dir="ltr">{{ customer.email }}</bdi></a>
                  }
                  @if (!customer.phone && !customer.email) {
                    <span class="customer-directory__muted">{{ locale() === 'ar' ? 'لا توجد بيانات تواصل' : 'No contact details' }}</span>
                  }
                </div>
              </div>
              <div class="customer-directory__actions">
                <button class="customer-directory__action" type="button" (click)="emitAction(customer.id, 'invoices', $event)" [attr.aria-label]="actionAriaLabel(customer, 'invoices')">
                  {{ locale() === 'ar' ? 'الفواتير' : 'Invoices' }}
                </button>
                <button class="customer-directory__action customer-directory__action--primary" type="button" (click)="emitAction(customer.id, 'statement', $event)" [attr.aria-label]="actionAriaLabel(customer, 'statement')">
                  {{ locale() === 'ar' ? 'كشف الحساب' : 'Statement' }}
                </button>
              </div>
            </li>
          }
        </ol>
      } @else {
        <aba-state-message kind="empty" [title]="emptyTitle()" [description]="emptyDescription()" />
      }
    </section>
  `,
  styleUrl: './customer-directory.component.css',
})
export class CustomerDirectoryComponent {
  readonly ariaLabel = input.required<string>();
  readonly customers = input<readonly Customer[]>([]);
  readonly locale = input<'ar' | 'en'>('ar');
  readonly loading = input(false);
  readonly loadingDescription = input('');
  readonly emptyTitle = input('');
  readonly emptyDescription = input('');
  readonly rowAction = output<AbaRecordTableActionEvent>();

  private readonly sortField = signal<CustomerSortField>('name');
  private readonly sortDirection = signal<SortDirection>('asc');

  readonly sortedCustomers = computed(() =>
    sortCustomers(this.customers(), this.sortField(), this.sortDirection(), this.locale())
  );

  get mobileSortValue(): string {
    return this.sortField() + ':' + this.sortDirection();
  }

  toggleSort(field: CustomerSortField): void {
    if (this.sortField() === field) {
      this.sortDirection.update(direction => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    this.sortField.set(field);
    this.sortDirection.set('asc');
  }

  onMobileSortChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement | null)?.value || '';
    const [field, direction] = value.split(':');
    if (field !== 'name' && field !== 'email' && field !== 'phone') return;
    if (direction !== 'asc' && direction !== 'desc') return;
    this.sortField.set(field);
    this.sortDirection.set(direction);
  }

  ariaSort(field: CustomerSortField): 'ascending' | 'descending' | 'none' {
    if (this.sortField() !== field) return 'none';
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  sortIndicator(field: CustomerSortField): string {
    if (this.sortField() !== field) return '↕';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }

  actionAriaLabel(customer: Customer, action: 'invoices' | 'statement'): string {
    const label = action === 'invoices'
      ? (this.locale() === 'ar' ? 'عرض فواتير' : 'View invoices for')
      : (this.locale() === 'ar' ? 'كشف حساب' : 'Statement for');
    return label + ' ' + customer.name;
  }

  emitAction(rowId: string, actionId: string, event: Event): void {
    const anchor = event.currentTarget;
    if (anchor instanceof HTMLElement) this.rowAction.emit({ rowId, actionId, anchor });
  }
}
