export interface PaymentAllocationPayload {
  invoice_id: string;
  amount: string;
}

export interface PaymentRequestPayload {
  amount: string;
  currency_code: string;
  idempotency_key: string;
  customer_id: string;
  allocations?: PaymentAllocationPayload[];
  method?: string;
  reference?: string;
}

export type DeepReadonly<T> =
  T extends (...args: never[]) => unknown ? T :
  T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] :
  T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T;

export interface PaymentRetrySnapshot {
  readonly businessId: string;
  readonly payload: DeepReadonly<PaymentRequestPayload>;
}

function clonePaymentPayload(
  payload: PaymentRequestPayload | DeepReadonly<PaymentRequestPayload>,
): PaymentRequestPayload {
  const copy: PaymentRequestPayload = {
    amount: payload.amount,
    currency_code: payload.currency_code,
    idempotency_key: payload.idempotency_key,
    customer_id: payload.customer_id,
  };
  if (payload.method !== undefined) copy.method = payload.method;
  if (payload.reference !== undefined) copy.reference = payload.reference;
  if (payload.allocations !== undefined) {
    copy.allocations = Array.from(payload.allocations, allocation => ({
      invoice_id: allocation.invoice_id,
      amount: allocation.amount,
    }));
  }
  return copy;
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/**
 * Captures the exact business + payment payload for an uncertain retry.
 * The snapshot is detached from editable form state and deeply immutable.
 */
export function createPaymentRetrySnapshot(
  businessId: string,
  payload: PaymentRequestPayload,
): PaymentRetrySnapshot {
  const normalizedBusinessId = businessId.trim();
  if (!normalizedBusinessId) throw new RangeError('A business ID is required for a payment retry.');
  if (!payload.idempotency_key.trim()) throw new RangeError('An idempotency key is required for a payment retry.');

  return deepFreeze({
    businessId: normalizedBusinessId,
    payload: clonePaymentPayload(payload),
  });
}

/**
 * Produces a fresh API request object from a snapshot without exposing
 * the immutable snapshot's nested allocation array to the API client.
 */
export function paymentRequestFromRetrySnapshot(
  snapshot: PaymentRetrySnapshot,
): PaymentRequestPayload {
  return clonePaymentPayload(snapshot.payload);
}
