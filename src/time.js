export const DIGEST_TIME_ZONE = 'America/New_York';

function formatInTimeZone(date, options) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: DIGEST_TIME_ZONE,
    ...options
  }).format(date);
}

function getTimeZoneOffset(date = new Date()) {
  const timeZoneName = new Intl.DateTimeFormat('en-US', {
    timeZone: DIGEST_TIME_ZONE,
    timeZoneName: 'shortOffset'
  })
    .formatToParts(date)
    .find(part => part.type === 'timeZoneName')?.value;

  const match = timeZoneName?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) return '-05:00';

  const [, sign, hour, minute = '00'] = match;
  return `${sign}${hour.padStart(2, '0')}:${minute}`;
}

export function getDigestWeekday(date = new Date()) {
  return formatInTimeZone(date, { weekday: 'long' });
}

export function isDigestMonday(date = new Date()) {
  return getDigestWeekday(date) === 'Monday';
}

export function getDigestHour(date = new Date()) {
  return Number(formatInTimeZone(date, {
    hour: 'numeric',
    hour12: false
  }));
}

export function isDigestSendHour(date = new Date()) {
  return getDigestHour(date) === 21;
}

export function getStartOfToday(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DIGEST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00${getTimeZoneOffset(date)}`);
}

export function formatDailyHeadingDate(date = new Date()) {
  return formatInTimeZone(date, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

export function formatDailySubjectDate(date = new Date()) {
  return formatInTimeZone(date, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  });
}

export function formatDailyStorageDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DIGEST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function formatShortDigestDate(date) {
  return formatInTimeZone(date, {
    month: 'long',
    day: 'numeric'
  });
}

export function getNextDigestSaturday(date = new Date()) {
  const weekdayOrder = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6
  };

  const weekday = getDigestWeekday(date);
  const currentDay = weekdayOrder[weekday];
  const daysUntilSaturday = (6 - currentDay + 7) % 7;
  return new Date(date.getTime() + daysUntilSaturday * 24 * 60 * 60 * 1000);
}

export function formatWeekendRoundupDate(date = new Date()) {
  return formatDailyHeadingDate(getNextDigestSaturday(date));
}

export function buildMeetingSourceLine(meetings) {
  if (!meetings.length) {
    return 'Sources: No TSL meetings in this window.';
  }

  const items = meetings.map(meeting => {
    const label = formatMeetingSourceItem(meeting);
    return label;
  });

  return `Sources: ${items.join(' | ')}`;
}

function formatMeetingSourceItem(meeting) {
  const title = meeting.title || 'Untitled meeting';
  const dateValue =
    meeting.meeting_start_at ||
    meeting.started_at ||
    meeting.start_time ||
    meeting.created_at ||
    meeting.createdAt ||
    meeting.date;

  if (!dateValue) {
    return title;
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return title;
  }

  return `${title} (${formatShortDigestDate(parsed)})`;
}
