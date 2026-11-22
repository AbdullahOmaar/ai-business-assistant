import { CommonModule } from '@angular/common';
import { LocalizationService } from '../../localization.service';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { AbaStateMessageComponent } from './aba-state-message.component';
import { AbaSkeletonComponent } from './aba-skeleton.component';

export interface AbaRecordTableColumn { key:string; label:string; primary?:boolean; kind?:'text'|'numeric'|'status'; }
export interface AbaRecordTableAction { id:string; label:string; disabled?:boolean; }
export interface AbaRecordTableRow { id:string; cells:Readonly<Record<string,string>>; actions?:readonly AbaRecordTableAction[]; }
export interface AbaRecordTableActionEvent { rowId:string; actionId:string; anchor:HTMLElement; }

/** Shared record presentation; domain filtering, permissions and actions stay in the feature. */
@Component({
  selector:'aba-record-table', standalone:true, imports:[CommonModule,AbaStateMessageComponent,AbaSkeletonComponent],
  changeDetection:ChangeDetectionStrategy.OnPush,
  styles:[`.aba-record-table__skeletons{display:grid;gap:10px}`],
  template:`
    <section class="aba-record-table">
      @if(loading()){
        <div class="aba-record-table__skeletons" role="status">
          <span class="aba-record-table__visually-hidden">{{loadingDescription()}}</span>
          @for(row of skeletonRowIndexes;track row){<aba-skeleton variant="list-row" />}
        </div>
      } @else if(rows().length){
        <div class="aba-record-table__mobile-sort"><select class="aba-record-table__mobile-sort-select" [attr.aria-label]="sortByLabel()" [value]="mobileSortValue" (change)="onMobileSortChange($event)"><option value="">{{ sortByLabel() }}</option>@for(column of columns();track column.key){<option [value]="column.key + ':asc'">{{column.label}} ↑</option><option [value]="column.key + ':desc'">{{column.label}} ↓</option>}</select></div>
        <div class="aba-record-table__viewport" role="region" tabindex="0" [attr.aria-label]="ariaLabel()">
          <table>
            <caption class="aba-record-table__visually-hidden">{{ariaLabel()}}</caption>
            <thead><tr>
              @for(column of columns();track column.key){<th scope="col" [attr.aria-sort]="sortAria(column.key)"><button class="aba-record-table__sort-button" type="button" (click)="toggleSort(column)" [attr.tabindex]="isStacked() ? -1 : null" [attr.aria-label]="column.label" [attr.aria-pressed]="isSortActive(column.key)"><span>{{column.label}}</span><span class="aba-record-table__sort-indicator" aria-hidden="true">{{sortIndicator(column.key)}}</span></button></th>}
              @if(hasActions){<th scope="col">{{resolvedActionsHeading()}}</th>}
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
  /** Skeleton list-rows shown while loading (3A-371: G4 fixed loading —
   * the placeholder reserves the list's space instead of a text message). */
  readonly skeletonRows=input(5);
  get skeletonRowIndexes():readonly number[]{return Array.from({length:this.skeletonRows()},(_,index)=>index);}
  readonly emptyTitle=input('No records');
  readonly emptyDescription=input('There are no records to display.');
  readonly actionsHeading=input('');
  private readonly localization=inject(LocalizationService);
  readonly resolvedActionsHeading=computed(()=>this.actionsHeading()||this.localization.translate('ui.actions'));
  /** Tracks the ≤760px stacked layout, where the thead is clipped to 1x1
   * (routine (B) 2026-11-22). Guarded for the node unit runner, which has
   * no `window`. Same matchMedia pattern as aba-search-field. */
  private readonly stackedQuery = typeof window !== 'undefined'
    ? window.matchMedia('(max-width: 760px)') : null;
  protected readonly isStacked = signal(this.stackedQuery?.matches ?? false);
  /** "Sort by" label for the visible mobile sort group (ui.m_tpfmbp). */
  readonly sortByLabel = computed(() => this.localization.translate('ui.m_tpfmbp'));

  constructor() {
    this.stackedQuery?.addEventListener('change', (event) => this.isStacked.set(event.matches));
  }
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
  isSortActive(key:string):boolean{return this.activeSortKey===key;}
  sortAria(key:string):string|null{return this.activeSortKey===key?(this.sortDirection==='asc'?'ascending':'descending'):null;}
  sortIndicator(key:string):string{return this.activeSortKey!==key?'↕':this.sortDirection==='asc'?'↑':'↓';}
  /** Mobile sort select value: '' (unsorted) or '<key>:asc' / '<key>:desc'.
   * A plain getter, not a computed — activeSortKey/sortDirection are plain
   * fields, so a computed would never re-evaluate; the getter re-reads on
   * every change-detection pass, like isSortActive() in the template. */
  get mobileSortValue():string{return this.activeSortKey?`${this.activeSortKey}:${this.sortDirection}`:'';}
  /** The select offers both directions explicitly: a select fires no change
   * event for re-selecting the same value, so direction cannot rely on
   * toggle-on-repeat the way the thead buttons do. Drives the same sort
   * state the thead buttons use, so both stay in sync. */
  onMobileSortChange(event:Event):void{
    const value=(event.target as HTMLSelectElement|null)?.value??'';
    if(!value){this.activeSortKey='';this.sortDirection='asc';return;}
    const [key,direction]=value.split(':');
    this.activeSortKey=key??'';
    this.sortDirection=direction==='desc'?'desc':'asc';
  }
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
