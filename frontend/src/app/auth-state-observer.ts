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
    let initialStateReceived = false;
    let promiseSettled = false;
    let terminated = false;
    let unsubscribe: () => void = () => {};
    let subscriptionReady = false;
    let readyPending = false;
    let cleanupPending = false;

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
      if (promiseSettled) return;
      fail(new Error('Firebase sign-in session check timed out. Retry when your connection is stable.'));
    }, timeoutMs);

    const fail = (error: unknown) => {
      if (terminated) return;
      terminated = true;
      try {
        setUser(null);
      } catch {
        // The original observer/setup error remains authoritative.
      }
      releaseObserver();
      if (!promiseSettled) {
        promiseSettled = true;
        clearTimeout(timeoutId);
        notifyError(error);
        reject(error);
        return;
      }
      notifyError(error);
    };

    const finishReady = () => {
      if (promiseSettled || terminated) return;
      try {
        onReady(unsubscribe);
      } catch (error) {
        fail(error);
        return;
      }
      promiseSettled = true;
      resolve();
    };

    try {
      unsubscribe = subscribe(
        user => {
          if (terminated) return;
          try {
            setUser(user);
          } catch (error) {
            fail(error);
            return;
          }
          if (initialStateReceived) return;
          initialStateReceived = true;
          clearTimeout(timeoutId);
          if (subscriptionReady) finishReady();
          else readyPending = true;
        },
        fail
      );
      subscriptionReady = true;
      if (cleanupPending) releaseObserver();
      if (readyPending && !cleanupPending) finishReady();
    } catch (error) {
      // Do not resolve readiness until subscribe() has returned successfully.
      // A synchronous first callback followed by a thrown setup error is still a failure.
      fail(error);
    }
  });
}
