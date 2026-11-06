import * as stylex from '@stylexjs/stylex';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	track: { height: 10, borderRadius: 5, backgroundColor: colors.raised, overflow: 'hidden' },
	fill: { height: '100%', borderRadius: 5, backgroundColor: colors.brand },
	low: { backgroundColor: colors.warn },
});

export const BatteryBar = ({ percent }: { percent: number }) => {
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
			<div style={{ width: `${p}%` }} {...stylex.props(styles.fill, p < 20 && styles.low)} />
		</div>
	);
};
