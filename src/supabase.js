export async function saveDailyDigest({ digestDate, subject, html }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log('Supabase digest storage not configured — skipping history upsert');
    return;
  }

  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/daily_digests`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      digest_date: digestDate,
      subject,
      html
    })
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(`Supabase daily_digests upsert failed (${res.status}): ${body}`);
    return;
  }

  console.log(`Stored daily digest history for ${digestDate}`);
}

export async function fetchRecentDailyDigests({ beforeDate, limit = 5 } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.log('Supabase digest storage not configured — skipping history fetch');
    return [];
  }

  const params = new URLSearchParams({
    select: 'digest_date,subject,html',
    order: 'digest_date.desc',
    limit: String(limit)
  });

  if (beforeDate) {
    params.set('digest_date', `lt.${beforeDate}`);
  }

  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/daily_digests?${params}`;
  const res = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(`Supabase daily_digests history fetch failed (${res.status}): ${body}`);
    return [];
  }

  return res.json();
}
