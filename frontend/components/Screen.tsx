'use client';

import * as stylex from '@stylexjs/stylex';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { colors, layout, tint } from '../app/tokens.stylex';
import { Icon } from './Icon';

const enter = stylex.keyframes({
	from: { opacity: 0, transform: 'translateY(8px)' },
	to: { opacity: 1, transform: 'none' },
});

const push = stylex.keyframes({
	from: { opacity: 0.4, transform: 'translateX(28%)' },
	to: { opacity: 1, transform: 'none' },
});

const styles = stylex.create({
	bar: {
		position: 'sticky',
		top: 0,
		zIndex: 20,
		paddingTop: layout.safeTop,
		backgroundColor: 'transparent',
		borderBottomWidth: 0.5,
		borderBottomStyle: 'solid',
		borderBottomColor: 'transparent',
		transitionProperty: 'background-color, border-color',
		transitionDuration: '200ms',
	},
	barScrolled: {
		backgroundColor: tint.bar,
		backdropFilter: 'saturate(180%) blur(20px)',
		WebkitBackdropFilter: 'saturate(180%) blur(20px)',
		borderBottomColor: colors.line,
	},
	barInner: {
		height: layout.navBar,
		display: 'grid',
		gridTemplateColumns: '1fr auto 1fr',
		alignItems: 'center',
		paddingInline: 8,
		maxWidth: layout.maxWidth,
		marginInline: 'auto',
	},
	smallTitle: {
		fontSize: 17,
		fontWeight: 600,
		color: colors.ink,
		opacity: 0,
		transform: 'translateY(4px)',
		transitionProperty: 'opacity, transform',
		transitionDuration: '200ms',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
	},
	smallTitleOn: { opacity: 1, transform: 'none' },
	back: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: 0,
		minHeight: 44,
		paddingRight: 8,
		color: colors.info,
		fontSize: 17,
		justifySelf: 'start',
		opacity: { default: 1, ':active': 0.4 },
	},
	trailing: { justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 4 },
	main: {
		maxWidth: layout.maxWidth,
		marginInline: 'auto',
		paddingInline: layout.gutter,
		paddingBottom: 32,
		display: 'flex',
		flexDirection: 'column',
		gap: 24,
		animationName: enter,
		animationDuration: '320ms',
		animationTimingFunction: layout.ease,
	},
	pushed: { animationName: push, animationDuration: '380ms' },
	largeTitle: {
		fontSize: 34,
		lineHeight: 1.2,
		fontWeight: 700,
		letterSpacing: '0.01em',
		color: colors.ink,
		paddingTop: 2,
		marginBottom: -12,
	},
	sentinel: { height: 1, marginBottom: -1 },
});

interface Props {
	title: string;
	/** A pushed screen: shows a back button and slides in from the right. */
	back?: { href: string; label: string };
	trailing?: ReactNode;
	children: ReactNode;
}

/**
 * One screen of the app: an iOS-style navigation bar whose small title fades
 * in once the large title scrolls under it, over a content column.
 */
export const Screen = ({ title, back, trailing, children }: Props) => {
	const bar = useRef<HTMLElement>(null);
	const sentinel = useRef<HTMLDivElement>(null);
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const el = sentinel.current;
		if (!el || typeof IntersectionObserver === 'undefined') return;
		// The large title counts as scrolled away once it slides under the bar.
		const barHeight = bar.current?.offsetHeight ?? 0;
		const io = new IntersectionObserver(([entry]) => setScrolled(entry ? !entry.isIntersecting : false), {
			rootMargin: `-${barHeight}px 0px 0px 0px`,
		});
		io.observe(el);

		return () => io.disconnect();
	}, []);

	return (
		<>
			<header ref={bar} {...stylex.props(styles.bar, scrolled && styles.barScrolled)}>
				<div {...stylex.props(styles.barInner)}>
					{back ? (
						<Link href={back.href} {...stylex.props(styles.back)}>
							<Icon name='chevronLeft' size={28} strokeWidth={2.2} />
							{back.label}
						</Link>
					) : (
						<span />
					)}
					<span aria-hidden='true' {...stylex.props(styles.smallTitle, scrolled && styles.smallTitleOn)}>
						{title}
					</span>
					<span {...stylex.props(styles.trailing)}>{trailing}</span>
				</div>
			</header>
			<main {...stylex.props(styles.main, back && styles.pushed)}>
				<h1 {...stylex.props(styles.largeTitle)}>{title}</h1>
				<div ref={sentinel} {...stylex.props(styles.sentinel)} />
				{children}
			</main>
		</>
	);
};
