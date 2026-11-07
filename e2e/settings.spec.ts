import { expect, test } from '@playwright/test';
import { openSignedIn } from './fixtures';

// One database serves both viewports, and a tariff is keyed by its start date,
// so each project adds its own.
const START_DATE = { mobile: '2026-11-05', desktop: '2026-11-06' } as const;

test('a saved tariff keeps its transfer rate incl. VAT after a reload', async ({ page }, testInfo) => {
	const start = START_DATE[testInfo.project.name as keyof typeof START_DATE];
	await openSignedIn(page, '/settings');

	await page.getByRole('button', { name: 'Add tariff' }).click();
	await page.getByLabel('Start date').fill(start);
	await page.getByLabel('Transfer, high load (kr/kWh)', { exact: true }).fill('0.368');
	await page.getByRole('button', { name: 'Save tariff' }).click();

	const edit = page.getByRole('button', { name: `Edit tariff from ${start}` });
	await expect(edit).toBeVisible();

	await page.reload();
	await page.getByRole('button', { name: `Edit tariff from ${start}` }).click();

	await expect(page.getByLabel('Transfer, high load (kr/kWh)', { exact: true })).toHaveValue('0.368');
	await expect(page.getByLabel('Transfer, high load (kr/kWh) VAT')).toHaveValue('incl');
});
