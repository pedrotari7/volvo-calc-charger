import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Needs the Firestore emulator; serialised since tests clear the database.
export default defineConfig({
	resolve: {
		alias: { '@shared': path.resolve(__dirname, '../shared') },
	},
	test: {
		environment: 'node',
		root: path.resolve(__dirname, '..'),
		include: ['rules/**/*.test.ts'],
		globals: true,
		setupFiles: ['./vitest.setup.ts'],
		testTimeout: 20000,
		hookTimeout: 20000,
		fileParallelism: false,
		coverage: { enabled: false },
	},
});
