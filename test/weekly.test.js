import assert from 'node:assert/strict';
import test from 'node:test';
import { generateWeeklyDigest, buildPriorDigestContext, generateDailyDigest, validateDailyDigestBody } from '../src/claude.js';
import { renderWeeklyBrief, stripRetiredGoal } from '../src/editorial.js';
import { selectHistoricalNotes, buildMemoryContext } from '../src/memory.js';

const meetings = [{ id: 'current', title: 'Sam / DZ', created_at: '2026-10-23T12:00:00-04:00', summary_markdown: 'Erik objected to the engagement rate. Separate ecosystem budget needs approval.' }];
const historical = [{ id: 'older', title: 'TSL strategy', created_at: '2026-09-10T12:00:00-04:00', summary_markdown: 'Existing a16z engagement bundles Cosign and ecosystem work.' }];
const point = {
  title: 'Which scope does the budget cover?',
  evidence: 'The older engagement bundled the work; the current discussion proposes a separate ecosystem budget.',
  inference: 'The pricing objection may reflect a scope or budget mismatch; these notes do not settle which.',
  nextStep: 'A useful question for the discussion: which budget would pay for the ecosystem work?',
  sources: [1, 2]
};

test('weekly brief compares current sources with historical memory and renders escaped text', async () => {
  const html = await generateWeeklyDigest({ meetings, historicalMeetings: historical, tasks: '', rangeLabel: 'October 24' }, async (system, user) => {
    assert.match(system, /Compare current evidence with that baseline/);
    assert.match(user, /a16z is already a paying customer/);
    assert.match(user, /Erik balked/);
    assert.match(user, /Source 2 \(historical\): TSL strategy \(September 10\)/);
    return JSON.stringify({ points: [{ ...point, title: '<script>bad</script>' }] });
  });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Read:/);
  assert.match(html, /September 10/);
});

test('weekly rejects unknown sources, history-only items, missing fields and overlong briefs', () => {
  const sources = [...meetings, ...historical];
  assert.throws(() => renderWeeklyBrief({ points: [{ ...point, sources: [3] }] }, sources, 1), /source numbers/);
  assert.throws(() => renderWeeklyBrief({ points: [{ ...point, sources: [2] }] }, sources, 1), /current evidence/);
  assert.throws(() => renderWeeklyBrief({ points: [{ ...point, inference: '' }] }, sources), /inference/);
  assert.throws(() => renderWeeklyBrief({ points: [point, point, point, point] }, sources), /zero to three/);
  assert.throws(() => renderWeeklyBrief({ points: [{ ...point, inference: 'word '.repeat(351) }] }, sources), /maximum is 350/);
});

test('weekly retries retired goals and malformed JSON, then accepts a valid brief', async () => {
  let calls = 0;
  const html = await generateWeeklyDigest({ meetings, historicalMeetings: historical, rangeLabel: 'October 24' }, async (_system, user) => {
    calls++;
    if (calls === 1) return 'not json';
    assert.match(user, /Previous draft failed validation/);
    if (calls === 2) return JSON.stringify({ points: [{ ...point, title: 'Path to First Paid Customer ($10K by May)' }] });
    return JSON.stringify({ points: [point] });
  });
  assert.equal(calls, 3);
  assert.match(html, /Which scope/);
});

test('weekly fails closed after invalid drafts and skips unsupported or empty briefs', async () => {
  let calls = 0;
  await assert.rejects(() => generateWeeklyDigest({ meetings, rangeLabel: 'Test' }, async () => {
    calls++; return JSON.stringify({ points: [{ ...point, sources: [99] }] });
  }), /after 3 attempts/);
  assert.equal(calls, 3);
  assert.equal(await generateWeeklyDigest({ meetings, rangeLabel: 'Test' }, async () => '{"points":[]}'), null);
  assert.equal(await generateWeeklyDigest({ meetings: [{ title: 'No summary' }], rangeLabel: 'Test' }, async () => { throw Error('must not call'); }), null);
});

test('retired goal cannot leak through daily rendering or prior generated history', async () => {
  const old = '<h2>SERVICES / GTM (David)</h2><p><strong>Goal:</strong> $10K in services revenue by end of May.</p><p>a16z is active.</p>';
  assert.doesNotMatch(stripRetiredGoal(old), /May/);
  assert.match(buildPriorDigestContext([{ html: old }]), /a16z is active/);
  assert.doesNotMatch(buildPriorDigestContext([{ html: old }]), /May/);
  assert.throws(() => validateDailyDigestBody(old), /retired/);
  const html = await generateDailyDigest({ meetings: [], tasks: '', heading: 'Test' });
  assert.doesNotMatch(html, /\$10K|May|first paid customer/i);
});

test('memory retrieval excludes current/future notes and preserves older months within budget', () => {
  const notes = Array.from({ length: 20 }, (_, i) => ({ id: `oct-${i}`, created_at: `2026-10-${String(i + 1).padStart(2, '0')}` }));
  notes.push({ id: 'january', created_at: '2026-01-01' }, { id: 'june', created_at: '2026-06-01' }, { id: 'bad', created_at: 'bad date' });
  const selected = selectHistoricalNotes(notes, { before: new Date('2026-10-20'), currentIds: ['oct-18'], limit: 15 });
  assert.equal(selected.length, 15);
  assert.ok(selected.some(note => note.id === 'january'));
  assert.ok(selected.some(note => note.id === 'june'));
  assert.ok(!selected.some(note => ['oct-18', 'oct-19', 'bad'].includes(note.id)));
  assert.equal(new Set(selected.map(note => note.id)).size, selected.length);
  assert.match(buildMemoryContext(historical), /Sam's direct correction/);
  assert.match(buildMemoryContext(historical), /September 10/);
});
