import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'aba-confirm-dialog',
  standalone: true,
  template: \`
    <div class="confirm-backdrop" (click)="onBackdropClick($event)">
      <section
        #dialog
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="aba-confirm-title"
        aria-describedby="aba-confirm-description"
        [attr.aria-busy]="busy ? 'true' : null"
        tabindex="-1">
        <div class="confirm-mark" [class.danger]="tone === 'danger'" aria-hidden="true">!</div>
        <div class="confirm-content">
          <h2 id="aba-confirm-title">{{ title }}</h2>
          <p id="aba-confirm-description">{{ message }}</p>
          @if (warning) {
            <p class="confirm-warning">{{ warning }}</p>
          }
          @if (details.length) {
            <div class="confirm-details">
              <h3>{{ detailsTitle }}</h3>
              <ul>
                @for (detail of details; track $index) {
                  <li>{{ detail }}</li>
                }
              </ul>
            </div>
          }
          @if (error) {
            <p class="confirm-error" role="alert">{{ error }}</p>
          }
          <div class="confirm-actions">
            <button #cancelButton class="confirm-cancel" type="button" (click)="cancelled.emit()" [disabled]="busy">{{ cancelLabel }}</button>
            <button #confirmButton class="confirm-accept" [class.danger]="tone === 'danger'" type="button" (click)="confirmed.emit()" [disabled]="busy || confirmDisabled">{{ busy ? busyLabel : confirmLabel }}</button>
          </div>
        </div>
      </section>
    </div>
  \`,
  styles: [\`
    :host{position:fixed;inset:0;z-index:5000;display:block;direction:inherit}
    .confirm-backdrop{position:absolute;inset:0;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.58);backdrop-filter:blur(4px);overscroll-behavior:contain}
    .confirm-dialog{display:grid;grid-template-columns:42px minmax(0,1fr);gap:15px;width:min(100%,560px);max-height:calc(100dvh - 32px);overflow:auto;padding:22px;border:1px solid var(--aba-color-border-strong,#cbd5e1);border-radius:18px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#172033);box-shadow:0 24px 64px rgba(15,23,42,.24);outline:none}
    .confirm-dialog:focus-visible{outline:var(--aba-focus-ring-width,3px) solid var(--aba-color-focus-ring,#2563eb);outline-offset:3px}
    .confirm-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:var(--aba-color-warning-soft,#fffbeb);color:var(--aba-color-warning,#92400e);font-size:20px;font-weight:900}
    .confirm-mark.danger{background:var(--aba-color-danger-soft,#fef2f2);color:var(--aba-color-danger,#b91c1c)}
    .confirm-content{min-width:0}
    .confirm-content h2{margin:0 0 9px;font-size:18px;line-height:1.35;overflow-wrap:anywhere}
    .confirm-content p{margin:0;color:var(--aba-color-text-secondary,#475569);font-size:13px;line-height:1.65;overflow-wrap:anywhere}
    .confirm-warning{margin-top:12px!important;padding:10px 12px;border-inline-start:3px solid var(--aba-color-warning,#d97706);border-radius:8px;background:var(--aba-color-warning-soft,#fffbeb);color:var(--aba-color-text-primary,#334155)!important}
    .confirm-details{margin-top:14px;padding:12px;border:1px solid var(--aba-color-border,#e2e8f0);border-radius:11px;background:var(--aba-color-surface-subtle,#f8fafc);min-width:0}
    .confirm-details h3{margin:0 0 8px;font-size:12px}
    .confirm-details ul{margin:0;padding-inline-start:20px;display:grid;gap:6px;font-size:12px;line-height:1.55;overflow-wrap:anywhere}
    .confirm-error{margin-top:12px!important;padding:10px 12px;border:1px solid var(--aba-color-danger-border,#fecaca);border-radius:9px;background:var(--aba-color-danger-soft,#fef2f2);color:var(--aba-color-danger,#991b1b)!important}
    .confirm-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:9px;margin-top:20px}
    .confirm-actions button{min-width:112px;min-height:44px;padding:10px 14px;border:1px solid var(--aba-color-border-strong,#cbd5e1);border-radius:10px;background:var(--aba-color-surface,#fff);color:var(--aba-color-text-primary,#334155);font:inherit;font-size:12px;font-weight:800;cursor:pointer}
    .confirm-actions .confirm-accept{border-color:var(--aba-color-primary,#0f766e);background:var(--aba-color-primary,#0f766e);color:#fff}
    .confirm-actions .confirm-accept.danger{border-color:var(--aba-color-danger,#b91c1c);background:var(--aba-color-danger,#b91c1c)}
    .confirm-actions button:disabled{opacity:.55;cursor:not-allowed}
    .confirm-actions button:focus-visible{outline:var(--aba-focus-ring-width,3px) solid var(--aba-color-focus-ring,#2563eb);outline-offset:3px}
    @media(max-width:480px){.confirm-dialog{grid-template-columns:1fr;padding:17px;border-radius:15px}.confirm-mark{width:34px;height:34px}.confirm-actions{display:grid;grid-template-columns:1fr 1fr}.confirm-actions button{min-width:0}}
  \`],
})
export class AbaConfirmDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() title = '';
  @Input() message = '';
  @Input() warning = '';
  @Input() detailsTitle = '';
  @Input() details: readonly string[] = [];
  @Input() confirmLabel = '';
  @Input() cancelLabel = '';
  @Input() busyLabel = '';
  @Input() error = '';
  @Input() busy = false;
  @Input() confirmDisabled = false;
  @Input() tone: 'warning' | 'danger' = 'warning';
  @Input() returnFocusTo: HTMLElement | null = null;
  @Input() focusFallbackId = '';

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('dialog') private dialog?: ElementRef<HTMLElement>;
  @ViewChild('cancelButton') private cancelButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('confirmButton') private confirmButton?: ElementRef<HTMLButtonElement>;

  private previousActiveElement: HTMLElement | null = null;

  ngOnInit(): void {
    if (typeof document !== 'undefined') {
      this.previousActiveElement = this.returnFocusTo ?? document.activeElement as HTMLElement | null;
    }
  }

  ngAfterViewInit(): void {
    queueMicrotask(() => this.cancelButton?.nativeElement.focus());
  }

  ngOnDestroy(): void {
    if (typeof document === 'undefined') return;
    const fallback = this.focusFallbackId
      ? document.getElementById(this.focusFallbackId) as HTMLElement | null
      : null;
    const target = this.previousActiveElement?.isConnected ? this.previousActiveElement : fallback;
    queueMicrotask(() => target?.focus());
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    const dialog = this.dialog?.nativeElement;
    if (!dialog) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!this.busy) this.cancelled.emit();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = [this.cancelButton?.nativeElement, this.confirmButton?.nativeElement]
      .filter((element): element is HTMLButtonElement => !!element && !element.disabled);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!dialog.contains(active)) {
      event.preventDefault();
      focusable[0].focus();
    } else if (event.shiftKey && active === focusable[0]) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && active === focusable[focusable.length - 1]) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && !this.busy) this.cancelled.emit();
  }
}
