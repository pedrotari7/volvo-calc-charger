import * as stylex from '@stylexjs/stylex';
import { localParts } from '@shared/time';
import type { IsoUtc } from '@shared/types';
import { colors, tint } from '../app/tokens.stylex';
import { formatLocalTime } from '../lib/localTime';

const HOUR_MS = 3_600_000;

const styles = stylex.create({
	wrap: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 },
	bar: {
		position: 'relative',
		height: 14,
		borderRadius: 7,
		backgroundColor: tint.fill,
		overflow: 'hidden',
	},
	window: {
		position: 'absolute',
		top: 0,
		bottom: 0,
		borderRadius: 7,
		backgroundImage: `linear-gradient(90deg, ${colors.brandStrong}, ${colors.brand})`,
		boxShadow: `0 0 12px ${tint.brand30}`,
	},
	hour: { position: 'absolute', top: 4, bottom: 4, width: 1, backgroundColor: 'rgb(255 255 255 / 0.12)' },
	now: {
		position: 'absolute',
		top: -3,
		bottom: -3,
		width: 3,
		marginLeft: -1.5,
		borderRadius: 2,
		backgroundColor: colors.ink,
	},
	labels: { position: 'relative', height: 16, fontSize: 12, color: colors.muted, fontVariantNumeric: 'tabular-nums' },
	label: { position: 'absolute', top: 0, transform: 'translateX(-50%)', whiteSpace: 'nowrap' },
	first: { transform: 'none' },
	last: { transform: 'translateX(-100%)' },
});

interface Props {
	/** Start and end of the night shown. */
	from: IsoUtc;
	to: IsoUtc;
	/** The charging window, highlighted. */
	start: IsoUtc;
	end: IsoUtc;
	now?: IsoUtc;
}

/** The evening and night as a bar, with the charging window lit and "now" marked. */
export const NightStrip = ({ from, to, start, end, now }: Props) => {
	const a = Date.parse(from);
	const b = Date.parse(to);
	const span = Math.max(b - a, HOUR_MS);
	const pct = (ms: number) => Math.max(0, Math.min(100, ((ms - a) / span) * 100));
	const left = pct(Date.parse(start));
	const right = pct(Date.parse(end));
	const nowMs = now ? Date.parse(now) : NaN;

	const hours: number[] = [];
	for (let t = Math.ceil(a / HOUR_MS) * HOUR_MS; t < b; t += HOUR_MS) if (t > a) hours.push(t);
	const midnight = hours.find(t => localParts(new Date(t).toISOString()).hour === 0);

	return (
		<div
			{...stylex.props(styles.wrap)}
			role='img'
			aria-label={`Charging ${formatLocalTime(start)} to ${formatLocalTime(end)}, between ${formatLocalTime(from)} and ${formatLocalTime(to)}`}
		>
			<div {...stylex.props(styles.bar)}>
				{hours.map(t => (
					<span key={t} style={{ left: `${pct(t)}%` }} {...stylex.props(styles.hour)} />
				))}
				<span
					style={{ left: `${left}%`, width: `${Math.max(right - left, 1.5)}%` }}
					{...stylex.props(styles.window)}
				/>
				{nowMs > a && nowMs < b ? (
					<span style={{ left: `${pct(nowMs)}%` }} {...stylex.props(styles.now)} />
				) : null}
			</div>
			<div {...stylex.props(styles.labels)} aria-hidden>
				<span style={{ left: 0 }} {...stylex.props(styles.label, styles.first)}>
					{formatLocalTime(from)}
				</span>
				{midnight !== undefined && pct(midnight) > 18 && pct(midnight) < 82 ? (
					<span style={{ left: `${pct(midnight)}%` }} {...stylex.props(styles.label)}>
						00:00
					</span>
				) : null}
				<span style={{ left: '100%' }} {...stylex.props(styles.label, styles.last)}>
					{formatLocalTime(to)}
				</span>
			</div>
		</div>
	);
};
