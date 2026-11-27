import type { SVGProps } from 'react';

// SF-Symbols-flavoured line icons on a 24px grid. Decorative by default.
const PATHS = {
	bolt: 'M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12L13 2Z',
	car: 'M5 16.5h14M6.5 16.5V19M17.5 16.5V19M4 16.5v-3.2c0-.5.1-1 .4-1.4L6.6 8a2 2 0 0 1 1.7-1h7.4a2 2 0 0 1 1.7 1l2.2 3.9c.3.4.4.9.4 1.4v3.2M7.5 13.5h.01M16.5 13.5h.01M5 11.5h14',
	clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
	gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
	chevronRight: 'm9 5 7 7-7 7',
	chevronLeft: 'm15 5-7 7 7 7',
	lock: 'M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-7A1.5 1.5 0 0 1 6.5 11ZM8 11V7.5a4 4 0 0 1 8 0V11',
	fan: 'M12 12c0-3.5 1-7 4-7 2 0 2.5 2.5.5 4.5S12 12 12 12Zm0 0c3.5 0 7 1 7 4 0 2-2.5 2.5-4.5.5S12 12 12 12Zm0 0c0 3.5-1 7-4 7-2 0-2.5-2.5-.5-4.5S12 12 12 12Zm0 0c-3.5 0-7-1-7-4 0-2 2.5-2.5 4.5-.5S12 12 12 12Z',
	power: 'M12 3v8M7 5.8a8 8 0 1 0 10 0',
	warning: 'M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01',
	moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
	plug: 'M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0V8ZM12 16.5V21',
	check: 'm5 12.5 4.5 4.5L19 7.5',
	map: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
	plus: 'M12 5v14M5 12h14',
	horn: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4v-5ZM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11',
	flash: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2.5v2M12 19.5v2M4.5 4.5l1.4 1.4M18.1 18.1l1.4 1.4M2.5 12h2M19.5 12h2M4.5 19.5l1.4-1.4M18.1 5.9l1.4-1.4',
	locate: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 12h.01',
	shield: 'M12 3 5 6v5.5c0 4.4 3 8 7 9.5 4-1.5 7-5.1 7-9.5V6l-7-3Z',
} as const;

export type IconName = keyof typeof PATHS;

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
	name: IconName;
	size?: number;
	filled?: boolean;
}

export const Icon = ({ name, size = 24, filled = false, strokeWidth = 1.8, ...rest }: Props) => (
	<svg
		width={size}
		height={size}
		viewBox='0 0 24 24'
		fill={filled ? 'currentColor' : 'none'}
		stroke='currentColor'
		strokeWidth={strokeWidth}
		strokeLinecap='round'
		strokeLinejoin='round'
		aria-hidden='true'
		focusable='false'
		{...rest}
	>
		<path d={PATHS[name]} />
	</svg>
);
