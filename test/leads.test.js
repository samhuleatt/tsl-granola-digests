import assert from 'node:assert/strict';
import test from 'node:test';
import { comparePipeline, rowsFromValues, summarizePipeline } from '../src/leads.js';

const headers = ['Contact', 'Entity', 'Email', 'Relationship', 'Product', 'Stage', 'Owner', 'Last Touch', 'Next Action', 'Due Date'];

test('pipeline summary exposes operating pressure and priority accounts', () => {
  const rows = rowsFromValues([
    headers,
    ['Sam Buyer', 'Close Co', 'sam@close.co', 'Active/Warm', 'Allocator Services', 'Proposal/Pilot', 'Sam', '2026-08-10', 'Send contract', '2026-08-11'],
    ['New Buyer', 'Fresh Co', 'new@fresh.co', 'Cold', 'Allocator Services', 'New', '', '', 'Respond', '2026-08-20'],
    ['Lost Buyer', 'Lost Co', 'lost@lost.co', 'Cold', 'Allocator Services', 'Lost', 'David', '', '', '2026-08-01']
  ]);

  const summary = summarizePipeline(rows, { asOf: new Date('2026-08-12T12:00:00-04:00') });
  assert.equal(summary.total, 3);
  assert.equal(summary.active, 2);
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.unownedCount, 1);
  assert.equal(summary.touchedThisWeekCount, 1);
  assert.equal(summary.priorityAccounts[0].entity, 'Close Co');
});

test('pipeline comparison reports only evidence-backed stage movement', () => {
  const previous = rowsFromValues([
    headers,
    ['Sam Buyer', 'Close Co', 'sam@close.co', 'Active/Warm', 'Allocator Services', 'Meeting', 'Sam', '', 'Send proposal', '']
  ]);
  const current = rowsFromValues([
    headers,
    ['Sam Buyer', 'Close Co', 'sam@close.co', 'Active/Warm', 'Allocator Services', 'Proposal/Pilot', 'Sam', '', 'Send contract', ''],
    ['New Buyer', 'Fresh Co', 'new@fresh.co', 'Cold', 'Allocator Services', 'New', 'David', '', 'Respond', '']
  ]);

  const changes = comparePipeline(current, previous);
  assert.equal(changes.baseline, false);
  assert.deepEqual(changes.stageChanges.map(change => [change.entity, change.from, change.to]), [
    ['Close Co', 'Meeting', 'Proposal/Pilot']
  ]);
  assert.deepEqual(changes.newRecords.map(record => record.entity), ['Fresh Co']);
});

test('first snapshot is marked as a baseline instead of fabricating deltas', () => {
  const current = rowsFromValues([headers, ['Buyer', 'Co', 'buyer@co.com', 'Cold', 'Both', 'New', '', '', '', '']]);
  assert.deepEqual(comparePipeline(current), {
    baseline: true,
    newRecords: [],
    stageChanges: [],
    removedRecords: []
  });
});
