import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end, against the whole stack: a production build of the frontend,
 * the Auth and Firestore emulators and a database seeded by `pnpm seed` from the
 * same fixtures and shared functions the backend uses. Two viewports, because
 * the phone is the primary target. Desktop runs after mobile: both viewports run
 * the same journeys against one seeded database, so they must not overlap.
 */

// Starting up is a frontend build, two emulators and a seed.
const START_TIMEOUT = 240_000;

export default defineConfig({
	testDir: './e2e',
	workers: 1,
	fullyParallel: false,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
	timeout: 60_000,
	expect: { timeout: 15_000 },
	use: {
		baseURL: 'http://127.0.0.1:3000',
		trace: 'retain-on-failure',
		video: 'retain-on-failure',
	},
	projects: [
		{ name: 'mobile', use: { ...devices['iPhone 13'] } },
		// Asking for `--project=desktop` runs mobile first, and a mobile failure
		// leaves desktop reported as not run.
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] }, dependencies: ['mobile'] },
	],
	webServer: {
		command: 'pnpm dev:e2e',
		url: 'http://127.0.0.1:3000',
		timeout: START_TIMEOUT,
		// Without this Playwright SIGKILLs the process, which orphans the emulators' JVM.
		gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
		reuseExistingServer: !process.env.CI,
		stdout: 'pipe',
		stderr: 'pipe',
	},
});
