import { expect, test } from '@playwright/test'

const profile = {
  id: '8a31da2e-d0a5-45ec-8be0-3cfaf67263f7', name: 'Road bike',
  manufacturer: '', model: '', serial_number: '', configuration: '',
  created_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z',
}
const service = {
  id: 'f7c4f9e0-15cc-49c8-90e5-84ea1c2c6ac7', equipment_id: profile.id,
  title: 'Gear adjustment', performed_on: '2026-10-17', service_type: 'maintenance',
  performed_by: '', notes: 'Adjusted shifting.',
  created_at: '2026-10-17T00:00:00Z', updated_at: '2026-10-17T00:00:00Z',
}

for (const scenario of [
  { name: 'no saved records', profiles: [], history: [], configurationAvailable: false, serviceAvailable: false },
  { name: 'one equipment profile', profiles: [profile], history: [], configurationAvailable: true, serviceAvailable: false },
  { name: 'one equipment profile and one service record', profiles: [profile], history: [service], configurationAvailable: true, serviceAvailable: true },
]) {
  test(`Observe context availability reflects ${scenario.name} before inspection`, async ({ page }) => {
    await page.route('**/api/v1/equipment', route => route.fulfill({ json: scenario.profiles }))
    await page.route('**/api/v1/service-records', route => route.fulfill({ json: scenario.history }))
    await page.goto('/')
    const context = page.locator('.inspection-context .data-card')
    const photo = context.locator(':scope > div').filter({ hasText: 'Equipment photo' })
    await expect(photo.locator(':scope > svg')).toBeVisible()
    for (const [label, available] of [
      ['Configuration', scenario.configurationAvailable],
      ['Service history', scenario.serviceAvailable],
    ] as const) {
      const row = context.locator(':scope > div').filter({ hasText: label })
      await expect(row.locator(':scope > svg')).toHaveCount(available ? 1 : 0)
      await expect(row.getByText('Unknown', { exact: true })).toHaveCount(available ? 0 : 1)
      if (available) await expect(row.locator(':scope > svg')).toHaveAttribute('class', await photo.locator(':scope > svg').getAttribute('class') as string)
    }
    await page.getByLabel('Upload photo', { exact: true }).check()
    await expect(page.getByLabel('Saved equipment (optional)')).toHaveValue('')
    await expect(context.locator(':scope > div').filter({ hasText: 'Configuration' }).locator(':scope > svg')).toHaveCount(scenario.configurationAvailable ? 1 : 0)
    await expect(context.locator(':scope > div').filter({ hasText: 'Service history' }).locator(':scope > svg')).toHaveCount(scenario.serviceAvailable ? 1 : 0)
  })
}

test('Observe context availability keeps context already saved with a case', async ({ page, request }) => {
  const response = await request.post('http://127.0.0.1:8011/api/v1/cases', {
    multipart: { source: 'sample', symptom: 'Clicking while changing gears.' },
  })
  expect(response.status()).toBe(201)
  const saved = await response.json()
  await page.route('**/api/v1/equipment', route => route.fulfill({ json: [] }))
  await page.route('**/api/v1/service-records', route => route.fulfill({ json: [] }))
  await page.goto(`/?case=${saved.id}&stage=observe`)
  const context = page.locator('.inspection-context .data-card')
  await expect(context.locator(':scope > div > svg')).toHaveCount(3)
  await expect(context.getByText('Unknown', { exact: true })).toHaveCount(0)
})
