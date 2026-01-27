import { useState, useEffect, useMemo } from 'react';
import { parse, format, differenceInMinutes, differenceInHours, differenceInDays } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';

// Map of venue cities to their IANA timezone
const cityTimezones: Record<string, string> = {
  // US Eastern Time
  'New York': 'America/New_York',
  'Miami': 'America/New_York',
  'Atlanta': 'America/New_York',
  'Philadelphia': 'America/New_York',
  'Boston': 'America/New_York',
  // US Central Time
  'Houston': 'America/Chicago',
  'Dallas': 'America/Chicago',
  'Kansas City': 'America/Chicago',
  // US Pacific Time
  'Los Angeles': 'America/Los_Angeles',
  'San Francisco': 'America/Los_Angeles',
  'Seattle': 'America/Los_Angeles',
  // Canada
  'Vancouver': 'America/Vancouver',
  'Toronto': 'America/Toronto',
  // Mexico
  'Mexico City': 'America/Mexico_City',
  'Guadalajara': 'America/Mexico_City',
};

interface MatchTimeResult {
  localDate: string;
  localTime: string;
  isLocked: boolean;
  minutesUntilLock: number;
  countdownText: string;
  matchDateTime: Date;
}

/**
 * Parse a match date and time string into a UTC Date object
 * Takes venue city to determine the source timezone
 */
const parseMatchDateTime = (dateStr: string, timeStr: string, city: string): Date => {
  // Parse "June 11, 2026" and "12:00" format
  const fullDateTimeStr = `${dateStr} ${timeStr}`;
  
  // Parse the date in the venue's local timezone
  const parsed = parse(fullDateTimeStr, 'MMMM d, yyyy HH:mm', new Date());
  
  // Get the timezone for this city (default to ET if not found)
  const venueTimezone = cityTimezones[city] || 'America/New_York';
  
  // Convert from venue local time to UTC
  const utcDate = fromZonedTime(parsed, venueTimezone);
  
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
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

/**
 * Hook to calculate match time information including local time display and lock status
 */
export const useMatchTime = (dateStr: string, timeStr: string, city: string): MatchTimeResult => {
  const [now, setNow] = useState(new Date());
  
  // Update the current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);
  
  return useMemo(() => {
    const matchDateTime = parseMatchDateTime(dateStr, timeStr, city);
    
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
    
    return {
      localDate,
      localTime,
      isLocked,
      minutesUntilLock,
      countdownText,
      matchDateTime,
    };
  }, [dateStr, timeStr, city, now]);
};

/**
 * Check if a match is locked (within 30 minutes of start or already started/finished)
 */
export const isMatchLocked = (dateStr: string, timeStr: string, city: string, status: string): boolean => {
  if (status === 'live' || status === 'finished') {
    return true;
  }
  
  const matchDateTime = parseMatchDateTime(dateStr, timeStr, city);
  const now = new Date();
  const minutesUntilStart = differenceInMinutes(matchDateTime, now);
  
  return minutesUntilStart <= 30;
};
