import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Shared visual surface applied to native section elements; feature content stays projected. */
@Component({
  selector: 'section[abaCard]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styles: [`
    :host{display:block;min-width:0;width:100%;padding:22px;margin-top:4px;background:var(--aba-color-surface, #fff);border:1px solid var(--aba-color-border, #e5eaf1);border-radius:var(--aba-radius-card, 14px)}
    :host(.narrow){max-width:650px;margin:50px auto}
    @media(max-width:600px){:host{padding:14px}}
  `],
})
export class AbaCardComponent {}
