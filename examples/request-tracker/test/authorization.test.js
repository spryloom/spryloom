import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { canChangeStatus, isRequestStatus, signedInEmail } from '../auth.js';

const request = { assignee: 'ryan@acme.com' };

describe('request-tracker identity and authorization', () => {
  test('uses the proxy identity email and normalizes it', () => {
    assert.equal(signedInEmail({ 'x-spryloom-email': ' Ryan@Acme.com ' }), 'ryan@acme.com');
    assert.equal(signedInEmail({}), undefined);
  });

  test('only the assignee or an admin can change status', () => {
    assert.equal(canChangeStatus({ 'x-spryloom-email': 'ryan@acme.com', 'x-spryloom-role': 'user' }, request), true);
    assert.equal(canChangeStatus({ 'x-spryloom-email': 'sam@acme.com', 'x-spryloom-role': 'user' }, request), false);
    assert.equal(canChangeStatus({ 'x-spryloom-email': 'sam@acme.com', 'x-spryloom-role': 'admin' }, request), true);
    assert.equal(canChangeStatus({ 'x-spryloom-role': 'admin' }, request), false);
  });

  test('accepts only the three workflow statuses', () => {
    assert.equal(isRequestStatus('open'), true);
    assert.equal(isRequestStatus('in_progress'), true);
    assert.equal(isRequestStatus('done'), true);
    assert.equal(isRequestStatus('deleted'), false);
  });
});
