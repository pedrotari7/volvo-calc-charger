import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['shared/**/*.test.ts'],
		globals: true,
		setupFiles: ['./vitest.setup.ts'],
		coverage: {
			enabled: true,
			provider: 'istanbul',
			include: ['shared/**/*.ts'],
			exclude: ['shared/**/*.test.ts'],
			reporter: ['json', 'lcov', 'text'],
			reportsDirectory: './coverage',
			thresholds: { statements: 95, branches: 90, functions: 95, lines: 95 },
		},
	},
});
