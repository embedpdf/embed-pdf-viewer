import { expect, test, type Page } from '@playwright/test';

async function openDemo(page: Page, label: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Live EmbedPDF Angular demos' })).toBeVisible();
  await page.getByRole('button', { name: label }).click();
  await expect(page.locator('embedpdf-viewer embedpdf-container')).toBeVisible({
    timeout: 30_000,
  });
}

test('theme demo updates selected brand color', async ({ page }) => {
  await openDemo(page, 'Theme');

  const purpleButton = page.getByRole('button', { name: 'Use Purple theme accent' });
  const blueButton = page.getByRole('button', { name: 'Use Blue theme accent' });

  await expect(purpleButton).toHaveAttribute('aria-pressed', 'true');
  await blueButton.click();

  await expect(blueButton).toHaveAttribute('aria-pressed', 'true');
  await expect(purpleButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('div:has-text("Selected:") strong')).toHaveText('Blue');
});

test('ui customization demo registers the custom toolbar action without icon warnings', async ({ page }) => {
  const consoleWarnings: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'warning' || /Icon not found/i.test(text)) {
      consoleWarnings.push(text);
    }
  });

  await openDemo(page, 'UI Customization');

  await expect(page.getByText('Toolbar patched and command registered')).toBeVisible({
    timeout: 30_000,
  });

  const actionButton = page.getByRole('button', { name: 'Celebrate Angular' });
  await expect(actionButton).toBeVisible();
  await actionButton.click();

  await expect(page.getByText('Angular command executed ✨')).toBeVisible();
  expect(consoleWarnings.some((message) => /Icon not found/i.test(message))).toBeFalsy();
});

test('rotate demo updates the rotation label', async ({ page }) => {
  await openDemo(page, 'Rotate');

  await expect(page.getByText('Rotation: 0°')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Rotate clockwise' }).click();
  await expect(page.getByText('Rotation: 90°')).toBeVisible();
  await page.getByRole('button', { name: 'Rotate counter-clockwise' }).click();
  await expect(page.getByText('Rotation: 0°')).toBeVisible();
});

test('spread demo updates the selected mode state', async ({ page }) => {
  await openDemo(page, 'Spread');

  const singlePageButton = page.getByRole('button', { name: 'Single Page' });
  const oddSpreadButton = page.getByRole('button', { name: 'Two-Page (Odd)' });

  await expect(singlePageButton).toHaveAttribute('aria-pressed', 'true');
  await oddSpreadButton.click();

  await expect(oddSpreadButton).toHaveAttribute('aria-pressed', 'true');
  await expect(singlePageButton).toHaveAttribute('aria-pressed', 'false');
});

test('document loading demo can open the remote sample', async ({ page }) => {
  await openDemo(page, 'Document Loading');

  await expect(page.getByText('Open documents: 0')).toBeVisible();
  await page.getByRole('button', { name: 'Load URL' }).click();

  await expect(page.getByText('Open documents: 1')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Active document')).toHaveValue(/ebook-demo-/);
});

test('scroll initial page demo jumps to page 3 after layout is ready', async ({ page }) => {
  await openDemo(page, 'Scroll Initial Page');

  await expect(page.getByText('Scrolled to page 3')).toBeVisible({ timeout: 30_000 });
});

test('disable categories demo reflects checkbox selection', async ({ page }) => {
  await openDemo(page, 'Disable Categories');

  const annotationsCheckbox = page.getByRole('checkbox', { name: 'Annotations' });
  await expect(page.getByText('Selected: (none)')).toBeVisible();

  await annotationsCheckbox.check();

  await expect(annotationsCheckbox).toBeChecked();
  await expect(page.getByText('Selected: annotation')).toBeVisible();
});
