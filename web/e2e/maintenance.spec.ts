import { expect, test, type APIRequestContext } from '@playwright/test'

async function verifiedCase(request: APIRequestContext) {
  const origin = 'http://127.0.0.1:8011/api/v1'
  const created = await request.post(`${origin}/cases`, { multipart: { source: 'sample', symptom: 'Maintenance board shifting noise.' } })
  expect(created.status()).toBe(201)
  const initial = await created.json()
  const path = `${origin}/cases/${initial.id}`
  expect((await request.post(`${path}/scan`)).status()).toBe(200)
  const investigation = await (await request.post(`${path}/investigate`)).json()
  for (const step of investigation.steps) {
    expect((await request.put(`${path}/verification-steps/${step.id}`, { multipart: { completed: 'true' } })).status()).toBe(200)
  }
  expect((await request.post(`${path}/verify`)).status()).toBe(200)
  return { id: initial.id as string, path }
}

test('Act approval creates a persistent maintenance card that can move through the board', async ({ page, request }) => {
  const source = await verifiedCase(request)
  await page.goto(`/?case=${source.id}&stage=act`)
  await page.getByRole('button', { name: 'Approve & create task' }).click()
  await page.getByRole('link', { name: 'View maintenance board' }).click()
  await expect(page).toHaveURL(/\/maintenance$/)
  const task = (await (await request.get(source.path)).json()).task
  const key = `MT-${String(task.id).padStart(4, '0')}`
  const card = page.locator(`[data-task-id="${task.id}"]`)
  await expect(page.locator('[data-status="todo"]').locator(`[data-task-id="${task.id}"]`)).toBeVisible()
  await card.getByRole('combobox', { name: `Status for ${key}` }).selectOption('in_progress')
  await expect(page.locator('[data-status="in_progress"]').locator(`[data-task-id="${task.id}"]`)).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-status="in_progress"]').locator(`[data-task-id="${task.id}"]`)).toBeVisible()
  await card.getByRole('button').click()
  const details = page.getByRole('dialog')
  await expect(details).toBeVisible()
  await details.getByLabel('Resolution notes (optional)').fill('Adjusted indexing and verified shifting on a stand.')
  await details.getByRole('button', { name: 'Mark done' }).click()
  await expect(details.getByText('Resolution recorded')).toBeVisible()
  await details.getByRole('button', { name: 'Close task details' }).click()
  await expect(page.locator('[data-status="done"]').locator(`[data-task-id="${task.id}"]`)).toBeVisible()
  await page.getByRole('searchbox').fill(key)
  await expect(page.locator('.maintenance-task')).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Filter by priority' }).selectOption('high')
  await expect(page.locator('.maintenance-task')).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Filter by priority' }).selectOption('all')
  await card.getByRole('button').click()
  await page.getByRole('dialog').getByRole('link', { name: 'Open source inspection' }).click()
  await expect(page.getByText('Outcome added to the case memory')).toBeVisible()
  await expect(page.getByText('Adjusted indexing and verified shifting on a stand.')).toBeVisible()
})

test('board drag and drop persists and mobile view stays within the viewport', async ({ page, request }, testInfo) => {
  const source = await verifiedCase(request)
  const task = (await (await request.post(`${source.path}/tasks`, { data: { approved: true } })).json()).task
  await page.goto('/maintenance')
  const card = page.locator(`[data-task-id="${task.id}"]`)
  await card.dragTo(page.locator('[data-status="in_progress"] .kanban-column-heading'))
  await expect(page.locator('[data-status="in_progress"]').locator(`[data-task-id="${task.id}"]`)).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('board-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Maintenance.', exact: true })).toBeVisible()
  await expect(page.getByRole('searchbox')).toBeVisible()
  await expect(card).toBeAttached()
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('board-mobile.png'), fullPage: true })
  await page.getByRole('searchbox').fill(`MT-${String(task.id).padStart(4, '0')}`)
  await expect(page.locator('.maintenance-task')).toHaveCount(1)
})

test('empty and failed maintenance requests have working recovery', async ({ page }) => {
  let failed = true
  await page.route('**/api/v1/tasks', route => failed ? route.fulfill({ status: 503, json: { detail: 'Maintenance unavailable. Please retry.' } }) : route.fulfill({ json: [] }))
  await page.goto('/maintenance')
  await expect(page.getByRole('alert')).toContainText('Maintenance unavailable')
  failed = false
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('Your next action starts with an inspection.')).toBeVisible()
  await page.getByRole('link', { name: 'Start an inspection' }).click()
  await expect(page.getByRole('button', { name: 'Analyze photo' })).toBeVisible()
})
