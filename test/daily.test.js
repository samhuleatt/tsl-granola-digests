import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPriorDigestContext, sanitizeDigestSourceText, validateDailyDigestBody } from '../src/claude.js';

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
