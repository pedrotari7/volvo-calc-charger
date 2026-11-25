'use client';

import * as stylex from '@stylexjs/stylex';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { colors, layout, tint } from '../app/tokens.stylex';
import type { IconName } from './Icon';
import { Icon } from './Icon';

const TABS: readonly { href: string; label: string; icon: IconName }[] = [
	{ href: '/', label: 'Home', icon: 'bolt' },
	{ href: '/car', label: 'Car', icon: 'car' },
	{ href: '/history', label: 'History', icon: 'clock' },
	{ href: '/settings', label: 'Settings', icon: 'gear' },
];

const styles = stylex.create({
	nav: {
		position: 'fixed',
		bottom: 0,
		left: 0,
		right: 0,
		zIndex: 30,
		backgroundColor: tint.bar,
		backdropFilter: 'saturate(180%) blur(20px)',
		WebkitBackdropFilter: 'saturate(180%) blur(20px)',
		borderTopWidth: 0.5,
		borderTopStyle: 'solid',
		borderTopColor: colors.line,
		paddingBottom: layout.safeBottom,
	},
	inner: { display: 'flex', maxWidth: layout.maxWidth, marginInline: 'auto', height: layout.tabBar },
	tab: {
		flexGrow: 1,
		flexBasis: 0,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 2,
		paddingTop: 4,
		fontSize: 10,
		fontWeight: 500,
		letterSpacing: '0.01em',
		color: colors.faint,
		transform: { default: 'none', ':active': 'scale(0.92)' },
		transitionProperty: 'transform, color',
		transitionDuration: '150ms',
	},
	active: { color: colors.brand },
});

const Tabs = () => {
	const pathname = usePathname();

	return (
		<nav aria-label='Main' {...stylex.props(styles.nav)}>
			<div {...stylex.props(styles.inner)}>
				{TABS.map(({ href, label, icon }) => {
					const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

					return (
						<Link
							key={href}
							href={href}
							aria-current={active ? 'page' : undefined}
							{...stylex.props(styles.tab, active && styles.active)}
						>
							<Icon
								name={icon}
								size={26}
								filled={active && icon === 'bolt'}
								strokeWidth={active ? 2 : 1.7}
							/>
							{label}
						</Link>
					);
				})}
			</div>
		</nav>
	);
};

export default Tabs;
