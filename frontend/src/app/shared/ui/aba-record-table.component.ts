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
                    <td [attr.data-label]="column.label" [attr.data-kind]="column.kind||'text'" [class.aba-record-table__primary-cell]="column.primary">
                      @if(column.kind==='status'){<span class="aba-record-table__status-value">{{row.cells[column.key]||'—'}}</span>}
                      @else{<bdi [attr.dir]="column.kind==='numeric'?'ltr':'auto'">{{row.cells[column.key]||'—'}}</bdi>}
                    </td>
                  }
                  @if(hasActions){
                    <td class="aba-record-table__actions-cell" [attr.data-label]="actionsHeading()">
                      @if(row.actions?.length){
                        <div class="aba-record-table__actions">
                          @for(action of row.actions;track action.id){
                            <button class="secondary aba-record-table__action" type="button" [disabled]="action.disabled||false" (click)="activateRowAction(row.id,action.id,$event)">{{action.label}}</button>
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
  activateRowAction(rowId:string,actionId:string,event:MouseEvent):void{
    const anchor=event.currentTarget;
    if(anchor instanceof HTMLElement)this.rowAction.emit({rowId,actionId,anchor});
  }
}
