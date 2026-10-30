export type AuthStateSubscriber<T> = (
  onUser: (user: T | null) => void,
  onError: (error: unknown) => void
) => () => void;

/**
 * Wait for Firebase's initial auth-state callback while retaining the observer
 * for subsequent cross-tab sign-in/sign-out changes.
 */
export function observeAuthState<T>(
  subscribe: AuthStateSubscriber<T>,
  setUser: (user: T | null) => void,
  onError: (error: unknown) => void,
  onReady: (unsubscribe: () => void) => void,
  timeoutMs = 10_000
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let terminated = false;
    let unsubscribe: () => void = () => {};
    let subscriptionReady = false;
    let readyPending = false;
    let cleanupPending = false;

    const clearPendingTimer = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer);
    const releaseObserver = () => {
      if (!subscriptionReady) {
        cleanupPending = true;
        return;
      }
      try {
        unsubscribe();
      } catch {
        // Teardown failures must not prevent auth readiness from settling.
      }
    };
    const notifyError = (error: unknown) => {
      try {
        onError(error);
      } catch {
        // Consumer error handlers must not prevent the original auth error propagating.
      }
    };
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminated = true;
      releaseObserver();
      const error = new Error('Firebase sign-in session check timed out. Retry when your connection is stable.');
      notifyError(error);
      reject(error);
    }, timeoutMs);

    const markReady = () => {
      if (subscriptionReady) onReady(unsubscribe);
      else readyPending = true;
    };

    const handleError = (error: unknown) => {
      if (terminated) return;
      terminated = true;
      setUser(null);
      if (!settled) {
        settled = true;
        clearPendingTimer(timeoutId);
        releaseObserver();
        notifyError(error);
        reject(error);
        return;
      }
      releaseObserver();
      notifyError(error);
    };

    try {
      unsubscribe = subscribe(
        user => {
          if (terminated) return;
          setUser(user);
          if (settled) return;
          settled = true;
          clearPendingTimer(timeoutId);
          markReady();
          resolve();
        },
        handleError
      );
      subscriptionReady = true;
      if (cleanupPending) releaseObserver();
      if (readyPending && !cleanupPending) onReady(unsubscribe);
    } catch (error) {
      if (!settled) {
        settled = true;
        clearPendingTimer(timeoutId);
        notifyError(error);
        reject(error);
      }
    }
  });
}
