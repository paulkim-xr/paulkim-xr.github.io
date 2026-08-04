import { expect, test, type Page } from '@playwright/test'

/** Generous: SwiftShader on a CI runner is an order of magnitude slower than a GPU. */
const SETTLE = { timeout: 15_000 }

/**
 * Waits until the hub is actually listening, not merely present.
 *
 * `data-phase` is written by an effect in App, which runs before the Canvas
 * has mounted its children — so the hub's pointer listeners are not bound yet.
 * A gesture sent on that signal alone lands on nothing and the test fails
 * describing a bug that is not there.
 */
async function openHub(page: Page) {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(2000)
}

/** Press, travel, release — the gesture that browses. */
async function drag(page: Page, from: number, to: number) {
  const y = page.viewportSize()!.height / 2
  const towards = to > from ? 20 : -20

  await page.mouse.move(from, y)
  await page.mouse.down()
  for (let x = from; towards > 0 ? x <= to : x >= to; x += towards) {
    await page.mouse.move(x, y)
  }
  await page.mouse.up()
}

test.describe('browsing with a finger', () => {
  /**
   * The bug this exists for: a browser dispatches `click` on pointer-up
   * however far the pointer travelled, so every swipe also selected whatever
   * it happened to finish on top of. Swiping is the only way to browse on a
   * phone, so the site opened a room on the way past every project.
   */
  test('a swipe browses without also entering a room', async ({ page }) => {
    await openHub(page)
    await expect(page.locator('html')).toHaveAttribute('data-project', 'papercup')

    await drag(page, 320, 60)

    // It browsed...
    await expect(page.locator('html')).not.toHaveAttribute('data-project', 'papercup', SETTLE)
    // ...and stayed in the hub.
    await page.waitForTimeout(1200)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing')
    await expect(page).toHaveURL('/')
  })

  test('a tap still enters the room it lands on', async ({ page }) => {
    await openHub(page)
    const size = page.viewportSize()!

    await page.mouse.click(size.width / 2, size.height / 2)

    await expect(page).toHaveURL('/p/papercup', SETTLE)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)
  })

  test('a room can be left without a keyboard', async ({ page }) => {
    // Escape was the only way out, which is no way out on a phone.
    await page.goto('/p/papercup')
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)

    await page.getByTestId('exit-room').click()

    await expect(page).toHaveURL('/', SETTLE)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
  })

  test('every canvas claims touch gestures rather than leaving them to the browser', async ({
    page,
  }) => {
    // Without this the browser pans and pull-to-refreshes on a horizontal
    // drag, and the page never sees the gesture at all. The lab pages are
    // included because OrbitControls writes `touch-action: auto` inline on the
    // canvas, which silently beat the stylesheet until the rule was forced.
    for (const path of ['/', '/lab/circles', '/lab/gravity']) {
      await page.goto(path)
      await expect(page.locator('canvas')).toBeVisible(SETTLE)
      await page.waitForTimeout(500)

      const touchAction = await page
        .locator('canvas')
        .evaluate((canvas) => getComputedStyle(canvas).touchAction)

      expect(touchAction, `${path} let the browser keep touch gestures`).toBe('none')
    }
  })
})

test.describe('portrait framing', () => {
  test('the lab pieces render on a phone without erroring', async ({ page }) => {
    for (const path of ['/lab/circles', '/lab/gravity']) {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))

      await page.goto(path)
      await expect(page.getByTestId('lab-canvas')).toBeVisible(SETTLE)
      await page.waitForTimeout(800)

      expect(errors, `${path} threw`).toEqual([])
    }
  })
})
