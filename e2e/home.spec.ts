import { expect, test } from '@playwright/test';
import { openSignedIn } from './fixtures';

test("home shows the battery and tonight's plan, and offers no unlock", async ({ page }) => {
	await openSignedIn(page, '/');

	const car = page.getByRole('region', { name: 'Car' });
	await expect(car.getByText(/^\d+ %$/)).toBeVisible();
	await expect(page.getByRole('region', { name: 'Tonight' })).toBeVisible();
	// The plan is seeded; "No plan yet" would mean the app is not reading what the seed wrote.
	await expect(page.getByText('No plan yet')).toHaveCount(0);

	// Nothing on the page, visible text or accessible name, may mention unlocking.
	await expect(page.getByText(/unlock/i)).toHaveCount(0);
	await expect(page.getByRole('button', { name: /unlock/i })).toHaveCount(0);
});
