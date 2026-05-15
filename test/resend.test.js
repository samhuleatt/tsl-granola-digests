import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { sendEmail } from '../src/resend.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('sendEmail passes Resend idempotency key', async () => {
  const seen = {};
  globalThis.fetch = async (_url, options) => {
    Object.assign(seen, options.headers);
    return new Response('{"id":"email_123"}', { status: 200 });
  };

  await sendEmail({
    subject: 'TSL Daily — Test',
    html: '<p>ok</p>',
    idempotencyKey: 'tsl-digest/2026-05-14'
  });

  assert.equal(seen['Idempotency-Key'], 'tsl-digest/2026-05-14');
});

test('sendEmail treats Resend idempotency conflicts as suppressed duplicates', async () => {
  globalThis.fetch = async () => new Response(
    '{"name":"invalid_idempotent_request","message":"Same idempotency key used"}',
    { status: 409 }
  );

  await assert.doesNotReject(() => sendEmail({
    subject: 'TSL Daily — Test',
    html: '<p>ok</p>',
    idempotencyKey: 'tsl-digest/2026-05-14'
  }));
});
