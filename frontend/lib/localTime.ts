const TZ = 'Europe/Stockholm';

const hm = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const day = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const month = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });

// Local HH:MM in Europe/Stockholm.
export const formatLocalTime = (iso: string): string => hm.format(new Date(iso));

// Local day as "Tue 3 Nov".
export const formatDay = (iso: string): string => day.format(new Date(iso)).replace(',', '');

// "2026-11" as "November 2026".
export const formatMonth = (key: string): string => month.format(new Date(`${key}-01T12:00:00Z`));
