import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import './globals.css';
import { colors, fonts } from './tokens.stylex';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
	title: 'Volvo Charge',
	description: 'What it costs to charge the Volvo at home.',
	manifest: '/manifest.json',
	applicationName: 'Volvo Charge',
	appleWebApp: { capable: true, title: 'Charge', statusBarStyle: 'black-translucent' },
	icons: {
		icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
		apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
	},
	formatDetection: { telephone: false },
};

export const viewport: Viewport = {
	themeColor: '#07080a',
	width: 'device-width',
	initialScale: 1,
	viewportFit: 'cover',
};

const styles = stylex.create({
	html: { backgroundColor: colors.canvas, colorScheme: 'dark', overscrollBehaviorY: 'none' },
	body: { backgroundColor: colors.canvas, color: colors.ink, fontFamily: fonts.sans, minHeight: '100dvh' },
});

const RootLayout = ({ children }: { children: ReactNode }) => (
	<html lang='en' {...stylex.props(styles.html)}>
		<body suppressHydrationWarning {...stylex.props(styles.body)}>
			{children}
			<ServiceWorkerRegistrar />
		</body>
	</html>
);

export default RootLayout;
