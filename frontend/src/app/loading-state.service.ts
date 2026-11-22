import { Injectable } from '@angular/core';
import { LoadingCounter } from './loading-counter';

/**
 * Reference-counted loading state, provided app-wide (T18 Slice B).
 * The counting rules live in `LoadingCounter`; this class is only the DI
 * registration, so the counter stays importable by the node test runner.
 */
@Injectable({ providedIn: 'root' })
export class AbaLoadingStateService extends LoadingCounter {}
