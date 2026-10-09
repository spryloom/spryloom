/**
 * Authorization rules for the M1 request-tracker starter.
 *
 * The proxy supplies these headers after stripping caller-provided copies.
 * Keeping the decisions here makes the role boundary testable without a live
 * database or a second authentication system in the starter.
 */

export const signedInEmail = (headers) => {
  const email = headers['x-spryloom-email'];
  return typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : undefined;
};

export const roleOf = (headers) => headers['x-spryloom-role'] === 'admin' ? 'admin' : 'user';

export const canChangeStatus = (headers, item) => {
  const email = signedInEmail(headers);
  return email !== undefined && (roleOf(headers) === 'admin' || item.assignee === email);
};

export const isRequestStatus = (value) => value === 'open' || value === 'in_progress' || value === 'done';
