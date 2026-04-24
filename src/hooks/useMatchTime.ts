import { useState, useEffect, useMemo } from 'react';
import { differenceInMinutes, parse } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

// Legacy fallback — older/static match data was stored as "June 11, 2026"
// + "15:00" ET. New data from the API arrives as UTC ISO strings (match_date),
// which the hook prefers. The ET assumption only kicks in if the caller still
// passes the split date/time strings.
const MATCH_DATA_TIMEZONE = 'America/New_York';

interface MatchTimeResult {
  localDate: string;   // e.g. "Jun 11, 2026"
  localTime: string;   // e.g. "20:00 BST"  — includes a short TZ abbrev
  isLocked: boolean;
  minutesUntilLock: number;
  countdownText: string;
  matchDateTime: Date;
  urgency: 'normal' | 'warning' | 'critical';
}

const USER_TZ = typeof Intl !== 'undefined'
  ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  : 'UTC';

// Cached formatter instances — constructing these is the expensive bit, and
// match lists re-render on every tick so hot-path reuse matters.
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: USER_TZ,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
// `shortOffset` renders as "GMT+1", "GMT-4", "GMT+5:30" — unambiguous
// regardless of the user's locale. Browser-driven `short` output gives
// regional abbrevs like "BST"/"EDT"/"CEST", but also obscure ones like
// "WEST" (Western European Summer Time) that baffle most users.
const timeFormatter = new Intl.DateTimeFormat(undefined, {
  timeZone: USER_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZoneName: 'shortOffset',
});

/**
 * Accepts either:
 *  - an ISO-8601 UTC string (e.g. "2026-06-11T19:00:00Z") — preferred, from API
 *  - legacy date + time split ("June 11, 2026" + "15:00"), assumed ET
 * Returns a UTC Date object in both cases.
 */
function parseMatchDateTime(dateStr: string, timeStr?: string): Date {
  // ISO strings don't need time/TZ inference — Date parses them directly.
  if (!timeStr && /^\d{4}-\d{2}-\d{2}T/.test(dateStr)) {
    return new Date(dateStr);
  }
  const full = `${dateStr} ${timeStr ?? '00:00'}`;
  const parsed = parse(full, 'MMMM d, yyyy HH:mm', new Date());
  return fromZonedTime(parsed, MATCH_DATA_TIMEZONE);
}

function formatLocalParts(date: Date): { localDate: string; localTime: string } {
  return {
    localDate: dateFormatter.format(date),
    // timeFormatter gives something like "20:00 BST" — perfect shape for the UI.
    localTime: timeFormatter.format(date),
  };
}

function formatCountdown(minutesUntilLock: number): string {
  if (minutesUntilLock <= 0) return 'Locked';
  const days = Math.floor(minutesUntilLock / (60 * 24));
  const hours = Math.floor((minutesUntilLock % (60 * 24)) / 60);
  const minutes = minutesUntilLock % 60;
  if (days >= 1) return `${days}d`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Hook that renders a match's kick-off time in the user's local timezone
 * (with short TZ abbreviation), plus derives lock status + urgency for UI.
 *
 * Call shape #1 (preferred, API data):
 *   useMatchTime("2026-06-11T19:00:00Z")
 * Call shape #2 (legacy, static data):
 *   useMatchTime("June 11, 2026", "15:00")  // assumed ET
 */
export const useMatchTime = (dateStr: string, timeStr?: string): MatchTimeResult => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  return useMemo(() => {
    const matchDateTime = parseMatchDateTime(dateStr, timeStr);
    const minutesUntilStart = differenceInMinutes(matchDateTime, now);
    const minutesUntilLock = minutesUntilStart - 30; // lock 30 min before
    const isLocked = minutesUntilLock <= 0;

    const { localDate, localTime } = formatLocalParts(matchDateTime);
    const countdownText = formatCountdown(minutesUntilLock);

    const urgency: 'normal' | 'warning' | 'critical' =
      minutesUntilStart <= 45 ? 'critical'
        : minutesUntilStart <= 120 ? 'warning'
          : 'normal';

    return { localDate, localTime, isLocked, minutesUntilLock, countdownText, matchDateTime, urgency };
  }, [dateStr, timeStr, now]);
};

export const isMatchLocked = (dateStr: string, timeStr: string | undefined, status: string): boolean => {
  if (status === 'live' || status === 'finished') return true;
  const matchDateTime = parseMatchDateTime(dateStr, timeStr);
  return differenceInMinutes(matchDateTime, new Date()) <= 30;
};

export const getEffectiveMatchStatus = (
  dateStr: string,
  timeStr: string | undefined,
  status: string
): string => {
  if (status === 'finished') return status;
  const matchDateTime = parseMatchDateTime(dateStr, timeStr);
  const minutesSinceStart = differenceInMinutes(new Date(), matchDateTime);
  if (minutesSinceStart >= 180) return 'finished';
  if (minutesSinceStart > 0 && status === 'upcoming') return 'live';
  return status;
};
