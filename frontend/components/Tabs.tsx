'use client';

import * as stylex from '@stylexjs/stylex';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors, tint } from '../app/tokens.stylex';

const TABS = [
	{ href: '/', label: 'Home' },
	{ href: '/car', label: 'Car' },
	{ href: '/history', label: 'History' },
	{ href: '/settings', label: 'Settings' },
] as const;

const styles = stylex.create({
	nav: {
		position: 'fixed',
		bottom: 0,
		left: 0,
		right: 0,
		display: 'flex',
		backgroundColor: colors.raised,
		borderTopWidth: 1,
		borderTopStyle: 'solid',
		borderTopColor: colors.line,
		paddingBottom: 'env(safe-area-inset-bottom)',
	},
	tab: {
		flexGrow: 1,
		flexBasis: 0,
		textAlign: 'center',
		paddingBlock: 14,
		fontSize: 13,
		color: colors.muted,
	},
	active: { color: colors.brand, backgroundColor: tint.brand15 },
});

const Tabs = () => {
	const pathname = usePathname();

	return (
		<nav aria-label='Main' {...stylex.props(styles.nav)}>
			{TABS.map(({ href, label }) => {
				const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

				return (
					<Link
						key={href}
						href={href}
						aria-current={active ? 'page' : undefined}
						{...stylex.props(styles.tab, active && styles.active)}
					>
						{label}
					</Link>
				);
			})}
		</nav>
	);
};

export default Tabs;
