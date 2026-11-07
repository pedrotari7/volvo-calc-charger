import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Open the app signed in as the seeded dev user.
 *
 * Through the sign-in screen's own "Sign in as dev user" button, the way a
 * developer gets in locally, so these tests notice if it breaks. Waits for the
 * tab bar rather than `networkidle`, which never settles with Firestore
 * listeners open.
 */
export const openSignedIn = async (page: Page, path = '/'): Promise<void> => {
	await page.goto(path);
	await page.getByRole('button', { name: 'Sign in as dev user' }).click();
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
};
