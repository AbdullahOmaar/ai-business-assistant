/** HTTP statuses for which transactional API handlers guarantee no persisted write. */
export function isDefinitiveNoWriteHttpStatus(status: number): boolean {
  return [400, 401, 403, 404, 409, 422].includes(status);
}
