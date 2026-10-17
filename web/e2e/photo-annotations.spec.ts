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
    saved.scan.component = 'Rear derailleur'
    saved.scan.model = 'Shimano 105 RD-R7100'
    saved.scan.summary = Array(12).fill('The drivetrain includes a rear derailleur, cassette, chain, crankset, front derailleur, rear wheel, and frame.').join(' ')
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
    if (width <= 700) expect(original!.width / original!.height).toBeCloseTo(16 / 9, 1)
    else {
      await expect.poll(async () => {
        const figure = await page.locator('.inspection-preview .photo-figure').boundingBox()
        const note = await page.locator('.inspection-context .agent-note').boundingBox()
        return Math.abs(figure!.y + figure!.height - note!.y - note!.height)
      }).toBeLessThan(1)
      // A long note grows the photo frame; the overlay must still fit the contained photo.
      expect(original!.height).toBeGreaterThan(original!.width * 9 / 16)
      await expect.poll(() => photo.locator('.frame-annotations').evaluate(overlay => {
        const image = overlay.parentElement!.querySelector('img')!
        const bounds = overlay.getBoundingClientRect()
        return Math.abs(bounds.width / bounds.height - image.naturalWidth / image.naturalHeight)
      })).toBeLessThan(.01)
    }
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

    await page.getByRole('button', { name: 'Explore equipment' }).click()
    const componentCard = page.locator('.component-card')
    const understandComponents = page.locator('.understand-details .photo-components')
    const understandPhoto = page.locator('.image-panel .visual-frame')
    async function expectDescriptionFollowsDetails() {
      const gaps = await componentCard.evaluate(card => {
        const divider = card.querySelector('.component-line')!
        const details = divider.previousElementSibling!.getBoundingClientRect()
        const line = divider.getBoundingClientRect()
        const description = divider.nextElementSibling!.getBoundingClientRect()
        return { before: line.top - details.bottom, after: description.top - line.bottom }
      })
      expect(gaps.before).toBeGreaterThanOrEqual(0)
      expect(gaps.before).toBeLessThanOrEqual(24)
      expect(gaps.after).toBeGreaterThanOrEqual(0)
      expect(gaps.after).toBeLessThanOrEqual(20)
    }
    await expect(componentCard.getByRole('heading')).toHaveText('Chain')
    await expect(componentCard).toContainText('Transfers pedaling force')
    await expectDescriptionFollowsDetails()
    await componentCard.screenshot({ path: testInfo.outputPath('component-without-model.png') })
    await expect(componentCard).not.toContainText('Exact model unknown')
    await expect(componentCard.locator(':scope > p')).toHaveCount(1)
    await expect(componentCard).not.toContainText(saved.scan.model)
    await expect(page.locator('.image-panel .photo-components')).toHaveCount(0)
    const cardBounds = await componentCard.boundingBox()
    const listBounds = await understandComponents.boundingBox()
    const imageBounds = await page.locator('.image-panel').boundingBox()
    expect(listBounds!.y - cardBounds!.y - cardBounds!.height).toBeGreaterThanOrEqual(0)
    expect(listBounds!.y - cardBounds!.y - cardBounds!.height).toBeLessThan(20)
    expect(listBounds!.x).toBeCloseTo(cardBounds!.x, 0)
    if (width > 950) {
      expect(listBounds!.x).toBeGreaterThanOrEqual(imageBounds!.x + imageBounds!.width)
      expect(cardBounds!.y).toBeCloseTo(imageBounds!.y, 0)
      expect(listBounds!.y).toBeLessThan(imageBounds!.y + imageBounds!.height)
      expect(listBounds!.y + listBounds!.height).toBeCloseTo(imageBounds!.y + imageBounds!.height, 0)
    } else expect(cardBounds!.y).toBeGreaterThanOrEqual(imageBounds!.y + imageBounds!.height)
    await page.locator('.understand-grid').screenshot({ path: testInfo.outputPath('understand-component-layout.png') })

    await understandComponents.getByRole('button', { name: 'Highlight Rear derailleur', exact: true }).click()
    await expect(componentCard.getByRole('heading')).toHaveText('Rear derailleur')
    await expect(componentCard).toContainText(saved.scan.model)
    await expect(componentCard).toContainText(saved.scan.annotations[0].description)
    await expect(componentCard.locator(':scope > p')).toHaveCount(2)
    await expectDescriptionFollowsDetails()
    await componentCard.screenshot({ path: testInfo.outputPath('component-with-model.png') })
    await expect(understandPhoto.locator('.detection-box:visible > span')).toHaveText('1')

    const understandCassette = understandComponents.getByRole('button', { name: 'Highlight Rear cassette', exact: true })
    await understandCassette.focus()
    await page.keyboard.press('Enter')
    await expect(componentCard.getByRole('heading')).toHaveText('Rear cassette')
    await expect(componentCard).toContainText('rear sprockets provide different gear ratios')
    await expect(componentCard).not.toContainText('Exact model unknown')
    await expect(componentCard.locator(':scope > p')).toHaveCount(1)
    await expect(componentCard).not.toContainText(saved.scan.model)
    await expect(understandPhoto.locator('.detection-box:visible > span')).toHaveText('3')

    await understandComponents.getByRole('button', { name: 'Show all', exact: true }).click()
    await expect(componentCard.getByRole('heading')).toHaveText(saved.scan.component)
    await expect(componentCard).toContainText(saved.scan.model)
    await expect(componentCard).toContainText(saved.scan.summary)
    await expect(understandPhoto.locator('.detection-box:visible')).toHaveCount(6)

    await page.getByRole('navigation', { name: 'Inspection workflow' }).getByRole('button', { name: /Observe/ }).click()
    await expect(photo.locator('.detection-box:visible')).toHaveCount(6)
    await page.getByRole('button', { name: 'Explore equipment' }).click()
    await expect(understandPhoto.locator('.detection-box:visible > span')).toHaveText('1')
    await expect(understandComponents.locator('ol [aria-pressed="true"]')).toHaveCount(1)
    await expect(understandComponents.getByRole('button', { name: 'Show all', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(componentCard.getByRole('heading')).toHaveText(saved.scan.annotations[0].label)

    await page.reload()
    await expect(understandPhoto.locator('.detection-box:visible > span')).toHaveText('1')
    await expect(componentCard.getByRole('heading')).toHaveText(saved.scan.annotations[0].label)
    await understandComponents.getByRole('button', { name: 'Highlight Chain', exact: true }).click()
    await expect(understandPhoto.locator('.detection-box:visible > span')).toHaveText('6')
    await expect(componentCard.getByRole('heading')).toHaveText('Chain')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const { width, portrait } of [
  { width: 1440, portrait: true },
  { width: 1440, portrait: false },
  { width: 390, portrait: true },
]) {
  test(`Understand cards scroll independently for a ${portrait ? 'portrait' : 'landscape'} photo at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    const created = await request.post('http://127.0.0.1:8011/api/v1/cases', { multipart: portrait ? {
      source: 'upload', symptom: 'Clicking while shifting.',
      image: { name: 'iphone-photo.heic', mimeType: 'image/heic', buffer: await readFile('../app/tests/fixtures/iphone-photo.heic') },
    } : { source: 'sample', symptom: 'Clicking while shifting.' } })
    expect(created.status()).toBe(201)
    const saved = await created.json()
    saved.available_stages = ['observe', 'understand']
    saved.scan = {
      recognized: true, equipment: 'Road bicycle', component: 'Component 1', model: null, confidence: 84,
      summary: 'The bicycle drivetrain is visible.',
      annotations: Array.from({ length: 40 }, (_, index) => ({
        label: `Component ${index + 1}`,
        description: `Component ${index + 1}: ` + 'This part transfers pedaling force through the bicycle drivetrain. '.repeat(30),
        box: [200, 200, 700, 700],
      })),
    }
    await page.route(`**/api/v1/cases/${saved.id}`, route => route.fulfill({ json: saved }))
    await page.goto(`/?case=${saved.id}&stage=understand`)
    const photo = page.locator('.understand-grid .image-panel')
    await photo.locator('img').evaluate((image: HTMLImageElement) => image.decode())
    const identified = page.getByRole('region', { name: 'Identified component', exact: true })
    const detected = page.getByRole('region', { name: 'Detected components', exact: true })
    const photoBounds = await photo.boundingBox()
    const identifiedBounds = await identified.boundingBox()
    const detectedBounds = await detected.boundingBox()
    if (width > 950) {
      expect(identifiedBounds!.y).toBeCloseTo(photoBounds!.y, 0)
      expect(detectedBounds!.y + detectedBounds!.height).toBeCloseTo(photoBounds!.y + photoBounds!.height, 0)
    }
    for (const card of [identified, detected]) {
      expect(await card.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
      await card.focus()
      await page.keyboard.press('End')
      await expect.poll(() => card.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    }
    await detected.getByRole('button', { name: 'Highlight Component 40', exact: true }).click()
    await expect(identified.getByRole('heading')).toHaveText('Component 40')
    await expect(identified).toContainText(saved.scan.annotations[39].description)
    await expect.poll(() => identified.evaluate(element => element.scrollTop)).toBe(0)
    await expect(photo.locator('.detection-box:visible > span')).toHaveText('40')
    const finalBounds = await page.locator('.understand-details').boundingBox()
    if (width > 950) expect(finalBounds!.height).toBeCloseTo(photoBounds!.height, 0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('.understand-grid').screenshot({ path: testInfo.outputPath('scrollable-component-cards.png') })
  })
}
