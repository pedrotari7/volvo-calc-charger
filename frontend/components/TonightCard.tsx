import * as stylex from '@stylexjs/stylex';
import { formatKr, formatKwh } from '@shared/format';
import { nextLocalTime } from '@shared/time';
import type { IsoUtc, Plan } from '@shared/types';
import { formatLocalTime } from '../lib/localTime';
import { colors, fonts, tint } from '../app/tokens.stylex';
import { Icon } from './Icon';
import { NightStrip } from './NightStrip';

const twinkle = stylex.keyframes({
	'0%, 100%': { opacity: 0.15, transform: 'scale(0.6)' },
	'50%': { opacity: 0.9, transform: 'scale(1)' },
});

const glow = stylex.keyframes({
	'0%, 100%': { filter: 'drop-shadow(0 0 2px rgb(165 163 255 / 0.5))' },
	'50%': { filter: 'drop-shadow(0 0 7px rgb(165 163 255 / 0.95))' },
});

// Fixed positions (% of the card) so the sky is the same on every render.
const STARS: readonly { x: number; y: number; s: number; d: number }[] = [
	{ x: 62, y: 10, s: 2, d: 0 },
	{ x: 78, y: 22, s: 3, d: 1.2 },
	{ x: 90, y: 8, s: 2, d: 2.1 },
	{ x: 70, y: 34, s: 1.5, d: 0.6 },
	{ x: 85, y: 44, s: 2, d: 1.8 },
	{ x: 95, y: 28, s: 1.5, d: 2.7 },
	{ x: 54, y: 24, s: 1.5, d: 3.1 },
	{ x: 46, y: 6, s: 2, d: 1.5 },
];

const styles = stylex.create({
	card: {
		position: 'relative',
		overflow: 'hidden',
		padding: 20,
		borderRadius: 20,
		backgroundColor: colors.surface,
		backgroundImage:
			'radial-gradient(110% 80% at 0% 0%, rgb(94 92 230 / 0.28), transparent 60%), linear-gradient(180deg, rgb(20 18 48 / 0.6), transparent 70%)',
		display: 'flex',
		flexDirection: 'column',
		gap: 6,
	},
	sky: { position: 'absolute', inset: 0, pointerEvents: 'none' },
	star: {
		position: 'absolute',
		borderRadius: '50%',
		backgroundColor: '#e6e5ff',
		boxShadow: '0 0 6px rgb(230 229 255 / 0.8)',
		animationName: twinkle,
		animationDuration: '3.4s',
		animationTimingFunction: 'ease-in-out',
		animationIterationCount: 'infinite',
	},
	moon: { animationName: glow, animationDuration: '4s', animationIterationCount: 'infinite' },
	content: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 },
	title: {
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		fontSize: 13,
		fontWeight: 600,
		textTransform: 'uppercase',
		letterSpacing: '0.04em',
		color: '#a5a3ff',
		marginBottom: 4,
	},
	window: {
		fontFamily: fonts.rounded,
		fontSize: 40,
		lineHeight: 1.1,
		fontWeight: 700,
		letterSpacing: '-0.01em',
		color: colors.ink,
		fontVariantNumeric: 'tabular-nums',
	},
	row: { fontSize: 17, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	tip: {
		marginTop: 8,
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		paddingBlock: 10,
		paddingInline: 12,
		borderRadius: 12,
		fontSize: 15,
		color: colors.good,
		backgroundColor: tint.brand15,
	},
	note: { fontSize: 15, color: colors.muted },
	alert: { fontSize: 20, lineHeight: 1.3, fontWeight: 600, color: colors.warn },
});

/** The night the plan covers: 18:00 on the plan's evening (or the window start, if earlier) to ready-by. */
function nightOf(plan: Plan, readyBy: string): { from: IsoUtc; to: IsoUtc } | null {
	const rec = plan.recommendation;
	if (!rec) return null;
	const six = nextLocalTime(`${plan.date}T06:00:00.000Z`, '18:00');
	const from = Date.parse(rec.start) < Date.parse(six) ? rec.start : six;
	const ready = nextLocalTime(from, readyBy);
	const to = Date.parse(rec.end) > Date.parse(ready) ? rec.end : ready;
	return { from, to };
}

interface Props {
	plan: Plan | null;
	now?: IsoUtc;
	/** Settings' ready-by time, the end of the night strip. */
	readyBy?: string;
}

const Body = ({ plan, now, readyBy = '07:00' }: Props & { plan: Plan }) => {
	const { recommendation: rec, alternative: alt } = plan;

	if (plan.neededKwh <= 0) return <p {...stylex.props(styles.window)}>Already at target</p>;
	if (plan.chargeNow)
		return <p {...stylex.props(styles.alert)}>Plug in now — not enough time to wait for cheap hours</p>;
	if (!rec) return <p {...stylex.props(styles.note)}>Prices for tomorrow not out yet</p>;

	// The peak fee is a monthly charge, so costs here are energy only. The power choice still weighs it:
	// reduced power wins when it keeps the month's peak lower.
	const dearer = alt !== null && alt.cost > rec.cost;
	const slower = dearer && rec.kw < alt.kw;
	const saving = dearer && !slower ? alt.energyCost - rec.energyCost : 0;
	const night = nightOf(plan, readyBy);

	return (
		<>
			<p {...stylex.props(styles.window)}>
				{formatLocalTime(rec.start)}–{formatLocalTime(rec.end)}
			</p>
			<p {...stylex.props(styles.row)}>
				{formatKwh(plan.neededKwh)} at {rec.kw} kW · {formatKr(rec.energyCost)}
			</p>
			{night ? <NightStrip from={night.from} to={night.to} start={rec.start} end={rec.end} now={now} /> : null}
			{alt && (slower || saving >= 0.005) ? (
				<p {...stylex.props(styles.tip)}>
					<Icon name='check' size={16} strokeWidth={2.4} />
					Charging at {rec.kw} kW instead of {alt.kw} kW{' '}
					{slower ? 'keeps this month’s peak fee lower' : `saves ${formatKr(saving)}`}
				</p>
			) : null}
			{plan.basis === 'today' ? <p {...stylex.props(styles.note)}>Prices for tomorrow not out yet</p> : null}
		</>
	);
};

export const TonightCard = ({ plan, now, readyBy }: Props) => (
	<section aria-label='Tonight' {...stylex.props(styles.card)}>
		<div aria-hidden {...stylex.props(styles.sky)}>
			{STARS.map(({ x, y, s, d }) => (
				<span
					key={`${x}-${y}`}
					style={{ left: `${x}%`, top: `${y}%`, width: s, height: s, animationDelay: `${d}s` }}
					{...stylex.props(styles.star)}
				/>
			))}
		</div>
		<div {...stylex.props(styles.content)}>
			<h2 {...stylex.props(styles.title)}>
				<Icon name='moon' size={15} filled strokeWidth={1.4} {...stylex.props(styles.moon)} />
				Tonight
			</h2>
			{plan ? (
				<Body plan={plan} now={now} readyBy={readyBy} />
			) : (
				<p {...stylex.props(styles.note)}>No plan yet</p>
			)}
		</div>
	</section>
);
