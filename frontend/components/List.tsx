import * as stylex from '@stylexjs/stylex';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { colors, layout, tint } from '../app/tokens.stylex';
import { Icon } from './Icon';

export const list = stylex.create({
	group: { display: 'flex', flexDirection: 'column', gap: 7 },
	header: {
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'baseline',
		gap: 8,
		paddingInline: 16,
		fontSize: 13,
		textTransform: 'uppercase',
		letterSpacing: '0.02em',
		color: colors.muted,
	},
	headerAside: { textTransform: 'none', letterSpacing: 0 },
	body: {
		backgroundColor: colors.surface,
		borderRadius: layout.radius,
		overflow: 'hidden',
		display: 'flex',
		flexDirection: 'column',
	},
	footer: { paddingInline: 16, fontSize: 13, color: colors.muted },
	cell: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 12,
		minHeight: 44,
		marginLeft: 16,
		paddingRight: 16,
		paddingBlock: 11,
		fontSize: 17,
		color: colors.ink,
		borderBottomWidth: 0.5,
		borderBottomStyle: 'solid',
		borderBottomColor: { default: colors.line, ':last-child': 'transparent' },
	},
	// Interactive cells bleed the pressed highlight to the group's left edge.
	pressable: {
		marginLeft: 0,
		paddingLeft: 16,
		backgroundColor: { default: 'transparent', ':active': tint.pressed },
		transitionProperty: 'background-color',
		transitionDuration: { default: '250ms', ':active': '0s' },
		textAlign: 'left',
		width: '100%',
	},
	label: { flexShrink: 1, minWidth: 0 },
	value: {
		color: colors.muted,
		textAlign: 'right',
		fontVariantNumeric: 'tabular-nums',
		display: 'flex',
		alignItems: 'center',
		gap: 6,
		flexShrink: 0,
		maxWidth: '60%',
	},
	chevron: { color: colors.faint, flexShrink: 0, marginRight: -4 },
	bad: { color: colors.bad },
	good: { color: colors.good },
	text: { fontSize: 15, color: colors.muted, paddingBlock: 12, paddingInline: 16 },
	stack: { display: 'flex', flexDirection: 'column', gap: 12, padding: 16 },
});

interface GroupProps {
	/** Accessible name of the region; defaults to the header text. */
	label?: string;
	header?: ReactNode;
	aside?: ReactNode;
	footer?: ReactNode;
	children: ReactNode;
}

/** An inset-grouped list section, the backbone of every screen. */
export const Group = ({ label, header, aside, footer, children }: GroupProps) => (
	<section aria-label={label ?? (typeof header === 'string' ? header : undefined)} {...stylex.props(list.group)}>
		{header || aside ? (
			<div {...stylex.props(list.header)}>
				{header ? <h2>{header}</h2> : <span />}
				{aside ? <span {...stylex.props(list.headerAside)}>{aside}</span> : null}
			</div>
		) : null}
		<div {...stylex.props(list.body)}>{children}</div>
		{footer ? <div {...stylex.props(list.footer)}>{footer}</div> : null}
	</section>
);

interface CellProps {
	label: ReactNode;
	value?: ReactNode;
	tone?: 'good' | 'bad';
}

export const Cell = ({ label, value, tone }: CellProps) => (
	<div {...stylex.props(list.cell)}>
		<span {...stylex.props(list.label)}>{label}</span>
		{value !== undefined ? (
			<span {...stylex.props(list.value, tone === 'bad' && list.bad, tone === 'good' && list.good)}>{value}</span>
		) : null}
	</div>
);

export const LinkCell = ({ href, children, value }: { href: string; children: ReactNode; value?: ReactNode }) => (
	<Link href={href} {...stylex.props(list.cell, list.pressable)}>
		<span {...stylex.props(list.label)}>{children}</span>
		<span {...stylex.props(list.value)}>
			{value}
			<Icon name='chevronRight' size={18} strokeWidth={2.4} {...stylex.props(list.chevron)} />
		</span>
	</Link>
);

/** Muted text inside a group: "Not available", "No warnings"… */
export const CellText = ({ children }: { children: ReactNode }) => <p {...stylex.props(list.text)}>{children}</p>;
