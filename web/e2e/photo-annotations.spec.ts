import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

for (const width of [1440, 390]) {
  test(`detections show all boxes by default and can focus one component at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const created = await request.post('http://127.0.0.1:8011/api/v1/cases', { multipart: {
      source: 'upload', symptom: 'Noise while changing gears.',
      image: { name: 'iphone-photo.heic', mimeType: 'image/heic', buffer: await readFile('../app/tests/fixtures/iphone-photo.heic') },
    } })
    expect(created.status()).toBe(201)
    const initial = await created.json()
    const scanned = await request.post(`http://127.0.0.1:8011/api/v1/cases/${initial.id}/scan`)
    expect(scanned.status()).toBe(200)
    const saved = await scanned.json()
    saved.scan.annotations = [
      { label: 'Rear derailleur', description: 'Guides the chain between rear sprockets; identified beside the cassette.', box: [500, 20, 780, 240] },
      { label: 'Rear derailleur cable loop', box: [510, 30, 800, 260] },
      { label: 'Rear cassette', box: [480, 50, 660, 280] },
      { label: 'Front derailleur', box: [510, 620, 740, 790] },
      { label: 'Crankset and chainrings', box: [600, 600, 900, 990] },
      { label: 'Chain', box: [640, 200, 720, 720] },
    ]
    await page.route(`**/api/v1/cases/${initial.id}`, route => route.fulfill({ json: saved }))
    await page.goto(`/?case=${initial.id}&stage=observe`)
    const photo = page.locator('.inspection-preview .visual-frame')
    const components = page.locator('.inspection-preview .photo-components')
    const identified = page.getByRole('region', { name: 'Components identified', exact: true })
    const descriptions = identified.getByRole('list', { name: 'Detected component descriptions' })
    await expect(identified.getByRole('heading', { name: '6 detected components' })).toBeVisible()
    await expect(descriptions.locator('li')).toHaveCount(6)
    await expect(descriptions.locator('h4')).toHaveText(saved.scan.annotations.map((annotation: { label: string }) => annotation.label))
    await expect(descriptions.locator('.photo-component-number')).toHaveText(['1', '2', '3', '4', '5', '6'])
    await expect(descriptions.locator('li').first().locator('p')).toHaveText(saved.scan.annotations[0].description)
    await expect(descriptions.locator('li').nth(1).locator('p')).toContainText('cable and its housing')
    await expect(descriptions.locator('li').nth(2).locator('p')).toContainText('rear sprockets')
    await expect(descriptions.locator('li').nth(3).locator('p')).toContainText('front chainrings')
    await expect(descriptions.locator('li').nth(4).locator('p')).toContainText('pedaling force')
    await expect(descriptions.locator('li').nth(5).locator('p')).toContainText('Transfers pedaling force')
    await identified.screenshot({ path: testInfo.outputPath('identified-components.png') })
    await expect(components.locator('ol').getByRole('button')).toHaveCount(6)
    await photo.locator('img').evaluate((image: HTMLImageElement) => image.decode())
    const original = await photo.boundingBox()
    expect(original!.width / original!.height).toBeCloseTo(16 / 9, 1)
    const listBox = await components.boundingBox()
    expect(listBox!.y).toBeGreaterThanOrEqual(original!.y + original!.height)
    await expect(photo.locator('.detection-box:visible')).toHaveCount(6)
    await expect(photo.locator('.detection-box:visible > span')).toHaveText(['1', '2', '3', '4', '5', '6'])
    await expect(components.getByRole('button', { name: 'Show all', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(components.locator('ol [aria-pressed="true"]')).toHaveCount(6)
    await expect(photo.locator('.frame-annotations')).not.toContainText('Rear derailleur')
    await expect(components.getByRole('button', { name: 'Highlight Rear derailleur', exact: true })).toHaveAttribute('aria-pressed', 'true')

    const cassette = components.getByRole('button', { name: 'Highlight Rear cassette', exact: true })
    await cassette.click()
    await expect(cassette).toHaveAttribute('aria-pressed', 'true')
    await expect(photo.locator('.detection-box:visible > span')).toHaveText('3')
    await expect(components.locator('[aria-pressed="true"]')).toHaveCount(1)
    const chain = components.getByRole('button', { name: 'Highlight Chain', exact: true })
    await chain.focus()
    await page.keyboard.press('Enter')
    await expect(chain).toHaveAttribute('aria-pressed', 'true')
    await expect(photo.locator('.detection-box:visible > span')).toHaveText('6')
    await components.getByRole('button', { name: 'Show all', exact: true }).click()
    await expect(photo.locator('.detection-box:visible')).toHaveCount(6)
    await expect(components.locator('ol [aria-pressed="true"]')).toHaveCount(6)
    const selected = await photo.boundingBox()
    expect(selected!.height).toBeCloseTo(original!.height, 0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.inspection-preview .photo-figure').screenshot({ path: testInfo.outputPath('component-list.png') })
    await photo.getByRole('button', { name: 'Enlarge inspection photo' }).click()
    const viewer = page.getByRole('dialog', { name: 'Inspection photo', exact: true })
    await expect(viewer).toBeVisible()
    const viewerComponents = viewer.locator('.photo-components')
    await expect(viewerComponents.locator('ol').getByRole('button')).toHaveCount(6)
    await expect(viewer.locator('.detection-box:visible > span')).toHaveText(['1', '2', '3', '4', '5', '6'])
    await viewer.locator('img').evaluate((image: HTMLImageElement) => image.decode())
    async function expectAlignedBoxes() {
      await expect.poll(async () => viewer.locator('.photo-viewer-canvas').evaluate(canvas => {
        const image = canvas.querySelector('img')!
        const overlay = canvas.querySelector('.frame-annotations')!.getBoundingClientRect()
        const box = canvas.querySelector('.detection-box')!.getBoundingClientRect()
        const area = canvas.getBoundingClientRect()
        const scale = Math.min(area.width / image.naturalWidth, area.height / image.naturalHeight)
        const width = image.naturalWidth * scale, height = image.naturalHeight * scale
        return Math.max(
          Math.abs(overlay.width - width), Math.abs(overlay.height - height),
          Math.abs(overlay.x - area.x - (area.width - width) / 2),
          Math.abs(overlay.y - area.y - (area.height - height) / 2),
          Math.abs(box.x - overlay.x - width * .02), Math.abs(box.y - overlay.y - height * .5),
          Math.abs(box.width - width * .22), Math.abs(box.height - height * .28),
        )
      })).toBeLessThan(1)
    }
    await expectAlignedBoxes()
    const viewport = await viewer.locator('.photo-viewer-viewport').boundingBox()
    const legend = await viewerComponents.boundingBox()
    if (width > 700) expect(legend!.x).toBeGreaterThanOrEqual(viewport!.x + viewport!.width)
    else expect(legend!.y).toBeGreaterThanOrEqual(viewport!.y + viewport!.height)
    expect(viewport!.height).toBeGreaterThan(200)
    expect(await viewer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await viewer.screenshot({ path: testInfo.outputPath('enlarged-components.png') })
    await viewer.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(viewer.getByRole('status')).toHaveText('150%')
    await expectAlignedBoxes()
    await viewer.locator('.photo-viewer-viewport').evaluate(element => { element.scrollLeft = 50; element.scrollTop = 80 })
    await expectAlignedBoxes()
    await viewerComponents.getByRole('button', { name: 'Highlight Rear cassette', exact: true }).click()
    await expect(viewer.locator('.detection-box:visible > span')).toHaveText('3')
    await viewerComponents.getByRole('button', { name: 'Show all', exact: true }).click()
    await expect(viewer.locator('.detection-box:visible')).toHaveCount(6)
    await viewer.getByRole('button', { name: 'Zoom out', exact: true }).click()
    await expectAlignedBoxes()
    await viewerComponents.getByRole('button', { name: 'Highlight Chain', exact: true }).click()
    await expect(viewer.locator('.detection-box:visible > span')).toHaveText('6')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(photo.locator('.detection-box:visible > span')).toHaveText('6')
    await photo.getByRole('button', { name: 'Enlarge inspection photo' }).click()
    await expect(viewer.locator('.detection-box:visible > span')).toHaveText('6')
    await viewer.getByRole('button', { name: 'Close photo viewer' }).click()
  })
}
