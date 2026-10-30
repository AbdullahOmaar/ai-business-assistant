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
    let unsubscribe: () => void = () => {};
    let subscriptionReady = false;
    let readyPending = false;
    let cleanupPending = false;

    const clearPendingTimer = (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer);
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      if (subscriptionReady) unsubscribe();
      else cleanupPending = true;
      const error = new Error('Firebase sign-in session check timed out. Retry when your connection is stable.');
      onError(error);
      reject(error);
    }, timeoutMs);

    const markReady = () => {
      if (subscriptionReady) onReady(unsubscribe);
      else readyPending = true;
    };

    const handleError = (error: unknown) => {
      setUser(null);
      if (!settled) {
        settled = true;
        clearPendingTimer(timeoutId);
        if (subscriptionReady) unsubscribe();
        else cleanupPending = true;
        onError(error);
        reject(error);
        return;
      }
      if (subscriptionReady) unsubscribe();
      else cleanupPending = true;
      onError(error);
    };

    try {
      unsubscribe = subscribe(
        user => {
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
      if (cleanupPending) unsubscribe();
      if (readyPending && !cleanupPending) onReady(unsubscribe);
    } catch (error) {
      if (!settled) {
        settled = true;
        clearPendingTimer(timeoutId);
        onError(error);
        reject(error);
      }
    }
  });
}
