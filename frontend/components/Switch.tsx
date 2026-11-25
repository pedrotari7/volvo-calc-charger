import * as stylex from '@stylexjs/stylex';
import type { ChangeEvent } from 'react';
import { colors, layout } from '../app/tokens.stylex';

const styles = stylex.create({
	track: {
		position: 'relative',
		display: 'inline-block',
		width: 51,
		height: 31,
		borderRadius: 16,
		flexShrink: 0,
		backgroundColor: 'rgb(120 120 128 / 0.32)',
		transitionProperty: 'background-color',
		transitionDuration: '250ms',
	},
	on: { backgroundColor: colors.brand },
	knob: {
		position: 'absolute',
		top: 2,
		left: 2,
		width: 27,
		height: 27,
		borderRadius: '50%',
		backgroundColor: '#fff',
		boxShadow: '0 3px 8px rgb(0 0 0 / 0.15), 0 3px 1px rgb(0 0 0 / 0.06)',
		transitionProperty: 'transform',
		transitionDuration: '250ms',
		transitionTimingFunction: layout.ease,
		pointerEvents: 'none',
	},
	knobOn: { transform: 'translateX(20px)' },
	input: {
		position: 'absolute',
		inset: 0,
		width: '100%',
		height: '100%',
		margin: 0,
		opacity: 0,
		cursor: 'pointer',
	},
});

/** An iOS-style toggle over a real checkbox, so labels and forms work as usual. */
export const Switch = ({
	checked,
	onChange,
	disabled,
}: {
	checked: boolean;
	onChange: (e: ChangeEvent<HTMLInputElement>) => void;
	disabled?: boolean;
}) => (
	<span {...stylex.props(styles.track, checked && styles.on)}>
		<input
			type='checkbox'
			role='switch'
			checked={checked}
			disabled={disabled}
			onChange={onChange}
			{...stylex.props(styles.input)}
		/>
		<span {...stylex.props(styles.knob, checked && styles.knobOn)} />
	</span>
);
