import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AbaStateMessageComponent } from './aba-state-message.component';

export interface AbaRecordTableColumn { key:string; label:string; primary?:boolean; kind?:'text'|'numeric'|'status'; }
export interface AbaRecordTableAction { id:string; label:string; disabled?:boolean; }
export interface AbaRecordTableRow { id:string; cells:Readonly<Record<string,string>>; actions?:readonly AbaRecordTableAction[]; }
export interface AbaRecordTableActionEvent { rowId:string; actionId:string; anchor:HTMLElement; }

/** Shared record presentation; domain filtering, permissions and actions stay in the feature. */
@Component({
  selector:'aba-record-table', standalone:true, imports:[CommonModule,AbaStateMessageComponent],
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <section class="aba-record-table">
      @if(loading()){
        <aba-state-message kind="loading" [description]="loadingDescription()" />
      } @else if(rows().length){
        <div class="aba-record-table__viewport" role="region" tabindex="0" [attr.aria-label]="ariaLabel()">
          <table>
            <caption class="aba-record-table__visually-hidden">{{ariaLabel()}}</caption>
            <thead><tr>
              @for(column of columns();track column.key){<th scope="col">{{column.label}}</th>}
              @if(hasActions){<th scope="col">{{actionsHeading()}}</th>}
            </tr></thead>
            <tbody>
              @for(row of rows();track row.id){
                <tr>
                  @for(column of columns();track column.key){
                    @if(column.primary){
                      <th scope="row" [attr.data-label]="column.label" [attr.data-kind]="column.kind||'text'" class="aba-record-table__primary-cell">
                        @if(column.kind==='status'){<span class="aba-record-table__status-value">{{row.cells[column.key]||'—'}}</span>}
                        @else{<bdi [attr.dir]="column.kind==='numeric'?'ltr':'auto'">{{row.cells[column.key]||'—'}}</bdi>}
                      </th>
                    } @else{
                      <td [attr.data-label]="column.label" [attr.data-kind]="column.kind||'text'">
                        @if(column.kind==='status'){<span class="aba-record-table__status-value">{{row.cells[column.key]||'—'}}</span>}
                        @else{<bdi [attr.dir]="column.kind==='numeric'?'ltr':'auto'">{{row.cells[column.key]||'—'}}</bdi>}
                      </td>
                    }
                  }
                  @if(hasActions){
                    <td class="aba-record-table__actions-cell" [attr.data-label]="actionsHeading()">
                      @if(row.actions?.length){
                        <div class="aba-record-table__actions">
                          @for(action of row.actions;track action.id){
                            <button class="secondary aba-record-table__action" type="button" [attr.aria-label]="actionAriaLabel(row,action)" [disabled]="action.disabled||false" (click)="activateRowAction(row.id,action.id,$event)">{{action.label}}</button>
                          }
                        </div>
                      } @else{<span class="aba-record-table__no-action">—</span>}
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else{<aba-state-message kind="empty" [title]="emptyTitle()" [description]="emptyDescription()" />}
    </section>
  `,

  styles: [`
    :host{display:block;min-width:0}
    .aba-record-table{min-width:0}
    .aba-record-table__viewport{max-width:100%;overflow:auto;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:14px;background:var(--aba-color-surface,#fff);overscroll-behavior-inline:contain}
    .aba-record-table__viewport:focus-visible{outline:3px solid var(--aba-color-focus-ring,#2563eb);outline-offset:3px}
    table{width:100%;border-collapse:separate;border-spacing:0;text-align:start;font-size:13px}
    thead{background:var(--aba-color-surface-subtle,#f8fafc)}
    th,td{padding:12px 14px;border-bottom:1px solid var(--aba-color-border-subtle,#eef2f7);vertical-align:middle;text-align:start}
    thead th{color:var(--aba-color-text-secondary,#475569);font-size:12px;font-weight:750;white-space:nowrap}
    tbody tr:last-child th,tbody tr:last-child td{border-bottom:0}
    tbody tr:hover{background:var(--aba-color-surface-hover,#f8fafc)}
    .aba-record-table__primary-cell{color:var(--aba-color-text-primary,#172033);font-weight:750}
    .aba-record-table__status-value{display:inline-flex;max-width:100%;align-items:center;padding:5px 9px;border:1px solid var(--aba-color-border,#e2e8f0);border-radius:999px;background:var(--aba-color-surface-subtle,#f8fafc);font-size:12px;font-weight:700;overflow-wrap:anywhere}
    .aba-record-table__actions{display:flex;flex-wrap:wrap;gap:7px}
    .aba-record-table__action{min-height:40px;white-space:nowrap}
    .aba-record-table__visually-hidden{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    .aba-record-table__no-action{color:var(--aba-color-text-tertiary,#64748b)}
    @media(max-width:680px){
      .aba-record-table__viewport{overflow:visible;border:0;background:transparent}
      table,tbody{display:block;width:100%}
      thead{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      tbody{display:grid;gap:10px}
      tbody tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 12px;padding:12px;border:1px solid var(--aba-color-border,#e5eaf1);border-radius:14px;background:var(--aba-color-surface,#fff);box-shadow:var(--aba-shadow-card,0 1px 2px rgb(15 23 42 / 4%))}
      tbody tr:hover{background:var(--aba-color-surface,#fff)}
      tbody th,tbody td{display:grid;grid-template-columns:minmax(0,1fr);gap:4px;min-width:0;padding:8px 2px;border:0;text-align:start}
      tbody th::before,tbody td::before{content:attr(data-label);color:var(--aba-color-text-secondary,#5d6878);font-size:11px;font-weight:650;line-height:1.4}
      tbody .aba-record-table__primary-cell{grid-column:1/-1;padding-block:4px 10px;border-bottom:1px solid var(--aba-color-border-subtle,#eef2f7);font-size:15px}
      tbody .aba-record-table__primary-cell::before{font-size:11px}
      tbody .aba-record-table__actions-cell{grid-column:1/-1;padding-top:10px;border-top:1px solid var(--aba-color-border-subtle,#eef2f7)}
      .aba-record-table__actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px}
      .aba-record-table__action{min-height:44px;white-space:normal}
    }
    @media(max-width:360px){tbody tr{grid-template-columns:minmax(0,1fr)}tbody .aba-record-table__primary-cell,tbody .aba-record-table__actions-cell{grid-column:1}}
    @media(prefers-reduced-motion:reduce){.aba-record-table__viewport{scroll-behavior:auto}}
  `],
})
export class AbaRecordTableComponent {
  readonly ariaLabel=input.required<string>();
  readonly columns=input<readonly AbaRecordTableColumn[]>([]);
  readonly rows=input<readonly AbaRecordTableRow[]>([]);
  readonly loading=input(false);
  readonly loadingDescription=input('Loading records…');
  readonly emptyTitle=input('No records');
  readonly emptyDescription=input('There are no records to display.');
  readonly actionsHeading=input('Actions');
  readonly rowAction=output<AbaRecordTableActionEvent>();
  get hasActions():boolean{return this.rows().some(row=>!!row.actions?.length);}
  actionAriaLabel(row:AbaRecordTableRow,action:AbaRecordTableAction):string{
    const primaryColumn=this.columns().find(column=>column.primary);
    const recordLabel=primaryColumn?row.cells[primaryColumn.key]:row.id;
    return recordLabel ? action.label + ': ' + recordLabel : action.label;
  }
  activateRowAction(rowId:string,actionId:string,event:MouseEvent):void{
    const anchor=event.currentTarget;
    if(anchor instanceof HTMLElement)this.rowAction.emit({rowId,actionId,anchor});
  }
}
