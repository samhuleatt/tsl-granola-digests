import assert from 'node:assert/strict';
import test from 'node:test';
import { filterNewLeadCandidates } from '../src/claude.js';

const meetings = [{
  title: 'Allocator strategy with Jane Doe',
  summary_markdown: 'Jane Doe suggested that Northstar Foundation needs better emerging-manager discovery. Alex offered to introduce us.'
}];

test('lead discovery keeps grounded prospects absent from CRM', () => {
  const result = filterNewLeadCandidates({
    meetings,
    crmRows: [],
    candidates: [{
      person: 'Jane Doe',
      firm: 'Northstar Foundation',
      likelyRole: 'Potential buyer',
      whyFit: 'Needs emerging-manager discovery',
      sourceMeeting: 'Allocator strategy with Jane Doe',
      warmPath: 'Alex',
      outreachThesis: 'Show the Discovery workflow'
    }]
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].firm, 'Northstar Foundation');
});

test('lead discovery removes existing CRM records and invented names', () => {
  const result = filterNewLeadCandidates({
    meetings,
    crmRows: [{ Contact: 'Jane Doe', Entity: 'Northstar Foundation' }],
    candidates: [
      { person: 'Jane Doe', firm: 'Northstar Foundation' },
      { person: 'Invented Person', firm: 'Imaginary Capital' }
    ]
  });
  assert.deepEqual(result, []);
});
