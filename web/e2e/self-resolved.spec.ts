import { expect, test } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`self-resolved cases disable approval and persist at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const created = await request.post('http://127.0.0.1:8011/api/v1/cases', {
      multipart: { source: 'sample', symptom: 'Clicking when shifting.' },
    })
    expect(created.status()).toBe(201)
    const initial = await created.json()
    const path = `http://127.0.0.1:8011/api/v1/cases/${initial.id}`
    expect((await request.post(`${path}/scan`)).ok()).toBe(true)
    const investigated = await request.post(`${path}/investigate`)
    expect(investigated.ok()).toBe(true)
    const caseWithSteps = await investigated.json()
    for (const step of caseWithSteps.steps) {
      expect((await request.put(`${path}/verification-steps/${step.id}`, { multipart: { completed: 'true' } })).ok()).toBe(true)
    }
    expect((await request.post(`${path}/verify`)).ok()).toBe(true)
    await page.goto(`/?case=${initial.id}&stage=act`)
    const panel = page.locator('.approval-panel')
    const approve = panel.getByRole('button', { name: 'Approve & create task' })
    const skip = panel.getByRole('button', { name: 'Skip, self-resolved', exact: true })
    await expect(approve).toBeEnabled()
    await expect(skip).toBeEnabled()
    const approveBounds = await approve.boundingBox()
    const skipBounds = await skip.boundingBox()
    expect(skipBounds!.width).toBeCloseTo(approveBounds!.width, 0)
    expect(skipBounds!.height).toBeCloseTo(approveBounds!.height, 0)
    expect(skipBounds!.y).toBeGreaterThanOrEqual(approveBounds!.y + approveBounds!.height)
    await skip.click()
    await expect(panel.getByRole('status')).toHaveText('Self-resolved')
    await expect(approve).toBeDisabled()
    await expect(skip).toBeDisabled()
    await page.reload()
    await expect(approve).toBeDisabled()
    await expect(panel.getByRole('status')).toHaveText('Self-resolved')
    expect((await request.post(`${path}/tasks`, { data: { approved: true } })).status()).toBe(409)
    const saved = await (await request.get(path)).json()
    expect(saved.self_resolved_at).toBeTruthy()
    expect(saved.task).toBeNull()
    const tasks = await (await request.get('http://127.0.0.1:8011/api/v1/tasks')).json()
    expect(tasks.some((task: { case_id: string }) => task.case_id === initial.id)).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await panel.screenshot({ path: testInfo.outputPath('self-resolved-approval.png') })
  })
}
