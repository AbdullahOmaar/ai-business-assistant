import { computed, signal } from '@angular/core';

/**
 * Reference-counted loading state (T18 Slice B).
 *
 * The shell's `loading` flag used to be a plain boolean, so concurrent
 * operations could clear it early: whichever request finished first hid the
 * loader while others were still running. Every operation now owns exactly
 * one count: `begin()` on start, `end()` on completion, error, or
 * cancellation, exactly once, in a `finally`. The loader shows only while
 * the count is > 0, so concurrent requests cannot stop it early and a
 * cancelled or failed request cannot stick it on.
 *
 * The version/tenant guards in the shell still protect the *data* writes
 * (a stale response must not apply its results). They must not gate the
 * release: a superseded operation that never releases its count would leak
 * one count and stick the loader on. Where a spec pins a guarded release
 * (saveInvoiceDraft, createProduct, printInvoice), the release stays
 * guarded and the leak is closed by `reset()`: every path that invalidates
 * those guards goes through `clearWorkspaceData()`, which resets the count.
 *
 * `end()` clamps at zero, so a release on a path that never began (for
 * example `resetSignedOutState`, or the `loadWorkspaceData` early return)
 * is a no-op instead of driving the count negative. No timer, no fake
 * completion, no invented progress percentage.
 *
 * This class carries no Angular decorator on purpose: the node test runner
 * (`--experimental-strip-types`) cannot import decorator syntax, so the
 * counting logic lives here and `AbaLoadingStateService` is only the
 * `providedIn: 'root'` registration of it.
 */
export class LoadingCounter {
  private readonly activeCount = signal(0);

  /** Number of in-flight operations holding the loader. */
  readonly count = this.activeCount.asReadonly();

  /** True while at least one operation is in flight. */
  readonly isLoading = computed(() => this.activeCount() > 0);

  /** Claim one count for an operation that just started. */
  begin(): void {
    this.activeCount.update((count) => count + 1);
  }

  /**
   * Release exactly one count. Call once per `begin()`, in a `finally`, on
   * completion, error, and cancellation alike.
   */
  end(): void {
    this.activeCount.update((count) => Math.max(0, count - 1));
  }

  /**
   * Release every held count. Only for context changes that invalidate all
   * in-flight work (workspace switch, sign-out, workspace-load failure):
   * their results are discarded, so their counts must not survive them.
   */
  reset(): void {
    this.activeCount.set(0);
  }
}
