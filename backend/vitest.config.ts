import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Needs the Firestore emulator; serialised since tests clear the database.
export default defineConfig({
	test: {
		environment: 'node',
		root: path.resolve(__dirname, '..'),
		include: ['backend/test/**/*.test.ts'],
		globals: true,
		setupFiles: ['./backend/test/setup.ts'],
		testTimeout: 20000,
		hookTimeout: 20000,
		fileParallelism: false,
		coverage: { enabled: false },
	},
});
