import { randomBytes } from 'node:crypto';

export function generateReleaseId(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hex = randomBytes(3).toString('hex').toUpperCase();

  return `REL-${year}-${month}-${day}-${hex}`;
}
