// 3A-923 C4 (customer orders & delivery): the customer-orders
// section inside the invoices tab — a data-owning workspace component
// (the taxes-workspace pattern): it owns the orders list + the
// lightweight order editor. An order is a pre-invoice document — it
// never moves stock and never posts financially; conversion creates
// a draft invoice through the ordinary invoice service, and the shell
// opens that draft (openInvoice output) so the owner keeps working
// from the invoice editor. The delivery block (driver + trips +
// from/to) renders only while the transport master switch is on —
// OFF is zero effect: the section still lists plain orders, and no
// delivery field is rendered at all.
import { Component, inject, input, OnChanges, OnInit, output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ApiService, type Customer, type CustomerOrder, type InvoiceLineInput, type Product,
} from './api.service';
import { type InvoiceDraftDriver } from './invoice-draft';
import { LocalizationService } from './localization.service';
import { WorkspaceLoadGuard, runTenantScopedRequest, type TenantRequestContext } from './workspace-load-guard';
import { AbaCardComponent } from './shared/ui/aba-card.component';
import { AbaSectionHeaderComponent } from './shared/ui/aba-section-header.component';
import { AbaStateMessageComponent } from './shared/ui/aba-state-message.component';

interface OrderEditorLine {
  id: string;
  product_id: string;
  quantity: string;
  unit: string;
}

