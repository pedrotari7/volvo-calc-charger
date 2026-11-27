'use client';

import * as stylex from '@stylexjs/stylex';
import type { CarProfile, CarView, CarViewName } from '@shared/types';
import { useMemo, useState } from 'react';
import { colors, tint } from '../app/tokens.stylex';

const styles = stylex.create({
	strip: {
		display: 'flex',
		gap: 10,
		overflowX: 'auto',
		scrollSnapType: 'x mandatory',
		scrollbarWidth: 'none',
		marginInline: -16,
		paddingInline: 16,
		paddingBottom: 4,
		'::-webkit-scrollbar': { display: 'none' },
	},
	card: {
		flexShrink: 0,
		width: '82%',
		maxWidth: 420,
		scrollSnapAlign: 'center',
		margin: 0,
		borderRadius: 18,
		overflow: 'hidden',
		position: 'relative',
		backgroundColor: colors.surface,
		backgroundImage: `radial-gradient(70% 45% at 50% 85%, ${tint.white12}, transparent 70%)`,
	},
	image: { display: 'block', width: '100%', aspectRatio: '16 / 9', objectFit: 'contain' },
	interior: { objectFit: 'cover' },
	caption: {
		position: 'absolute',
		left: 12,
		bottom: 10,
		height: 24,
		paddingInline: 10,
		display: 'inline-flex',
		alignItems: 'center',
		borderRadius: 12,
		fontSize: 12,
		fontWeight: 600,
		color: colors.ink,
		backgroundColor: tint.canvas80,
	},
});

const LABELS: Record<CarViewName, string> = {
	front_left: 'Front left',
	front: 'Front',
	front_right: 'Front right',
	side_right: 'Right side',
	back_right: 'Rear right',
	back: 'Rear',
	back_left: 'Rear left',
	side_left: 'Left side',
	interior: 'Interior',
};

/** Volvo's renders of the car, one per angle, swiped sideways. Angles Volvo has no picture for drop out. */
export const CarGallery = ({ profile }: { profile: CarProfile | null }) => {
	const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
	const views = useMemo<CarView[]>(() => {
		if (profile?.views?.length) return profile.views;
		return profile?.imageUrl ? [{ view: 'front_left', url: profile.imageUrl }] : [];
	}, [profile]);
	const shown = views.filter(v => !failed.has(v.url));
	if (!shown.length) return null;
	const name = profile?.model ? `Volvo ${profile.model}` : 'The car';

	return (
		<div role='group' aria-label='Pictures of the car' {...stylex.props(styles.strip)}>
			{shown.map(v => (
				<figure key={v.url} {...stylex.props(styles.card)}>
					{/* eslint-disable-next-line @next/next/no-img-element -- remote Volvo render */}
					<img
						src={v.url}
						alt={`${name}, ${LABELS[v.view].toLowerCase()}`}
						referrerPolicy='no-referrer'
						loading='lazy'
						decoding='async'
						onError={() => setFailed(f => new Set(f).add(v.url))}
						{...stylex.props(styles.image, v.view === 'interior' && styles.interior)}
					/>
					<figcaption {...stylex.props(styles.caption)}>{LABELS[v.view]}</figcaption>
				</figure>
			))}
		</div>
	);
};
