/**
 * Creates a one-page-lifecycle handler for ServiceWorkerContainer controllerchange.
 *
 * If this page has no controller yet, the first change is initial control acquisition
 * and must stay silent. Once a controller exists, the next replacement represents an
 * update and is announced once. Pages already controlled at startup announce their
 * next controller replacement immediately.
 */
export function createServiceWorkerUpdateHandler(
  initiallyControlled: boolean,
  onUpdateReady: () => void,
): () => void {
  let controlled = initiallyControlled;
  let updateNoticeShown = false;

  return () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    if (updateNoticeShown) return;

    updateNoticeShown = true;
    onUpdateReady();
  };
}
