import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPriorDigestContext, hasDailyOperatingSource, sanitizeDigestSourceText, validateDailyDigestBody } from '../src/claude.js';

test('buildPriorDigestContext extracts prior Services state', () => {
  const context = buildPriorDigestContext([
    {
      digest_date: '2026-04-28',
      html: `
        <h2>PRODUCT (Sam)</h2>
        <p>LP Fund Discovery</p>
        <h2>SERVICES / GTM (David)</h2>
        <p><strong>Active Engagements</strong></p>
        <ul><li>Rajesh — waiting on first diligence package scope.</li></ul>
      `
    }
  ]);

  assert.match(context, /2026-04-28/);
  assert.match(context, /Rajesh/);
  assert.doesNotMatch(context, /LP Fund Discovery/);
});

test('buildPriorDigestContext does not recycle old digest formats', () => {
  const context = buildPriorDigestContext([
    {
      digest_date: '2026-03-23',
      html: '<h2>Meetings</h2><h2>Open Tasks</h2><p>Old daily digest format.</p>'
    }
  ]);

  assert.match(context, /No Services \/ GTM section captured/);
  assert.doesNotMatch(context, /Open Tasks/);
});

test('validateDailyDigestBody rejects old digest sections and engineering residue', () => {
  assert.throws(
    () => validateDailyDigestBody('<h2>PRODUCT (Sam)</h2><h2>SERVICES / GTM (David)</h2><h3>Open Tasks</h3>'),
    /old section/
  );

  assert.throws(
    () => validateDailyDigestBody('<h2>PRODUCT (Sam)</h2><h2>SERVICES / GTM (David)</h2><p>PR #123 changed src/daily.js.</p>'),
    /banned/
  );
});

test('validateDailyDigestBody accepts concise operating memo language', () => {
  assert.doesNotThrow(() => validateDailyDigestBody(`
    <h2>PRODUCT (Sam)</h2>
    <p><strong>LP Fund Discovery (65% complete)</strong> — LP lands and finds relevant funds fast via browse + search.</p>
    <p>In flight: List management UI so Sam can share TSL20 with David.</p>
    <p>Gap: No explicit gap.</p>
    <h2>SERVICES / GTM (David)</h2>
    <p>Rajesh — carry forward prior diligence package status; next step is scope confirmation.</p>
  `));
});

test('sanitizeDigestSourceText removes engineering residue before prompting', () => {
  const sanitized = sanitizeDigestSourceText(`
    Funds Page: list management UI so Sam can share TSL20 with David.
    PR #123 changed src/daily.js and /dashboard/funds.
    Refactor api/routes for lint cleanup.
  `);

  assert.match(sanitized, /TSL20/);
  assert.doesNotMatch(sanitized, /PR #123/);
  assert.doesNotMatch(sanitized, /src\/daily\.js/);
  assert.doesNotMatch(sanitized, /\/dashboard\/funds/);
  assert.doesNotMatch(sanitized, /lint cleanup/);
});

test('validateDailyDigestBody rejects the regressed technical digest style', () => {
  assert.throws(
    () => validateDailyDigestBody(`
      <h2>PRODUCT (Sam)</h2>
      <ul>
        <li><strong>Pitch Deck Triage (72% complete)</strong> — LP drops a deck, gets a structured oracle read with identity resolution, and the result enriches the fund record persistently.<br>In flight: T-Triage-2 shipped; next is canonical fields with manual locks.<br>Gap: Admin review queue is blocked.</li>
      </ul>
      <h2>SERVICES / GTM (David)</h2>
      <p>Rajesh — current status.</p>
    `),
    /banned/
  );

  assert.throws(
    () => validateDailyDigestBody(`
      <h2>PRODUCT (Sam)</h2>
      <ul>
        <li><strong>A (10% complete)</strong> — LP gets value.<br>In flight: One.</li>
        <li><strong>B (20% complete)</strong> — LP gets value.<br>In flight: Two.</li>
        <li><strong>C (30% complete)</strong> — LP gets value.<br>In flight: Three.</li>
        <li><strong>D (40% complete)</strong> — LP gets value.<br>In flight: Four.</li>
      </ul>
      <h2>SERVICES / GTM (David)</h2>
      <p>Rajesh — current status.</p>
    `),
    /max is 3/
  );

  assert.throws(
    () => validateDailyDigestBody(`
      <h2>PRODUCT (Sam)</h2>
      <p><strong>LP Fund Discovery (65% complete)</strong> — LP finds relevant funds fast.<br>In flight: List sharing.</p>
      <h2>SERVICES / GTM (David)</h2>
      <p>No prior Services / GTM state available. David to provide current engagement status.</p>
    `),
    /banned/
  );
});

test('hasDailyOperatingSource does not treat TASKS.md as primary source', () => {
  assert.equal(hasDailyOperatingSource({
    meetings: [],
    samUpdate: null,
    priorDigests: []
  }), false);

  assert.equal(hasDailyOperatingSource({
    meetings: [{ title: 'Sam / David' }],
    samUpdate: null,
    priorDigests: []
  }), true);

  assert.equal(hasDailyOperatingSource({
    meetings: [],
    samUpdate: null,
    priorDigests: [{ html: '<h2>PRODUCT (Sam)</h2><p>LP Fund Discovery.</p>' }]
  }), true);
});
