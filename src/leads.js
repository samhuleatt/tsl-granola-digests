import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';

const DEFAULT_SPREADSHEET_ID = '1blCZAQgG1Q3FbrAh1-XH9tKTQHEmFmHLkJBU56hHUXs';
const DEFAULT_RANGE = "'CRM Pipeline'!A:P";
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function countBy(rows, field) {
  return Object.fromEntries(
    [...rows.reduce((counts, row) => {
      const value = clean(row[field]) || '(blank)';
      counts.set(value, (counts.get(value) || 0) + 1);
      return counts;
    }, new Map())].sort((a, b) => b[1] - a[1])
  );
}

function parseDate(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(`${text}T12:00:00-04:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rowKey(row) {
  const email = clean(row.Email).toLowerCase();
  if (email) return `email:${email}`;
  return `name:${clean(row.Contact).toLowerCase()}|${clean(row.Entity).toLowerCase()}`;
}

export function rowsFromValues(values = []) {
  const [headers = [], ...body] = values;
  return body
    .filter(cells => cells.some(cell => clean(cell)))
    .map(cells => Object.fromEntries(headers.map((header, index) => [clean(header), clean(cells[index])])));
}

export function summarizePipeline(rows, { asOf = new Date() } = {}) {
  const activeRows = rows.filter(row => clean(row.Stage).toLowerCase() !== 'lost');
  const sevenDaysAgo = new Date(asOf.getTime() - 7 * 24 * 60 * 60 * 1000);
  const overdue = activeRows.filter(row => {
    const due = parseDate(row['Due Date']);
    return due && due < asOf;
  });
  const touchedThisWeek = activeRows.filter(row => {
    const touched = parseDate(row['Last Touch']);
    return touched && touched >= sevenDaysAgo && touched <= asOf;
  });
  const priorityRows = activeRows
    .filter(row => ['Proposal/Pilot', 'Meeting', 'Replied'].includes(clean(row.Stage)))
    .sort((a, b) => {
      const relationship = value => clean(value.Relationship) === 'Active/Warm' ? 0 : 1;
      return relationship(a) - relationship(b) || clean(a.Entity).localeCompare(clean(b.Entity));
    });

  return {
    total: rows.length,
    active: activeRows.length,
    byStage: countBy(rows, 'Stage'),
    byOwner: countBy(rows, 'Owner'),
    byProduct: countBy(rows, 'Product'),
    overdueCount: overdue.length,
    unownedCount: activeRows.filter(row => !clean(row.Owner)).length,
    missingNextActionCount: activeRows.filter(row => !clean(row['Next Action'])).length,
    touchedThisWeekCount: touchedThisWeek.length,
    priorityAccounts: priorityRows.slice(0, 15).map(row => ({
      contact: clean(row.Contact),
      entity: clean(row.Entity),
      product: clean(row.Product),
      stage: clean(row.Stage),
      owner: clean(row.Owner) || 'Unowned',
      nextAction: clean(row['Next Action']) || 'No next action',
      dueDate: clean(row['Due Date']) || null,
      notes: clean(row['Granola Notes']) || clean(row.Notes) || null
    })),
    overdueActions: overdue.slice(0, 20).map(row => ({
      contact: clean(row.Contact),
      entity: clean(row.Entity),
      stage: clean(row.Stage),
      owner: clean(row.Owner) || 'Unowned',
      nextAction: clean(row['Next Action']) || 'No next action',
      dueDate: clean(row['Due Date'])
    })),
    touchedThisWeek: touchedThisWeek.slice(0, 20).map(row => ({
      contact: clean(row.Contact),
      entity: clean(row.Entity),
      stage: clean(row.Stage),
      owner: clean(row.Owner) || 'Unowned',
      lastTouch: clean(row['Last Touch']),
      nextAction: clean(row['Next Action']) || 'No next action'
    }))
  };
}

export function comparePipeline(currentRows, previousRows = []) {
  if (!previousRows.length) {
    return { baseline: true, newRecords: [], stageChanges: [], removedRecords: [] };
  }

  const current = new Map(currentRows.map(row => [rowKey(row), row]));
  const previous = new Map(previousRows.map(row => [rowKey(row), row]));
  const record = row => ({
    contact: clean(row.Contact),
    entity: clean(row.Entity),
    owner: clean(row.Owner) || 'Unowned',
    stage: clean(row.Stage),
    nextAction: clean(row['Next Action']) || 'No next action'
  });

  const newRecords = [...current]
    .filter(([key]) => !previous.has(key))
    .map(([, row]) => record(row));
  const removedRecords = [...previous]
    .filter(([key]) => !current.has(key))
    .map(([, row]) => record(row));
  const stageChanges = [...current]
    .filter(([key, row]) => previous.has(key) && clean(previous.get(key).Stage) !== clean(row.Stage))
    .map(([key, row]) => ({
      ...record(row),
      from: clean(previous.get(key).Stage),
      to: clean(row.Stage)
    }));

  return { baseline: false, newRecords, stageChanges, removedRecords };
}

function parseCredentials(raw) {
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is required for the weekly CRM read.');
  try {
    const credentials = JSON.parse(raw);
    if (!credentials.client_email || !credentials.private_key) throw new Error('missing client_email/private_key');
    return credentials;
  } catch (error) {
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is invalid: ${error.message}`);
  }
}

export async function fetchCrmPipeline() {
  const spreadsheetId = process.env.CRM_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const range = process.env.CRM_PIPELINE_RANGE || DEFAULT_RANGE;
  const auth = new GoogleAuth({
    credentials: parseCredentials(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: [SHEETS_SCOPE]
  });
  const client = await auth.getClient();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const headers = await client.getRequestHeaders(url);
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Google Sheets CRM read failed (${response.status}): ${await response.text()}`);
  const payload = await response.json();
  const rows = rowsFromValues(payload.values || []);
  if (!rows.length) throw new Error('Google Sheets CRM read returned no pipeline rows.');
  return rows;
}

function supabaseConfig() {
  const url = clean(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for weekly CRM memory.');
  return { url: url.replace(/\/$/, ''), key };
}

export async function fetchPreviousPipelineSnapshot() {
  const { url, key } = supabaseConfig();
  const endpoint = `${url}/rest/v1/crm_pipeline_snapshots?select=captured_at,rows,summary&order=captured_at.desc&limit=1`;
  const response = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error(`Previous CRM snapshot read failed (${response.status}): ${await response.text()}`);
  const [snapshot] = await response.json();
  return snapshot || null;
}

export async function savePipelineSnapshot({ rows, summary, capturedAt = new Date() }) {
  const { url, key } = supabaseConfig();
  const fingerprint = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const response = await fetch(`${url}/rest/v1/crm_pipeline_snapshots?on_conflict=fingerprint`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      captured_at: capturedAt.toISOString(),
      source_spreadsheet_id: process.env.CRM_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID,
      source_sheet_name: 'CRM Pipeline',
      row_count: rows.length,
      fingerprint,
      rows,
      summary
    })
  });
  if (!response.ok) throw new Error(`CRM snapshot write failed (${response.status}): ${await response.text()}`);
}

export async function buildWeeklyPipelineContext({ asOf = new Date() } = {}) {
  const rows = await fetchCrmPipeline();
  const previous = await fetchPreviousPipelineSnapshot();
  const summary = summarizePipeline(rows, { asOf });
  const changes = comparePipeline(rows, previous?.rows || []);
  return { rows, summary, changes, previousCapturedAt: previous?.captured_at || null };
}
