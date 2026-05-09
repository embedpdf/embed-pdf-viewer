import { expect, test } from '@playwright/test';

test('mounts the Angular viewer and reaches ready state', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'EmbedPDF Angular Viewer Demo' })).toBeVisible();
  await expect(page.locator('embedpdf-pdf-viewer')).toBeVisible();

  await expect(page.getByTestId('viewer-status')).toHaveText('ready', {
    timeout: 30_000,
  });

  await expect(page.locator('embedpdf-pdf-viewer embedpdf-container')).toHaveCount(1);
});
