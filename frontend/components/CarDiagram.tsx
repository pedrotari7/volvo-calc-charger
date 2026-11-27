'use client';

import * as stylex from '@stylexjs/stylex';
import type { CarState } from '@shared/types';
import { colors, tint } from '../app/tokens.stylex';
import { Icon } from './Icon';

const styles = stylex.create({
	card: {
		display: 'flex',
		alignItems: 'center',
		gap: 16,
		padding: 16,
		borderRadius: 20,
		backgroundColor: colors.surface,
	},
	svg: { flexShrink: 0, width: 132, height: 'auto', overflow: 'visible' },
	body: { fill: colors.raised, stroke: colors.line, strokeWidth: 1.5 },
	glass: { fill: tint.white8, stroke: 'none' },
	panel: { fill: tint.white5, stroke: colors.line, strokeWidth: 1 },
	door: { fill: colors.raised, stroke: colors.faint, strokeWidth: 1.5, transitionProperty: 'transform' },
	open: { fill: tint.bad15, stroke: colors.bad, strokeWidth: 2 },
	openGlass: { fill: colors.bad, opacity: 0.55 },
	tyre: { fill: '#3a3a3c', stroke: 'none' },
	tyreOk: { fill: '#48484a' },
	tyreBad: { fill: colors.bad },
	text: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
	lockLine: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600, color: colors.ink },
	lockBadge: {
		width: 30,
		height: 30,
		borderRadius: 15,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	good: { backgroundColor: tint.brand15, color: colors.good },
	bad: { backgroundColor: tint.bad15, color: colors.bad },
	unknown: { backgroundColor: tint.fill, color: colors.muted },
	list: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 },
	item: { fontSize: 14, color: colors.muted },
	itemBad: { color: colors.bad },
	legend: { display: 'flex', gap: 12, fontSize: 12, color: colors.faint },
	swatch: { display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 4 },
	swatchBad: { backgroundColor: colors.bad },
	swatchOk: { backgroundColor: '#8e8e93' },
});

// Volvo's "nothing wrong" tyre values.
const tyreOk = (v: string) => /^(no_?warning|ok|unspecified)$/i.test(v);

const POS: Record<string, string> = {
	frontLeft: 'Front left',
	frontRight: 'Front right',
	rearLeft: 'Rear left',
	rearRight: 'Rear right',
};
const NAMES: Record<string, string> = { tailgate: 'Tailgate', hood: 'Bonnet', sunroof: 'Sunroof' };
const label = (key: string) => {
	const [kind, pos] = key.split(':');
	if (pos === undefined) return NAMES[key] ?? key;
	return `${POS[pos] ?? pos} ${kind}`;
};

// Doors swing out from their front hinge, like the real thing.
const DOORS: Array<{ key: string; x: number; y: number; hingeX: number; angle: number }> = [
	{ key: 'door:frontLeft', x: 26, y: 112, hingeX: 30, angle: -32 },
	{ key: 'door:rearLeft', x: 26, y: 184, hingeX: 30, angle: -32 },
	{ key: 'door:frontRight', x: 146, y: 112, hingeX: 150, angle: 32 },
	{ key: 'door:rearRight', x: 146, y: 184, hingeX: 150, angle: 32 },
];
const WINDOWS: Array<{ key: string; x: number; y: number }> = [
	{ key: 'window:frontLeft', x: 34, y: 120 },
	{ key: 'window:rearLeft', x: 34, y: 192 },
	{ key: 'window:frontRight', x: 140, y: 120 },
	{ key: 'window:rearRight', x: 140, y: 192 },
];
const TYRES: Array<{ key: string; x: number; y: number }> = [
	{ key: 'frontLeft', x: 14, y: 66 },
	{ key: 'frontRight', x: 154, y: 66 },
	{ key: 'rearLeft', x: 14, y: 240 },
	{ key: 'rearRight', x: 154, y: 240 },
];

