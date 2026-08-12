import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDailyDigestSendWindow,
  isWeeklyOperatingReviewSendWindow,
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

test('weekly operating review window is Monday at 7am Eastern across DST', () => {
  assert.equal(isWeeklyOperatingReviewSendWindow(new Date('2026-05-18T11:00:00Z')), true);
  assert.equal(isWeeklyOperatingReviewSendWindow(new Date('2026-01-12T12:00:00Z')), true);

  assert.equal(isWeeklyOperatingReviewSendWindow(new Date('2026-05-18T12:00:00Z')), false);
  assert.equal(isWeeklyOperatingReviewSendWindow(new Date('2026-05-17T11:00:00Z')), false);
});
