const path = require('path');
const stylexPlugin = require('@stylexswc/nextjs-plugin');
const stylexOptions = require('./stylex.config');

// Placeholder keeps `next build` working before Firebase is configured.
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'volvo-calc-charger';

/** @type {import('next').NextConfig} */
const nextConfig = {
	// `shared/` lives outside this package.
	outputFileTracingRoot: path.join(__dirname, '../'),
	experimental: { externalDir: true },
	async rewrites() {
		return [
			{
				source: '/api/volvo/callback',
				destination: `https://europe-west1-${projectId}.cloudfunctions.net/volvoCallback`,
			},
		];
	},
	async headers() {
		return [
			{
				// Lets the browser pick up a new worker.
				source: '/sw.js',
				headers: [
					{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
					{ key: 'Service-Worker-Allowed', value: '/' },
				],
			},
			{
				source: '/:path*',
				headers: [
					{ key: 'X-Frame-Options', value: 'DENY' },
					{ key: 'X-Content-Type-Options', value: 'nosniff' },
					{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
				],
			},
		];
	},
};

module.exports = stylexPlugin({ rsOptions: stylexOptions, extractCSS: false })(nextConfig);