/** The car from above: open doors swing out and glow red, open windows and hatches light up, tyres show their state. */
export const CarDiagram = ({ car }: { car: CarState | null }) => {
	const openings = car?.openings?.value ?? {};
	const tyres = car?.tyres?.value ?? {};
	const isOpen = (k: string) => openings[k] === 'open';
	const open = Object.keys(openings).filter(isOpen);
	const badTyres = Object.entries(tyres).filter(([, v]) => !tyreOk(v));
	const locked = car?.locked?.value ?? null;
	const known = car?.openings != null || car?.locked != null;

	const summary = [
		locked === null ? 'Lock unknown' : locked ? 'Locked' : 'Unlocked',
		open.length ? `open: ${open.map(label).join(', ')}` : known ? 'everything shut' : null,
		badTyres.length ? `tyres to check: ${badTyres.map(([k]) => POS[k] ?? k).join(', ')}` : null,
	]
		.filter(Boolean)
		.join('; ');

	const tone = locked === null ? 'unknown' : !locked || open.length ? 'bad' : 'good';

	return (
		<div {...stylex.props(styles.card)}>
			<svg
				viewBox='0 0 180 320'
				role='img'
				aria-label={`Car from above. ${summary}.`}
				{...stylex.props(styles.svg)}
			>
				{TYRES.map(t => {
					const v = tyres[t.key];
					const ok = v !== undefined && tyreOk(v);
					const bad = v !== undefined && !ok;
					return (
						<rect
							key={t.key}
							x={t.x}
							y={t.y}
							width={12}
							height={40}
							rx={5}
							{...stylex.props(styles.tyre, ok && styles.tyreOk, bad && styles.tyreBad)}
						/>
					);
				})}
				<rect x={30} y={14} width={120} height={292} rx={46} {...stylex.props(styles.body)} />
				{/* Bonnet, windscreen, roof, rear window, tailgate. */}
				<path
					d='M44 92 Q90 78 136 92 L136 58 Q136 26 90 24 Q44 26 44 58 Z'
					{...stylex.props(styles.panel, isOpen('hood') && styles.open)}
				/>
				<path d='M46 104 Q90 90 134 104 L128 128 Q90 120 52 128 Z' {...stylex.props(styles.glass)} />
				<rect
					x={58}
					y={140}
					width={64}
					height={76}
					rx={10}
					{...stylex.props(styles.glass, isOpen('sunroof') && styles.openGlass)}
				/>
				<path d='M52 232 Q90 240 128 232 L134 252 Q90 262 46 252 Z' {...stylex.props(styles.glass)} />
				<path
					d='M44 264 Q90 276 136 264 L136 276 Q136 300 90 302 Q44 300 44 276 Z'
					{...stylex.props(styles.panel, isOpen('tailgate') && styles.open)}
				/>
				{WINDOWS.map(w => (
					<rect
						key={w.key}
						x={w.x}
						y={w.y}
						width={6}
						height={52}
						rx={3}
						{...stylex.props(styles.glass, isOpen(w.key) && styles.openGlass)}
					/>
				))}
				{DOORS.map(d => (
					<rect
						key={d.key}
						x={d.x}
						y={d.y}
						width={8}
						height={68}
						rx={4}
						transform={isOpen(d.key) ? `rotate(${d.angle} ${d.hingeX} ${d.y})` : undefined}
						{...stylex.props(styles.door, isOpen(d.key) && styles.open)}
					/>
				))}
			</svg>
			<div {...stylex.props(styles.text)}>
				<span {...stylex.props(styles.lockLine)}>
					<span {...stylex.props(styles.lockBadge, styles[tone])}>
						<Icon name={tone === 'bad' ? 'warning' : 'lock'} size={16} strokeWidth={2.2} />
					</span>
					{locked === null ? 'Lock unknown' : locked ? 'Locked' : 'Unlocked'}
				</span>
				<ul {...stylex.props(styles.list)}>
					{open.length ? (
						open.map(k => (
							<li key={k} {...stylex.props(styles.item, styles.itemBad)}>
								{label(k)} open
							</li>
						))
					) : (
						<li {...stylex.props(styles.item)}>
							{known ? 'Doors, windows and hatches shut' : 'No door data yet'}
						</li>
					)}
					{badTyres.map(([k]) => (
						<li key={k} {...stylex.props(styles.item, styles.itemBad)}>
							{POS[k] ?? k} tyre: check pressure
						</li>
					))}
				</ul>
				<span aria-hidden {...stylex.props(styles.legend)}>
					<span>
						<span {...stylex.props(styles.swatch, styles.swatchBad)} />
						Open or to check
					</span>
					<span>
						<span {...stylex.props(styles.swatch, styles.swatchOk)} />
						OK
					</span>
				</span>
			</div>
		</div>
	);
};