@Component({
  selector: 'aba-customer-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, AbaCardComponent, AbaSectionHeaderComponent, AbaStateMessageComponent],
  template: `
              <section abaCard class="panel customer-orders">
                <aba-section-header [title]="t('ui.customerOrders.title')" [description]="t('ui.customerOrders.description')" />
                <div class="orders-toolbar">
                  <button class="primary" type="button" (click)="startNewOrder()" [disabled]="ordersLoading">{{ t('ui.customerOrders.newOrder') }}</button>
                </div>
                @if (editorOpen) {
                  <form class="order-editor" (ngSubmit)="saveOrder()">
                    <div class="editor-grid">
                      <label class="field">{{ t('ui.customerOrders.orderNumber') }}
                        <input name="orderNumber" [(ngModel)]="editorOrderNumber" [disabled]="editorSaving" />
                      </label>
                      <label class="field">{{ t('ui.customerOrders.customer') }}
                        <select name="editorCustomer" [(ngModel)]="editorCustomerId" [disabled]="editorSaving">
                          <option value="">{{ t('ui.customerOrders.noCustomer') }}</option>
                          @for (customer of customers(); track customer.id) {
                            <option [value]="customer.id">{{ customer.name }}</option>
                          }
                        </select>
                      </label>
                      <label class="field">{{ t('ui.customerOrders.discountRate') }}
                        <input name="editorDiscount" type="number" min="0" max="100" step="0.01" [(ngModel)]="editorDiscountRate" [disabled]="editorSaving" />
                      </label>
                      <label class="field">{{ t('ui.customerOrders.taxRate') }}
                        <input name="editorTax" type="number" min="0" max="100" step="0.01" [(ngModel)]="editorTaxRate" [disabled]="editorSaving" />
                      </label>
                    </div>
                    <div class="editor-lines">
                      <h3>{{ t('ui.customerOrders.lines') }}</h3>
                      @for (line of editorLines; track line.id) {
                        <div class="order-line">
                          <label class="field line-product-field">{{ t('ui.customerOrders.product') }}
                            <select [name]="'product-' + line.id" [(ngModel)]="line.product_id" (ngModelChange)="onLineProductChange(line)" [disabled]="editorSaving">
                              <option value="">{{ t('ui.customerOrders.selectProduct') }}</option>
                              @for (product of products(); track product.id) {
                                <option [value]="product.id">{{ product.name }}</option>
                              }
                            </select>
                          </label>
                          @if (transportEnabled() && lineProduct(line)?.second_unit_name) {
                            <label class="field line-unit-field">{{ t('ui.customerOrders.unit') }}
                              <select [name]="'unit-' + line.id" [(ngModel)]="line.unit" [disabled]="editorSaving">
                                <option value="">{{ lineProduct(line)?.unit || t('ui.customerOrders.baseUnit') }}</option>
                                <option [value]="lineProduct(line)?.second_unit_name">{{ lineProduct(line)?.second_unit_name }}</option>
                              </select>
                            </label>
                          }
                          <label class="field line-quantity-field">{{ t('ui.customerOrders.quantity') }}
                            <input [name]="'qty-' + line.id" inputmode="decimal" [(ngModel)]="line.quantity" [disabled]="editorSaving" />
                          </label>
                          <span class="line-price">{{ linePrice(line) }}</span>
                          <button class="secondary danger" type="button" (click)="removeEditorLine(line)" [disabled]="editorSaving">{{ t('ui.customerOrders.removeLine') }}</button>
                        </div>
                      }
                      <button class="secondary" type="button" (click)="addEditorLine()" [disabled]="editorSaving">{{ t('ui.customerOrders.addLine') }}</button>
                      <p class="muted">{{ t('ui.customerOrders.subtotal') }}: {{ editorSubtotalEstimate() }} {{ currencyCode() }}</p>
                    </div>
                    @if (transportEnabled()) {
                      <div class="editor-delivery">
                        <h3>{{ t('ui.customerOrders.delivery') }}</h3>
                        <p class="muted">{{ t('ui.customerOrders.deliveryHint') }}</p>
                        <div class="editor-grid">
                          <label class="field">{{ t('ui.customerOrders.driver') }}
                            <select name="editorDriver" [(ngModel)]="editorDriverId" [disabled]="editorSaving">
                              <option value="">{{ t('ui.customerOrders.selectDriver') }}</option>
                              @for (driver of drivers(); track driver.id) {
                                <option [value]="driver.id">{{ driver.name }}</option>
                              }
                            </select>
                          </label>
                          <label class="field">{{ t('ui.customerOrders.trips') }}
                            <input name="editorTrips" type="number" min="1" [(ngModel)]="editorTrips" [disabled]="editorSaving" />
                          </label>
                          <label class="field">{{ t('ui.customerOrders.from') }}
                            <input name="editorFrom" [(ngModel)]="editorFrom" [disabled]="editorSaving" />
                          </label>
                          <label class="field">{{ t('ui.customerOrders.to') }}
                            <input name="editorTo" [(ngModel)]="editorTo" [disabled]="editorSaving" />
                          </label>
                        </div>
                      </div>
                    }
                    <label class="field">{{ t('ui.customerOrders.notes') }}
                      <input name="editorNotes" [(ngModel)]="editorNotes" [disabled]="editorSaving" />
                    </label>
                    @if (editorError) { <aba-state-message kind="error" [description]="editorError" /> }
                    <div class="editor-actions">
                      <button class="primary" type="submit" [disabled]="editorSaving">{{ editorSaving ? t('ui.customerOrders.saving') : t('ui.customerOrders.save') }}</button>
                      <button class="secondary" type="button" (click)="closeEditor()" [disabled]="editorSaving">{{ t('ui.customerOrders.cancel') }}</button>
                    </div>
                  </form>
                }
                @if (notice) { <aba-state-message kind="success" [description]="notice" /> }
                @if (ordersError) { <aba-state-message kind="error" [description]="ordersError" /> }
                @if (ordersLoading && !orders.length) {
                  <p class="muted">{{ t('ui.m_1oo6dkn') }}</p>
                } @else if (!orders.length) {
                  <p class="muted">{{ t('ui.customerOrders.empty') }}</p>
                } @else {
                  <div class="order-cards">
                    @for (order of orders; track order.id) {
                      <article class="order-card">
                        <header class="order-card-header">
                          <div>
                            <strong>{{ order.order_number }}</strong>
                            <small class="order-card-meta">{{ order.customer_name || t('ui.customerOrders.noCustomer') }} · {{ order.total }} {{ order.currency_code }}</small>
                          </div>
                          <span class="order-status-badge" [class.status-draft]="order.status === 'draft'" [class.status-confirmed]="order.status === 'confirmed'" [class.status-fulfilled]="order.status === 'fulfilled'" [class.status-cancelled]="order.status === 'cancelled'">{{ orderStatusLabel(order.status) }}</span>
                        </header>
                        <div class="order-card-lines">
                          @for (line of order.lines; track line.id) {
                            <span>{{ line.description }} × {{ line.quantity }}{{ line.sold_unit ? ' ' + line.sold_unit : '' }} — {{ line.line_total }} {{ order.currency_code }}</span>
                          }
                        </div>
                        @if (order.driver_name) {
                          <p class="muted order-delivery-line">{{ order.driver_name }} · {{ order.transport_trips }} {{ transportUnitName() }}@if (order.transport_from || order.transport_to) { · {{ order.transport_from || '' }} ← {{ order.transport_to || '' }} }</p>
                        }
                        @if (order.converted_invoice_id) {
                          <p class="muted">{{ t('ui.customerOrders.convertedTo', { invoiceNumber: order.invoice_number || '' }) }}</p>
                        }
                        <div class="order-actions">
                          @if (order.status === 'draft') {
                            <button class="secondary" type="button" (click)="startEditOrder(order)" [disabled]="rowBusy(order.id)">{{ t('ui.customerOrders.edit') }}</button>
                          }
                          @if (isOwner && order.status === 'draft') {
                            <button class="secondary" type="button" (click)="confirmOrder(order)" [disabled]="rowBusy(order.id)">{{ t('ui.customerOrders.confirm') }}</button>
                          }
                          @if (order.status === 'draft' || order.status === 'confirmed') {
                            <button class="secondary" type="button" (click)="convertOrder(order)" [disabled]="rowBusy(order.id)">{{ t('ui.customerOrders.convert') }}</button>
                          }
                          @if (isOwner && (order.status === 'draft' || order.status === 'confirmed')) {
                            <button class="secondary danger" type="button" (click)="cancelOrder(order)" [disabled]="rowBusy(order.id)">{{ t('ui.customerOrders.cancelOrder') }}</button>
                          }
                          @if (order.converted_invoice_id) {
                            <button class="secondary" type="button" (click)="openInvoice.emit(order.converted_invoice_id)">{{ t('ui.customerOrders.convert') }}</button>
                          }
                        </div>
                      </article>
                    }
                  </div>
                }
              </section>
  `,
  styles: [`
    .customer-orders .orders-toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}
    .customer-orders .order-editor{display:grid;gap:14px;border-top:1px solid var(--hatch-widget-border, #e5e7eb);padding-top:14px;margin-bottom:14px}
    .customer-orders .editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .customer-orders .editor-lines{display:grid;gap:10px}
    .customer-orders .editor-lines h3,.customer-orders .editor-delivery h3{margin:0;font-size:15px}
    .customer-orders .order-line{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:end;border:1px solid var(--hatch-widget-border, #e5e7eb);border-radius:10px;padding:10px}
    .customer-orders .line-product-field{grid-column:1/-1}
    .customer-orders .line-price{font-weight:600}
    .customer-orders .editor-actions{display:flex;gap:8px}
    .customer-orders .order-cards{display:grid;gap:12px}
    .customer-orders .order-card{border:1px solid var(--hatch-widget-border, #e5e7eb);border-radius:12px;padding:12px;display:grid;gap:8px}
    .customer-orders .order-card-header{display:flex;justify-content:space-between;gap:10px;align-items:start}
    .customer-orders .order-card-header>div{display:grid;gap:2px}
    .customer-orders .order-card-meta{color:var(--hatch-widget-muted, #6b7280)}
    .customer-orders .order-status-badge{border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap}
    .customer-orders .order-status-badge.status-draft{background:#fef3c7;color:#92400e}
    .customer-orders .order-status-badge.status-confirmed{background:#dbeafe;color:#1e40af}
    .customer-orders .order-status-badge.status-fulfilled{background:#dcfce7;color:#166534}
    .customer-orders .order-status-badge.status-cancelled{background:#fee2e2;color:#991b1b}
    .customer-orders .order-card-lines{display:grid;gap:2px;font-size:14px}
    .customer-orders .order-delivery-line{margin:0}
    .customer-orders .order-actions{display:flex;gap:8px;flex-wrap:wrap}
    @media(max-width:760px){.customer-orders .editor-grid{grid-template-columns:minmax(0,1fr)}.customer-orders .order-line{grid-template-columns:minmax(0,1fr)}.customer-orders .editor-actions{flex-direction:row}.customer-orders .editor-actions button{flex:1}}
  `],
})
export class CustomerOrdersComponent implements OnInit, OnChanges {
  readonly businessId = input.required<string>();
  readonly userId = input.required<string>();
  readonly role = input<string | null | undefined>(undefined);
  readonly signedIn = input.required<boolean>();
  readonly currencyCode = input<string>('EGP');
  readonly products = input<readonly Product[]>([]);
  readonly customers = input<readonly Customer[]>([]);
  readonly drivers = input<readonly InvoiceDraftDriver[]>([]);
  readonly transportEnabled = input<boolean>(false);
  readonly transportUnitName = input<string>('');

