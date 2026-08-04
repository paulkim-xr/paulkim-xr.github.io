import { expect, test, type Page } from '@playwright/test'

/** Generous: SwiftShader on a CI runner is an order of magnitude slower than a GPU. */
const SETTLE = { timeout: 15_000 }

/**
 * Fails the test on any console error or uncaught exception.
 *
 * Worth its own fixture because this app can fail while looking fine: a
 * three.js error leaves the canvas showing the last good frame, so every
 * structural assertion below would still pass over a frozen picture.
 */
function watchForErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function openHub(page: Page) {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
  await expect(page.locator('canvas')).toBeVisible()
}

test.describe('the hub', () => {
  test('draws a canvas and keeps it moving', async ({ page }) => {
    const errors = watchForErrors(page)
    await openHub(page)

    // The idle wiggle and spin mean two frames a moment apart can never be
    // identical. If they are, the render loop has stopped.
    const first = await page.screenshot()
    await page.waitForTimeout(500)
    const second = await page.screenshot()

    expect(first.equals(second), 'the hub stopped animating').toBe(false)
    expect(errors).toEqual([])
  })

  test('stepping morphs to the next project and changes the picture', async ({ page }) => {
    const errors = watchForErrors(page)
    await openHub(page)
    await expect(page.locator('html')).toHaveAttribute('data-project', 'papercup')

    const before = await page.screenshot()
    await page.keyboard.press('ArrowRight')

    await expect(page.locator('html')).toHaveAttribute('data-project', 'skiwatch', SETTLE)
    // Long enough for the morph to finish, so this compares two settled shapes
    // rather than catching the same one twice.
    await page.waitForTimeout(2500)

    expect((await page.screenshot()).equals(before)).toBe(false)
    expect(errors).toEqual([])
  })

  test('stepping backwards wraps to the last project', async ({ page }) => {
    await openHub(page)
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('html')).toHaveAttribute(
      'data-project',
      'gravity',
      SETTLE,
    )
  })
})

test.describe('entering and leaving a room', () => {
  test('enter opens the room, escape comes back', async ({ page }) => {
    const errors = watchForErrors(page)
    await openHub(page)

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/p/papercup', SETTLE)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)

    await page.keyboard.press('Escape')
    await expect(page).toHaveURL('/', SETTLE)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)

    expect(errors).toEqual([])
  })

  test('the browser back button leaves the room too', async ({ page }) => {
    await openHub(page)
    await page.keyboard.press('Enter')
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)

    await page.goBack()

    await expect(page).toHaveURL('/', SETTLE)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
  })
})

test.describe('deep links', () => {
  test('a project URL opens straight into that room', async ({ page }) => {
    const errors = watchForErrors(page)

    await page.goto('/p/skiwatch')

    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)
    await expect(page).toHaveURL('/p/skiwatch')
    await expect(page.locator('canvas')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('an unknown project falls back to the hub instead of a dead end', async ({ page }) => {
    await page.goto('/p/not-a-real-project')

    await expect(page).toHaveURL('/', SETTLE)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
  })

  test('the redirect shim hands an encoded path back to the router', async ({ page }) => {
    // What GitHub Pages produces for a deep link: 404.html rewrites the path
    // into the query string, and the decoder in index.html puts it back before
    // the router reads location. Only the decode half is exercised here —
    // `vite preview` has its own SPA fallback, so 404.html never fires.
    await page.goto('/?/p/papercup')

    await expect(page).toHaveURL('/p/papercup', SETTLE)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)
  })
})

test.describe('the lab', () => {
  test('circles and gravity each load a canvas of their own', async ({ page }) => {
    for (const path of ['/lab/circles', '/lab/gravity']) {
      const errors = watchForErrors(page)
      await page.goto(path)

      await expect(page.getByTestId('lab-canvas')).toBeVisible(SETTLE)
      await expect(page).toHaveURL(path)
      expect(errors, `${path} logged errors`).toEqual([])
    }
  })

  test('gravity keeps simulating rather than freezing on the first frame', async ({ page }) => {
    await page.goto('/lab/gravity')
    await expect(page.getByTestId('lab-canvas')).toBeVisible(SETTLE)
    await page.waitForTimeout(1200)

    const first = await page.screenshot()
    await page.waitForTimeout(700)

    expect(first.equals(await page.screenshot()), 'the simulation stopped').toBe(false)
  })

  test('a lab piece is reached through its room, like any other project', async ({ page }) => {
    // The lab used to have two links pinned in the corner of the hub, which
    // offered a second route to projects that already had a place in the
    // carousel. The room is now the only way in.
    await openHub(page)
    await expect(page.locator('nav')).toHaveCount(0)

    await page.goto('/p/circles')
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)

    await page.getByTestId('exit-room').click()
    await expect(page).toHaveURL('/', SETTLE)
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
  })
})

/**
 * Counts pixels that are not the background, read straight out of the drawing
 * buffer.
 *
 * `drawImage` onto a 2D canvas is no good here: the WebGL buffer is cleared on
 * composite, so it reads back empty even when the frame drew fine. Reading
 * inside a rAF callback, which runs after the renderer's own, sees the frame
 * that is actually on screen.
 */
async function litPixels(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector('canvas')
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
        if (!canvas || !gl) return resolve(-1)

        requestAnimationFrame(() => {
          const pixels = new Uint8Array(canvas.width * canvas.height * 4)
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          let count = 0
          // The clear colour is #08080c, so anything meaningfully above it is
          // something that was drawn.
          for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 24 || pixels[i + 1] > 24 || pixels[i + 2] > 24) count++
          }
          resolve(count)
        })
      }),
  )
}

test.describe('when an asset does not arrive', () => {
  /**
   * The whole scene lives inside one Suspense boundary — R3F's Canvas supplies
   * it — and drei's Text suspends until troika has fetched and parsed the font.
   * So a single failed request for a 400 kB TTF used to blank the entire
   * canvas, permanently, while the DOM around it carried on looking healthy.
   * Reported from a phone as the hub never rendering at all.
   */
  test('a font that never loads costs the caption, not the scene', async ({ page }) => {
    await page.route('**/fonts/*.ttf', (route) => route.abort('failed'))

    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
    await page.waitForTimeout(3000)

    expect(await litPixels(page), 'the canvas drew nothing at all').toBeGreaterThan(500)
  })

  test('a font that never answers costs the caption, not the scene', async ({ page }) => {
    // Troika never settles its promise on a load that hangs, so this is the
    // failure that suspends forever rather than throwing.
    await page.route('**/fonts/*.ttf', () => new Promise(() => {}))

    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
    await page.waitForTimeout(3000)

    expect(await litPixels(page), 'the canvas drew nothing at all').toBeGreaterThan(500)
  })
})
