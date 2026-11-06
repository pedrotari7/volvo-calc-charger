import * as stylex from '@stylexjs/stylex';

// Permanently dark: one palette. Components reference these names, never hex.
export const colors = stylex.defineVars({
	canvas: '#07080a',
	surface: '#0f1115',
	raised: '#171a20',
	line: '#262b34',

	ink: '#f3f5f8',
	muted: '#98a1b1',
	faint: '#626b7a',

	brand: '#3ddc84',
	brandStrong: '#1db954',
	brandDeep: '#0b3d22',

	good: '#34d399',
	bad: '#fb7185',
	warn: '#fbbf24',
	info: '#60a5fa',
});

// Palette at partial strength; inlined, no extra CSS variables.
export const tint = stylex.defineConsts({
	white5: 'rgb(255 255 255 / 0.05)',
	white8: 'rgb(255 255 255 / 0.08)',
	white12: 'rgb(255 255 255 / 0.12)',
	brand15: `color-mix(in srgb, ${colors.brand} 15%, transparent)`,
	brand30: `color-mix(in srgb, ${colors.brand} 30%, transparent)`,
	bad15: `color-mix(in srgb, ${colors.bad} 15%, transparent)`,
	canvas80: `color-mix(in srgb, ${colors.canvas} 80%, transparent)`,
});

export const fonts = stylex.defineVars({
	sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
});
