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
              @for(column of columns();track column.key){<th scope="col" [attr.aria-sort]="sortAria(column.key)"><button class="aba-record-table__sort-button" type="button" (click)="toggleSort(column)" [attr.aria-label]="column.label" [attr.aria-pressed]="activeSortKey===column.key"><span>{{column.label}}</span><span class="aba-record-table__sort-indicator" aria-hidden="true">{{sortIndicator(column.key)}}</span></button></th>}
              @if(hasActions){<th scope="col">{{actionsHeading()}}</th>}
            </tr></thead>
            <tbody>
              @for(row of sortedRows;track row.id){
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
  private activeSortKey = '';
  private sortDirection: 'asc' | 'desc' = 'asc';
  get sortedRows(): readonly AbaRecordTableRow[] {
    const key=this.activeSortKey;
    if(!key)return this.rows();
    const column=this.columns().find(item=>item.key===key);
    if(!column)return this.rows();
    const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
    return [...this.rows()].sort((left,right)=>{
      const a=left.cells[key]??'', b=right.cells[key]??'';
      let result:number;
      if(column.kind==='numeric'){
        const av=Number(a.replace(/,/g,'')), bv=Number(b.replace(/,/g,''));
        result=Number.isFinite(av)&&Number.isFinite(bv)?av-bv:collator.compare(a,b);
      }else result=collator.compare(a,b);
      return this.sortDirection==='asc'?result:-result;
    });
  }
  get hasActions():boolean{return this.rows().some(row=>!!row.actions?.length);}
  toggleSort(column:AbaRecordTableColumn):void{
    if(this.activeSortKey===column.key)this.sortDirection=this.sortDirection==='asc'?'desc':'asc';
    else{this.activeSortKey=column.key;this.sortDirection='asc';}
  }
  sortAria(key:string):string|null{return this.activeSortKey===key?(this.sortDirection==='asc'?'ascending':'descending'):null;}
  sortIndicator(key:string):string{return this.activeSortKey!==key?'↕':this.sortDirection==='asc'?'↑':'↓';}
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
