import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Shared visual surface applied to native section elements; feature content stays projected. */
@Component({
  selector: 'section[abaCard]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styles: [`
    :host{display:block;min-width:0;width:100%;padding:var(--aba-space-5, 20px);margin-top:var(--aba-space-1, 4px);background:var(--aba-color-surface, #fff);border:1px solid var(--aba-color-border, #e5eaf1);border-radius:var(--aba-radius-card, 14px);box-shadow:var(--aba-shadow-card, 0 1px 2px rgb(15 23 42 / 4%))}
    :host(.narrow){max-width:650px;margin:var(--aba-space-10, 40px) auto}
    @media(max-width:600px){
      :host{padding:var(--aba-space-4, 16px)}
      :host(.narrow){margin-block:24px}
    }
    @media(max-width:380px){
      :host{padding:var(--aba-space-3, 12px)}
      :host(.narrow){margin-block:16px}
    }
  `],
})
export class AbaCardComponent {}
