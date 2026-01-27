import { useMemo } from 'react';
import { parse, format, differenceInMinutes, isBefore } from 'date-fns';

interface MatchTimeResult {
  localDate: string;
  localTime: string;
  isLocked: boolean;
  minutesUntilStart: number;
}

/**
 * Parse a match date and time string into a Date object
 * Assumes times are in Eastern Time (ET) for US venues
 */
const parseMatchDateTime = (dateStr: string, timeStr: string): Date => {
  // Parse "June 11, 2026" and "12:00" format
  const fullDateTimeStr = `${dateStr} ${timeStr}`;
  
  // Parse the date - assuming ET timezone for the tournament
  const parsed = parse(fullDateTimeStr, 'MMMM d, yyyy HH:mm', new Date());
  
  // The times in the data are in local venue time (ET for most US venues)
  // For now, we treat them as ET and convert to user's local time
  // In a real app, you'd want to store UTC times or include timezone info
  return parsed;
};

/**
 * Hook to calculate match time information including local time display and lock status
 */
export const useMatchTime = (dateStr: string, timeStr: string): MatchTimeResult => {
  return useMemo(() => {
    const matchDateTime = parseMatchDateTime(dateStr, timeStr);
    const now = new Date();
    
    // Calculate minutes until match starts
    const minutesUntilStart = differenceInMinutes(matchDateTime, now);
    
    // Lock predictions 30 minutes before match starts
    const isLocked = minutesUntilStart <= 30;
    
    // Format for user's local timezone
    const localDate = format(matchDateTime, 'MMM d, yyyy');
    const localTime = format(matchDateTime, 'HH:mm');
    
    return {
      localDate,
      localTime,
      isLocked,
      minutesUntilStart,
    };
  }, [dateStr, timeStr]);
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
