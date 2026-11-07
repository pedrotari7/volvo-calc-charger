import { expect, test } from '@playwright/test';
import { openSignedIn } from './fixtures';

test('history lists November, opens the 2-3 Nov session with two hourly rows and goes back', async ({ page }) => {
	await openSignedIn(page, '/history');

	await expect(page.getByRole('region', { name: 'Summary 2026-11' })).toBeVisible();

	// The session starts 23:02 UTC on 2 Nov, which is after midnight in Stockholm.
	await page.getByRole('link', { name: /2026-11-03/ }).click();

	const table = page.getByRole('table', { name: /Cost per hour/ });
	await expect(table).toBeVisible();
	await expect(table.locator('tbody tr')).toHaveCount(2);

	await page
		.getByRole('link', { name: /History/ })
		.first()
		.click();
	await expect(page.getByRole('region', { name: 'Summary 2026-11' })).toBeVisible();
	await expect(page).toHaveURL(/\/history$/);
});
