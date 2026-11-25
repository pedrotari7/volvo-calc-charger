import * as stylex from '@stylexjs/stylex';
import { colors, layout } from '../app/tokens.stylex';

const flow = stylex.keyframes({
	from: { backgroundPosition: '0 0' },
	to: { backgroundPosition: '28px 0' },
});

const styles = stylex.create({
	track: { height: 12, borderRadius: 6, backgroundColor: 'rgb(118 118 128 / 0.24)', overflow: 'hidden' },
	fill: {
		height: '100%',
		borderRadius: 6,
		backgroundImage: `linear-gradient(90deg, ${colors.brandStrong}, ${colors.brand})`,
		transitionProperty: 'width',
		transitionDuration: '700ms',
		transitionTimingFunction: layout.ease,
	},
	charging: {
		backgroundImage: `repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.18) 0 7px, transparent 7px 14px), linear-gradient(90deg, ${colors.brandStrong}, ${colors.brand})`,
		backgroundSize: '28px 100%, 100% 100%',
		animationName: flow,
		animationDuration: '900ms',
		animationIterationCount: 'infinite',
		animationTimingFunction: 'linear',
	},
	low: { backgroundImage: `linear-gradient(90deg, ${colors.warn}, #ffb340)` },
});

export const BatteryBar = ({ percent, charging = false }: { percent: number; charging?: boolean }) => {
	const p = Math.max(0, Math.min(100, percent));

	return (
		<div
			role='meter'
			aria-label='Battery'
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={p}
			{...stylex.props(styles.track)}
		>
			<div
				style={{ width: `${p}%` }}
				{...stylex.props(styles.fill, p < 20 && styles.low, charging && styles.charging)}
			/>
		</div>
	);
};
