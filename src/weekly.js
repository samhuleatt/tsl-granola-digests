import { fetchWeeksMeetings, filterTSLMeetings, fetchNoteDetail } from './granola.js';
import { generateLeadCandidates, generateWeeklyDigest } from './claude.js';
import { sendEmail } from './resend.js';
import { buildWeeklyPipelineContext, savePipelineSnapshot } from './leads.js';
import { formatDailyHeadingDate, formatDailyStorageDate, getDigestHour, getDigestWeekday, isWeeklyOperatingReviewSendWindow } from './time.js';

async function fetchTasks() {
  try {
    const res = await fetch(
      'https://api.github.com/repos/samhuleatt/the-side-letter/contents/TASKS.md',
      { headers: { 'Authorization': `Bearer ${process.env.GH_PAT}` } }
    );
    if (!res.ok) return null;
    const { content } = await res.json();
    return Buffer.from(content, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

async function main() {
  if (process.env.REQUIRE_DIGEST_WINDOW === 'true' && !isWeeklyOperatingReviewSendWindow()) {
    console.log(`Skipping weekly review because it is ${getDigestWeekday()} ${getDigestHour()}:00 ET, not Monday at 07:00 ET.`);
    return;
  }

  // 1. Fetch last 7 days of notes from Granola
  console.log('Fetching this week\'s meetings from Granola...');
  const allNotes = await fetchWeeksMeetings();
  console.log(`Fetched ${allNotes.length} notes total`);

  // 2. Filter to TSL-relevant
  const tslNotes = filterTSLMeetings(allNotes);
  console.log(`${tslNotes.length} TSL-relevant meetings`);

  // 3. Fetch TASKS.md (skip silently on failure)
  console.log('Fetching TASKS.md...');
  const tasks = await fetchTasks();
  if (!tasks) console.log('TASKS.md unavailable — continuing without it');

  // 4. Fetch full note detail for each TSL meeting
  const meetings = await Promise.all(
    tslNotes.map(async note => {
      try {
        return await fetchNoteDetail(note.id);
      } catch (err) {
        console.warn(`Failed to fetch detail for note ${note.id}: ${err.message}`);
        return note;
      }
    })
  );

  // 5. Read the live CRM and compare it with the last durable Postgres snapshot.
  // The weekly review fails closed if this source is unavailable: sending a
  // strategy memo with a missing BD section would create false confidence.
  console.log('Reading CRM Pipeline and prior snapshot...');
  const today = new Date();
  const pipeline = await buildWeeklyPipelineContext({ asOf: today });
  console.log(`CRM: ${pipeline.summary.total} records, ${pipeline.summary.overdueCount} overdue, ${pipeline.summary.unownedCount} unowned`);

  // 6. A separate, tightly scoped model pass proposes named leads from
  // Granola. Deterministic code then removes ungrounded names and any person
  // or firm already present in the CRM before the operating review sees them.
  console.log('Identifying new lead candidates from Granola...');
  const leadCandidates = await generateLeadCandidates({ meetings, crmRows: pipeline.rows });
  console.log(`Lead discovery: ${leadCandidates.length} new grounded candidates`);

  // 7. Generate the operating review.
  console.log('Generating weekly operating review with Claude...');
  const reviewDate = formatDailyHeadingDate(today);
  const heading = `Weekly Operating Review — ${reviewDate}`;
  const html = await generateWeeklyDigest({ meetings, tasks, pipeline, leadCandidates, rangeLabel: reviewDate });

  // 6. Build subject and send
  const subject = heading;
  console.log(`Subject: ${subject}`);

  if (process.env.SEND_DIGEST_EMAIL !== 'true') {
    console.log('Dry run complete; SEND_DIGEST_EMAIL is not true, so no email was sent.');
    return;
  }

  await sendEmail({ subject, html, idempotencyKey: `tsl-weekly-operating-review/${formatDailyStorageDate(today)}` });
  await savePipelineSnapshot({ rows: pipeline.rows, summary: pipeline.summary, capturedAt: today });
  console.log('Weekly operating review sent and CRM snapshot stored');
}

main().catch(err => {
  console.error('Weekly digest failed:', err);
  process.exit(1);
});
