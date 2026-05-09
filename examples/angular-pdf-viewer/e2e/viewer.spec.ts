import { expect, test } from '@playwright/test';

test('applies Angular config-driven theme and category customization', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'EmbedPDF Angular Viewer Demo' })).toBeVisible();
  await expect(
    page.getByText(
      'Light theme, Angular red accent, annotation tools disabled, custom toolbar action added at runtime',
    ),
  ).toBeVisible();
  await expect(page.locator('embedpdf-pdf-viewer')).toBeVisible();

  await expect(page.getByTestId('viewer-status')).toHaveText('ready', {
    timeout: 30_000,
  });

  const container = page.locator('embedpdf-pdf-viewer embedpdf-container');
  await expect(container).toHaveCount(1);
  await expect(container).toHaveAttribute('data-color-scheme', 'light');

  const themeState = await container.evaluate((node) => {
    const viewer = node as HTMLElement & {
      themePreference?: string;
    };

    return {
      themePreference: viewer.themePreference ?? null,
      accentPrimary: getComputedStyle(viewer).getPropertyValue('--ep-accent-primary').trim(),
    };
  });

  expect(themeState).toEqual({
    themePreference: 'light',
    accentPrimary: '#dd0031',
  });

  await expect(page.getByRole('button', { name: 'View' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Angular Tips' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annotate' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Highlight' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Angular Tips' }).click();
  await expect(page.getByTestId('viewer-action')).toHaveText(
    'Angular runtime command triggered',
  );
});
