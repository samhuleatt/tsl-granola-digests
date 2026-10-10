import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatDailyStorageDate,
  getDailyDigestDay,
  isDailyDigestSendWindow,
  isWeekendDigestSendWindow
} from '../src/time.js';

function digestDate(utc) {
  const day = getDailyDigestDay(new Date(utc));
  return day && formatDailyStorageDate(day);
}

test('daily digest window opens at 9pm Eastern on weekdays across DST', () => {
  assert.equal(digestDate('2026-05-12T01:00:00Z'), '2026-05-11');
  assert.equal(digestDate('2026-01-06T02:00:00Z'), '2026-01-05');
  assert.equal(digestDate('2026-05-12T02:00:00Z'), '2026-05-11');

  assert.equal(isDailyDigestSendWindow(new Date('2026-05-10T01:00:00Z')), false);
  assert.equal(isDailyDigestSendWindow(new Date('2026-05-12T17:00:00Z')), false);
});

test('late scheduled runs before noon Eastern count for the evening before', () => {
  // GitHub started Friday's run at 2:29am ET Saturday; it used to be skipped.
  assert.equal(digestDate('2026-10-10T06:28:56Z'), '2026-10-09');
  assert.equal(digestDate('2026-01-06T15:59:00Z'), '2026-01-05');
  assert.equal(digestDate('2026-10-13T04:30:00Z'), '2026-10-12');

  // Sunday evening is not a digest day, so Monday morning runs skip.
  assert.equal(digestDate('2026-10-12T06:00:00Z'), null);
  assert.equal(digestDate('2026-10-10T16:30:00Z'), null);
});

test('weekend digest window is Saturday from 9am Eastern across DST', () => {
  assert.equal(isWeekendDigestSendWindow(new Date('2026-05-16T13:00:00Z')), true);
  assert.equal(isWeekendDigestSendWindow(new Date('2026-01-10T14:00:00Z')), true);
  assert.equal(isWeekendDigestSendWindow(new Date('2026-10-10T17:33:22Z')), true);

  assert.equal(isWeekendDigestSendWindow(new Date('2026-05-16T12:00:00Z')), false);
  assert.equal(isWeekendDigestSendWindow(new Date('2026-05-17T13:00:00Z')), false);
});
