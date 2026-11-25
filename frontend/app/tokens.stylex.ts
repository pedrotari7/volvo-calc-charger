import * as stylex from '@stylexjs/stylex';

// Permanently dark, modelled on the iOS dark "grouped" palette so the
// installed PWA sits naturally next to native apps. Components reference
// these names, never hex.
export const colors = stylex.defineVars({
	canvas: '#000000',
	surface: '#1c1c1e',
	raised: '#2c2c2e',
	line: 'rgb(84 84 88 / 0.6)',

	ink: '#ffffff',
	muted: 'rgb(235 235 245 / 0.6)',
	faint: 'rgb(235 235 245 / 0.3)',

	brand: '#30d158',
	brandStrong: '#28b84c',
	brandDeep: '#0b3d22',

	good: '#30d158',
	bad: '#ff453a',
	warn: '#ff9f0a',
	info: '#0a84ff',
});

// Palette at partial strength; inlined, no extra CSS variables.
export const tint = stylex.defineConsts({
	white5: 'rgb(255 255 255 / 0.05)',
	white8: 'rgb(255 255 255 / 0.08)',
	white12: 'rgb(255 255 255 / 0.12)',
	fill: 'rgb(118 118 128 / 0.24)',
	pressed: 'rgb(255 255 255 / 0.1)',
	brand15: `color-mix(in srgb, ${colors.brand} 15%, transparent)`,
	brand30: `color-mix(in srgb, ${colors.brand} 30%, transparent)`,
	bad15: `color-mix(in srgb, ${colors.bad} 15%, transparent)`,
	warn15: `color-mix(in srgb, ${colors.warn} 15%, transparent)`,
	info15: `color-mix(in srgb, ${colors.info} 18%, transparent)`,
	canvas80: `color-mix(in srgb, ${colors.canvas} 80%, transparent)`,
	bar: 'rgb(22 22 24 / 0.9)',
});

export const fonts = stylex.defineVars({
	sans: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
	rounded: "ui-rounded, 'SF Pro Rounded', -apple-system, system-ui, sans-serif",
});

export const layout = stylex.defineConsts({
	// Inset-grouped list geometry.
	gutter: '16px',
	radius: '12px',
	maxWidth: '640px',
	tabBar: '50px',
	navBar: '44px',
	safeTop: 'env(safe-area-inset-top, 0px)',
	safeBottom: 'env(safe-area-inset-bottom, 0px)',
	ease: 'cubic-bezier(0.32, 0.72, 0, 1)',
});
