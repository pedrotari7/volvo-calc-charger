const hm = new Intl.DateTimeFormat('sv-SE', {
	timeZone: 'Europe/Stockholm',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23',
});

// Local HH:MM in Europe/Stockholm.
export const formatLocalTime = (iso: string): string => hm.format(new Date(iso));