  readonly openInvoice = output<string>();

  private readonly api = inject(ApiService);
  private readonly localization = inject(LocalizationService);
  private readonly ordersLoadGuard = new WorkspaceLoadGuard();

  orders: CustomerOrder[] = [];
  ordersLoading = false;
  ordersError = '';
  notice = '';

  editorOpen = false;
  editingOrder: CustomerOrder | null = null;
  editorOrderNumber = '';
  editorCustomerId = '';
  editorDiscountRate = '0';
  editorTaxRate = '0';
  editorNotes = '';
  editorDriverId = '';
  editorTrips: number | null = null;
  editorFrom = '';
  editorTo = '';
  editorLines: OrderEditorLine[] = [];
  editorSaving = false;
  editorError = '';

  private busyOrderIds = new Set<string>();

  get isOwner(): boolean {
    return this.role() === 'owner';
  }

  ngOnInit(): void {
    void this.loadOrders();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['businessId'] || changes['businessId'].firstChange) return;
    this.ordersLoadGuard.invalidate();
    this.orders = [];
    this.ordersError = '';
    this.ordersLoading = false;
    this.closeEditor();
    void this.loadOrders();
  }

  private ordersRequestContext(): TenantRequestContext {
    return {
      workspaceId: this.businessId(),
      userId: this.userId(),
      role: this.role() ?? null,
      signedIn: this.signedIn(),
    };
  }

  async loadOrders(): Promise<void> {
    const requestContext = this.ordersRequestContext();
    if (!requestContext.signedIn || !requestContext.userId || !requestContext.workspaceId) return;
    this.ordersLoading = true;
    this.ordersError = '';
    await runTenantScopedRequest(
      this.ordersLoadGuard,
      requestContext,
      () => this.ordersRequestContext(),
      () => this.api.customerOrders(requestContext.workspaceId),
      {
        onSuccess: orders => { this.orders = orders; },
        onError: error => {
          this.orders = [];
          this.ordersError = this.message(error) || this.t('ui.customerOrders.loadError');
        },
        onFinally: () => { this.ordersLoading = false; },
        onStale: () => { this.ordersLoading = false; },
      },
    );
  }

  rowBusy(orderId: string): boolean {
    return this.busyOrderIds.has(orderId);
  }

  orderStatusLabel(status: CustomerOrder['status']): string {
    return this.t(`ui.customerOrders.status${status[0].toUpperCase()}${status.slice(1)}`);
  }

  lineProduct(line: OrderEditorLine): Product | undefined {
    return this.products().find(product => product.id === line.product_id);
  }

  /** The catalog price follows the chosen unit: unit_price x factor for the second unit. */
  linePrice(line: OrderEditorLine): string {
    const product = this.lineProduct(line);
    if (!product?.unit_price) return '';
    if (line.unit && product.second_unit_name && line.unit === product.second_unit_name && product.conversion_factor) {
      const priced = Number(product.unit_price) * Number(product.conversion_factor);
      return `${priced.toFixed(2)} ${this.currencyCode()}`;
    }
    return `${product.unit_price} ${this.currencyCode()}`;
  }

  editorSubtotalEstimate(): string {
    let total = 0;
    for (const line of this.editorLines) {
      const product = this.lineProduct(line);
      if (!product?.unit_price) continue;
      const quantity = Number(line.quantity) || 0;
      const factor = line.unit && product.second_unit_name && line.unit === product.second_unit_name && product.conversion_factor
        ? Number(product.conversion_factor) : 1;
      total += quantity * Number(product.unit_price) * factor;
    }
    return total.toFixed(2);
  }

  onLineProductChange(line: OrderEditorLine): void {
    // A new product resets the selling unit — the old unit belongs to the old product.
    line.unit = '';
  }

  addEditorLine(): void {
    this.editorLines = [...this.editorLines, {
      id: `line-${Date.now()}-${this.editorLines.length}`,
      product_id: '', quantity: '1', unit: '',
    }];
  }

  removeEditorLine(line: OrderEditorLine): void {
    this.editorLines = this.editorLines.filter(item => item.id !== line.id);
  }

  startNewOrder(): void {
    this.editingOrder = null;
    this.editorOrderNumber = this.nextOrderNumber();
    this.editorCustomerId = '';
    this.editorDiscountRate = '0';
    this.editorTaxRate = '0';
    this.editorNotes = '';
    this.editorDriverId = '';
    this.editorTrips = null;
    this.editorFrom = '';
    this.editorTo = '';
    this.editorLines = [{ id: 'line-new-0', product_id: '', quantity: '1', unit: '' }];
    this.editorError = '';
    this.notice = '';
    this.editorOpen = true;
  }

  startEditOrder(order: CustomerOrder): void {
    this.editingOrder = order;
    this.editorOrderNumber = order.order_number;
    this.editorCustomerId = order.customer_id || '';
    this.editorDiscountRate = order.discount_rate;
    this.editorTaxRate = order.tax_rate;
    this.editorNotes = order.notes || '';
    this.editorDriverId = order.driver_employee_id || '';
    this.editorTrips = order.transport_trips ?? null;
    this.editorFrom = order.transport_from || '';
    this.editorTo = order.transport_to || '';
    this.editorLines = order.lines.map(line => ({
      id: `line-${line.id}`,
      product_id: line.product_id || '',
      quantity: line.quantity,
      unit: line.sold_unit || '',
    }));
    this.editorError = '';
    this.notice = '';
    this.editorOpen = true;
  }

  closeEditor(): void {
    this.editorOpen = false;
    this.editingOrder = null;
    this.editorError = '';
    this.editorSaving = false;
  }

  async saveOrder(): Promise<void> {
    const orderNumber = this.editorOrderNumber.trim();
    if (!orderNumber) {
      this.editorError = this.t('ui.customerOrders.needNumber');
      return;
    }
    const lines = this.editorLines.filter(line => line.product_id);
    if (!lines.length) {
      this.editorError = this.t('ui.customerOrders.needLine');
      return;
    }
    const body = {
      order_number: orderNumber,
      currency_code: this.editingOrder?.currency_code || this.currencyCode(),
      customer_id: this.editorCustomerId || undefined,
      lines: lines.map((line): InvoiceLineInput => ({
        product_id: line.product_id,
        quantity: line.quantity,
        ...(line.unit ? { unit: line.unit } : {}),
      })),
      discount_rate: this.editorDiscountRate || '0',
      tax_rate: this.editorTaxRate || '0',
      notes: this.editorNotes.trim() || null,
      // The delivery block is only sent while the switch is on — OFF
      // means the editor never renders these fields, so they stay absent.
      ...(this.transportEnabled() ? {
        driver_employee_id: this.editorDriverId || null,
        transport_trips: this.editorTrips,
        transport_from: this.editorFrom.trim() || null,
        transport_to: this.editorTo.trim() || null,
      } : {}),
    };
    this.editorSaving = true;
    this.editorError = '';
    try {
      const saved = this.editingOrder
        ? await this.api.updateCustomerOrder(this.businessId(), this.editingOrder.id, body)
        : await this.api.createCustomerOrder(this.businessId(), body);
      void saved;
      this.closeEditor();
      this.notice = '';
      await this.loadOrders();
    } catch (error) {
      this.editorError = this.message(error) || this.t('ui.customerOrders.saveError');
    } finally {
      this.editorSaving = false;
    }
  }

  async confirmOrder(order: CustomerOrder): Promise<void> {
    await this.runRowAction(order, () => this.api.confirmCustomerOrder(this.businessId(), order.id));
  }

  async cancelOrder(order: CustomerOrder): Promise<void> {
    await this.runRowAction(order, () => this.api.cancelCustomerOrder(this.businessId(), order.id));
  }

  async convertOrder(order: CustomerOrder): Promise<void> {
    this.busyOrderIds.add(order.id);
    try {
      const converted = await this.api.convertCustomerOrder(this.businessId(), order.id);
      await this.loadOrders();
      this.notice = this.t('ui.customerOrders.convertedOpen');
      if (converted.converted_invoice_id) this.openInvoice.emit(converted.converted_invoice_id);
    } catch (error) {
      this.ordersError = this.message(error) || this.t('ui.customerOrders.convertError');
    } finally {
      this.busyOrderIds.delete(order.id);
    }
  }

  private async runRowAction(order: CustomerOrder, action: () => Promise<CustomerOrder>): Promise<void> {
    this.busyOrderIds.add(order.id);
    this.ordersError = '';
    try {
      await action();
      await this.loadOrders();
    } catch (error) {
      this.ordersError = this.message(error);
    } finally {
      this.busyOrderIds.delete(order.id);
    }
  }

  private nextOrderNumber(): string {
    // A client-side suggestion only — the server enforces uniqueness
    // per business, and a 409 surfaces as the save error.
    const used = new Set(this.orders.map(order => order.order_number));
    let n = this.orders.length + 1;
    while (used.has(`ORD-${String(n).padStart(3, '0')}`)) n += 1;
    return `ORD-${String(n).padStart(3, '0')}`;
  }

  private message(error: unknown): string {
    const value = error as { code?: string; message?: string };
    const message = typeof value?.message === 'string' ? value.message : '';
    const deniedMessage = message.trim();
    if (deniedMessage === 'Authentication required' || deniedMessage === 'Authenticated subject is missing') {
      return this.t('ui.m_agj0gj');
    }
    if (deniedMessage === 'Platform administrator access is not granted.') {
      return this.t('ui.m_1404mrg');
    }
    if ([
      'No active membership for this business',
      'Business role is not permitted for this operation',
      'No access to this business workspace.',
    ].includes(deniedMessage) || /^(?:forbidden|permission denied|not authorized|access denied)\b/i.test(deniedMessage)) {
      return this.t('ui.m_1nbaoyf');
    }
    if (/timed out/i.test(message)) return this.t('ui.m_1wa8x7o');
    if (message.startsWith('API_CONNECTION_FAILED:')) return this.t('ui.m_1qj0ayu');
    if (/failed to fetch|networkerror|load failed/i.test(message)) return this.t('ui.m_g15vmh');
    if (message) return message;
    return this.t('ui.m_s1b5tm');
  }

  // Public: the template calls t(...) directly (same convention as the other workspaces).
  t(key: string, params?: Record<string, string | number>): string {
    return this.localization.translate(key, params);
  }
}
