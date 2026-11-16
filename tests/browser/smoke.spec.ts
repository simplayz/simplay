import { test, expect } from '@playwright/test';
test('demo, navigation, local board and persisted reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /demo/i }).click();
  await expect(page.getByText('Server save: saved', { exact: true })).toBeVisible();
  for (const key of ['2','3','4','5','6','1']) {
    await page.keyboard.press(key);
    await expect(page.locator('main')).toBeVisible();
  }
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  expect(errors).toEqual([]);
});
