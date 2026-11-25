import * as stylex from '@stylexjs/stylex';
import { colors, tint } from '../app/tokens.stylex';

const styles = stylex.create({
	// iOS segmented control: a recessed track with a raised thumb.
	toggle: {
		display: 'flex',
		padding: 2,
		gap: 2,
		borderRadius: 9,
		backgroundColor: tint.fill,
		flexShrink: 0,
	},
	toggleBtn: {
		backgroundColor: 'transparent',
		color: colors.ink,
		borderWidth: 0,
		borderRadius: 7,
		minHeight: 28,
		paddingInline: 12,
		fontSize: 13,
		fontWeight: 500,
		cursor: 'pointer',
		transitionProperty: 'background-color, box-shadow',
		transitionDuration: '200ms',
	},
	toggleOn: {
		backgroundColor: '#636366',
		fontWeight: 600,
		boxShadow: '0 3px 8px rgb(0 0 0 / 0.12), 0 3px 1px rgb(0 0 0 / 0.04)',
	},
});

export const Segmented = <T extends string>({
	label,
	options,
	value,
	onChange,
}: {
	label: string;
	options: readonly (readonly [T, string])[];
	value: T;
	onChange: (v: T) => void;
}) => (
	<div role='group' aria-label={label} {...stylex.props(styles.toggle)}>
		{options.map(([v, text]) => (
			<button
				key={v}
				type='button'
				aria-pressed={value === v}
				onClick={() => onChange(v)}
				{...stylex.props(styles.toggleBtn, value === v && styles.toggleOn)}
			>
				{text}
			</button>
		))}
	</div>
);
