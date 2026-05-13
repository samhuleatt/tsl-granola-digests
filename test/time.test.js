import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDailyDigestSendWindow,
  isWeekendDigestSendWindow
} from '../src/time.js';

test('daily digest window is Monday-Friday at 9pm Eastern across DST', () => {
  assert.equal(isDailyDigestSendWindow(new Date('2026-05-12T01:00:00Z')), true);
  assert.equal(isDailyDigestSendWindow(new Date('2026-01-06T02:00:00Z')), true);

  assert.equal(isDailyDigestSendWindow(new Date('2026-05-12T02:00:00Z')), false);
  assert.equal(isDailyDigestSendWindow(new Date('2026-05-10T01:00:00Z')), false);
});

test('weekend digest window is Saturday at 9am Eastern across DST', () => {
  assert.equal(isWeekendDigestSendWindow(new Date('2026-05-16T13:00:00Z')), true);
  assert.equal(isWeekendDigestSendWindow(new Date('2026-01-10T14:00:00Z')), true);

  assert.equal(isWeekendDigestSendWindow(new Date('2026-05-16T14:00:00Z')), false);
  assert.equal(isWeekendDigestSendWindow(new Date('2026-05-17T13:00:00Z')), false);
});
