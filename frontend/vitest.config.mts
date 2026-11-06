import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { stylex } from './test/stylexPlugin.mts';

export default defineConfig({
	plugins: [stylex(), react()],
	resolve: {
		alias: {
			'@shared': path.resolve(import.meta.dirname, '../shared'),
			'@': path.resolve(import.meta.dirname),
		},
	},
	test: {
		environment: 'jsdom',
		globals: true,
		include: ['{app,components,lib}/**/*.test.{ts,tsx}'],
		setupFiles: ['./vitest.setup.ts'],
		pool: 'threads',
	},
});
