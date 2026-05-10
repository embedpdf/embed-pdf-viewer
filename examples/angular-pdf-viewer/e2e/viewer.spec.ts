import { expect, test } from '@playwright/test'

const stableScreenshotOptions = {
  animations: 'disabled',
  caret: 'hide',
  scale: 'css',
} as const

test('applies Angular config-driven theme and category customization', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'EmbedPDF Angular Viewer Demo' })).toBeVisible()
  await expect(
    page.getByText(
      'Light theme, Angular red accent, annotation tools disabled, custom config panel added at runtime',
    ),
  ).toBeVisible()
  await expect(page.locator('embedpdf-viewer')).toBeVisible()

  await expect(page.getByTestId('viewer-status')).toHaveText('ready', {
    timeout: 30_000,
  })

  const container = page.locator('embedpdf-viewer embedpdf-container')
  await expect(container).toHaveCount(1)
  await expect(container).toHaveAttribute('data-color-scheme', 'light')

  const themeState = await container.evaluate((node) => {
    const viewer = node as HTMLElement & {
      themePreference?: string
    }

    return {
      themePreference: viewer.themePreference ?? null,
      accentPrimary: getComputedStyle(viewer).getPropertyValue('--ep-accent-primary').trim(),
    }
  })

  expect(themeState).toEqual({
    themePreference: 'light',
    accentPrimary: '#dd0031',
  })

  await expect(page.getByRole('button', { name: 'View' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Config', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Annotate' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Highlight' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Config', exact: true }).click()
  const configPanel = page.getByTestId('angular-config-panel')
  await expect(configPanel).toBeVisible()

  const viewerBounds = await page.locator('embedpdf-viewer').boundingBox()
  expect(viewerBounds).not.toBeNull()
  expect(viewerBounds!.width).toBeGreaterThanOrEqual(320)
  expect(viewerBounds!.height).toBeGreaterThanOrEqual(320)

  await expect(page.getByTestId('theme-mode')).toHaveText('light')
  await expect(page.getByTestId('disabled-categories')).toHaveText('Annotations')
  await expect(page.getByTestId('view-option-sidebar')).toBeChecked()
  await expect(page.getByTestId('view-option-search')).toBeChecked()
  await expect(page.getByTestId('view-option-zoom')).toBeChecked()
  await expect(page.getByTestId('view-option-annotations')).not.toBeChecked()

  await expect(page.getByTestId('angular-config-panel-shell')).toHaveScreenshot(
    'angular-config-panel-default.png',
    stableScreenshotOptions,
  )

  await page.getByTestId('toggle-theme').click()

  const darkThemeState = await container.evaluate((node) => ({
    colorScheme: node.getAttribute('data-color-scheme'),
    accentPrimary: getComputedStyle(node).getPropertyValue('--ep-accent-primary').trim(),
  }))

  expect(darkThemeState).toEqual({
    colorScheme: 'dark',
    accentPrimary: '#ff5c7c',
  })
  await expect(page.getByTestId('theme-mode')).toHaveText('dark')

  await page.getByTestId('view-option-annotations').check()
  await page.getByTestId('view-option-search').uncheck()
  await expect(page.getByTestId('disabled-categories')).toHaveText('Search')
  await expect(page.getByRole('button', { name: 'Annotate' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search' })).toHaveCount(0)

  await expect(page.getByTestId('angular-config-panel-shell')).toHaveScreenshot(
    'angular-config-panel-toggled.png',
    stableScreenshotOptions,
  )

  await page.getByTestId('header-config-toggle').click()
  await expect(configPanel).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Config', exact: true })).toBeVisible()
  await expect(page.getByTestId('header-config-toggle')).toHaveText('Show config')

  await page.getByTestId('header-config-toggle').click()
  await expect(configPanel).toBeVisible()
  await expect(page.getByTestId('header-config-toggle')).toHaveText('Collapse config')

  await page.getByTestId('reset-demo').click()
  await expect(page.getByTestId('theme-mode')).toHaveText('light')
  await expect(page.getByTestId('disabled-categories')).toHaveText('Annotations')
  await expect(page.getByRole('button', { name: 'Annotate' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Search' })).toBeVisible()
})
