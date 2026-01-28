import { useState, useEffect, useMemo } from 'react';
import { parse, format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

// All match times in the data are stored in ET (Eastern Time)
// This is the standard reference timezone used by FIFA for World Cup 2026
const MATCH_DATA_TIMEZONE = 'America/New_York';

interface MatchTimeResult {
  localDate: string;
  localTime: string;
  isLocked: boolean;
  minutesUntilLock: number;
  countdownText: string;
  matchDateTime: Date;
  urgency: 'normal' | 'warning' | 'critical';
}

/**
 * Parse a match date and time string into a UTC Date object
 * All match times are stored in ET (Eastern Time)
 */
const parseMatchDateTime = (dateStr: string, timeStr: string): Date => {
  // Parse "June 11, 2026" and "15:00" format
  const fullDateTimeStr = `${dateStr} ${timeStr}`;
  
  // Parse the date string
  const parsed = parse(fullDateTimeStr, 'MMMM d, yyyy HH:mm', new Date());
  
  // Convert from ET to UTC
  const utcDate = fromZonedTime(parsed, MATCH_DATA_TIMEZONE);
  
  return utcDate;
};

/**
 * Format countdown text based on minutes remaining
 */
const formatCountdown = (minutesUntilLock: number): string => {
  if (minutesUntilLock <= 0) {
    return 'Locked';
  }
  
  const days = Math.floor(minutesUntilLock / (60 * 24));
  const hours = Math.floor((minutesUntilLock % (60 * 24)) / 60);
  const minutes = minutesUntilLock % 60;
  
  // If more than 24 hours, just show days
  if (days >= 1) {
    return `${days}d`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

/**
 * Hook to calculate match time information including local time display and lock status
 */
export const useMatchTime = (dateStr: string, timeStr: string): MatchTimeResult => {
  const [now, setNow] = useState(new Date());
  
  // Update the current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);
  
  return useMemo(() => {
    const matchDateTime = parseMatchDateTime(dateStr, timeStr);
    
    // Calculate minutes until match starts (lock is 30 min before)
    const minutesUntilStart = differenceInMinutes(matchDateTime, now);
    const minutesUntilLock = minutesUntilStart - 30; // Lock 30 minutes before
    
    // Lock predictions 30 minutes before match starts
    const isLocked = minutesUntilLock <= 0;
    
    // Format for user's local timezone
    const localDate = format(matchDateTime, 'MMM d, yyyy');
    const localTime = format(matchDateTime, 'HH:mm');
    
    // Generate countdown text
    const countdownText = formatCountdown(minutesUntilLock);
    
    // Determine urgency level for styling based on time until KICKOFF (not lock)
    // - critical (red): within 45 minutes of kickoff
    // - warning (orange): within 2 hours of kickoff
    // - normal: more than 2 hours until kickoff
    const urgency: 'normal' | 'warning' | 'critical' = 
      minutesUntilStart <= 45 ? 'critical' : 
      minutesUntilStart <= 120 ? 'warning' : 
      'normal';
    
    return {
      localDate,
      localTime,
      isLocked,
      minutesUntilLock,
      countdownText,
      matchDateTime,
      urgency,
    };
  }, [dateStr, timeStr, now]);
};

/**
 * Check if a match is locked (within 30 minutes of start or already started/finished)
 */
export const isMatchLocked = (dateStr: string, timeStr: string, status: string): boolean => {
  if (status === 'live' || status === 'finished') {
    return true;
  }
  
  const matchDateTime = parseMatchDateTime(dateStr, timeStr);
  const now = new Date();
  const minutesUntilStart = differenceInMinutes(matchDateTime, now);
  
  return minutesUntilStart <= 30;
};

/**
 * Get the effective match status, accounting for matches that should have ended
 * If a match is marked as 'live' but started more than 3 hours ago, treat it as 'finished'
 */
export const getEffectiveMatchStatus = (dateStr: string, timeStr: string, status: string): string => {
  // Already finished stays finished
  if (status === 'finished') {
    return status;
  }
  
  const matchDateTime = parseMatchDateTime(dateStr, timeStr);
  const now = new Date();
  const minutesSinceStart = differenceInMinutes(now, matchDateTime);
  
  // If match started more than 3 hours ago, it should be finished
  // This applies to both 'live' and 'upcoming' matches that were never updated
  if (minutesSinceStart >= 180) {
    return 'finished';
  }
  
  // If match has actually started (kickoff time passed) but less than 3 hours ago, treat as live
  // Use > 0 instead of >= 0 to ensure match has truly started
  if (minutesSinceStart > 0 && status === 'upcoming') {
    return 'live';
  }
  
  return status;
};
