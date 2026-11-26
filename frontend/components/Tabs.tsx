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

const bounce = stylex.keyframes({
	'0%': { transform: 'scale(1)' },
	'30%': { transform: 'scale(0.8) translateY(2px)' },
	'60%': { transform: 'scale(1.18) translateY(-3px)' },
	'100%': { transform: 'scale(1)' },
});

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
		gap: 1,
		paddingTop: 2,
		fontSize: 10,
		fontWeight: 500,
		letterSpacing: '0.01em',
		color: colors.faint,
		transform: { default: 'none', ':active': 'scale(0.92)' },
		transitionProperty: 'transform, color',
		transitionDuration: '150ms',
	},
	active: { color: colors.brand },
	iconWrap: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: 52,
		height: 30,
		borderRadius: 15,
		transitionProperty: 'background-color',
		transitionDuration: '250ms',
	},
	iconActive: {
		backgroundColor: tint.brand15,
		animationName: bounce,
		animationDuration: '520ms',
		animationTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
	},
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
							<span {...stylex.props(styles.iconWrap, active && styles.iconActive)}>
								<Icon
									name={icon}
									size={24}
									filled={active && icon === 'bolt'}
									strokeWidth={active ? 2 : 1.7}
								/>
							</span>
							{label}
						</Link>
					);
				})}
			</div>
		</nav>
	);
};

export default Tabs;
