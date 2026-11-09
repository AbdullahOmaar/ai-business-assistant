/** HTTP statuses that unambiguously reject before a write; conflicts can reflect a prior successful attempt. */
export function isDefinitiveNoWriteHttpStatus(status: number): boolean {
  return [400, 401, 403, 404, 422].includes(status);
}
