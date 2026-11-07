import * as stylex from '@stylexjs/stylex';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	row: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: colors.ink },
	label: { color: colors.muted },
	value: { textAlign: 'right' },
	bad: { color: colors.bad },
	good: { color: colors.good },
});

interface Props {
	label: string;
	value: string;
	tone?: 'good' | 'bad';
}

export const StatusRow = ({ label, value, tone }: Props) => (
	<div {...stylex.props(styles.row)}>
		<span {...stylex.props(styles.label)}>{label}</span>
		<span {...stylex.props(styles.value, tone === 'bad' && styles.bad, tone === 'good' && styles.good)}>
			{value}
		</span>
	</div>
);
