import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { Customer } from './api.service';
import type { AbaRecordTableActionEvent } from './shared/ui/aba-record-table.component';
import { sortCustomers, type CustomerSortField, type SortDirection } from './directory-sort';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';
import { inject } from '@angular/core';
import { LocalizationService } from './localization.service';


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
            <span>{{ t("customerDirectory.m_tpfmbp") }}</span>
            <select id="customer-directory-sort" [value]="mobileSortValue" (change)="onMobileSortChange($event)">
              <option value="name:asc">{{ t("customerDirectory.m_zh6wie") }}</option>
              <option value="name:desc">{{ t("customerDirectory.m_1iina3u") }}</option>
              <option value="email:asc">{{ t("customerDirectory.m_bl0g3s") }}</option>
              <option value="email:desc">{{ t("customerDirectory.m_1jlg5ik") }}</option>
              <option value="phone:asc">{{ t("customerDirectory.m_1b1jxnt") }}</option>
              <option value="phone:desc">{{ t("customerDirectory.m_1izflgg") }}</option>
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
                    {{ t("customerDirectory.m_ubgrc2") }}
                    <span aria-hidden="true">{{ sortIndicator('name') }}</span>
                  </button>
                </th>
                <th scope="col" [attr.aria-sort]="ariaSort('email')">
                  <button type="button" (click)="toggleSort('email')">
                    {{ t("customerDirectory.m_112c7vo") }}
                    <span aria-hidden="true">{{ sortIndicator('email') }}</span>
                  </button>
                </th>
                <th scope="col" [attr.aria-sort]="ariaSort('phone')">
                  <button type="button" (click)="toggleSort('phone')">
                    {{ t("customerDirectory.m_19jxea1") }}
                    <span aria-hidden="true">{{ sortIndicator('phone') }}</span>
                  </button>
                </th>
                <th scope="col">{{ t("customerDirectory.m_256ab9") }}</th>
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
                      <span class="customer-directory__muted">{{ t("customerDirectory.m_2wkjj4") }}</span>
                    }
                  </td>
                  <td>
                    @if (customer.phone) {
                      <a [href]="'tel:' + customer.phone"><bdi dir="ltr">{{ customer.phone }}</bdi></a>
                    } @else {
                      <span class="customer-directory__muted">{{ t("customerDirectory.m_2wkjj4") }}</span>
                    }
                  </td>
                  <td>
                    <div class="customer-directory__actions">
                      <button class="customer-directory__action" type="button" (click)="emitAction(customer.id, 'invoices', $event)" [attr.aria-label]="actionAriaLabel(customer, 'invoices')">
                        {{ t("customerDirectory.m_1h7f08p") }}
                      </button>
                      <button class="customer-directory__action customer-directory__action--primary" type="button" (click)="emitAction(customer.id, 'statement', $event)" [attr.aria-label]="actionAriaLabel(customer, 'statement')">
                        {{ t("customerDirectory.m_np2h9e") }}
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
                    <a [href]="'tel:' + customer.phone" [attr.aria-label]="(t("customerDirectory.m_1kxahts")) + customer.name"><bdi dir="ltr">{{ customer.phone }}</bdi></a>
                  }
                  @if (customer.email) {
                    <a [href]="'mailto:' + customer.email" [attr.aria-label]="(t("customerDirectory.m_uodwjq")) + customer.name"><bdi dir="ltr">{{ customer.email }}</bdi></a>
                  }
                  @if (!customer.phone && !customer.email) {
                    <span class="customer-directory__muted">{{ t("customerDirectory.m_1ypcn1i") }}</span>
                  }
                </div>
              </div>
              <div class="customer-directory__actions">
                <button class="customer-directory__action" type="button" (click)="emitAction(customer.id, 'invoices', $event)" [attr.aria-label]="actionAriaLabel(customer, 'invoices')">
                  {{ t("customerDirectory.m_1h7f08p") }}
                </button>
                <button class="customer-directory__action customer-directory__action--primary" type="button" (click)="emitAction(customer.id, 'statement', $event)" [attr.aria-label]="actionAriaLabel(customer, 'statement')">
                  {{ t("customerDirectory.m_np2h9e") }}
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
  private readonly localization = inject(LocalizationService);
  t(key: string): string { return this.localization.translate(key); }
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
      ? (this.t("customerDirectory.m_1muaaw0"))
      : (this.t("customerDirectory.m_mmu2iu"));
    return label + ' ' + customer.name;
  }

  emitAction(rowId: string, actionId: string, event: Event): void {
    const anchor = event.currentTarget;
    if (anchor instanceof HTMLElement) this.rowAction.emit({ rowId, actionId, anchor });
  }
}
