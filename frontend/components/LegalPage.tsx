import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../app/tokens.stylex';

const styles = stylex.create({
	main: { maxWidth: 680, marginInline: 'auto', padding: 24, lineHeight: 1.6 },
	h1: { fontSize: 24, fontWeight: 700, marginBottom: 8 },
	updated: { color: colors.faint, fontSize: 13, marginBottom: 24 },
	h2: { fontSize: 17, fontWeight: 600, marginTop: 24, marginBottom: 8, color: colors.brand },
	body: { color: colors.muted, fontSize: 15 },
});

export const LegalPage = ({ title, updated, children }: { title: string; updated: string; children: ReactNode }) => (
	<main {...stylex.props(styles.main)}>
		<h1 {...stylex.props(styles.h1)}>{title}</h1>
		<p {...stylex.props(styles.updated)}>Last updated {updated}</p>
		{children}
	</main>
);

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
	<section>
		<h2 {...stylex.props(styles.h2)}>{title}</h2>
		<div {...stylex.props(styles.body)}>{children}</div>
	</section>
);
