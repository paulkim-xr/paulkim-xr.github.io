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

type Frame = {
  /** Pixels meaningfully brighter than the clear colour — i.e. drawn. */
  lit: number
  /** Mean channel value across the frame, 0-255. */
  brightness: number
}

/**
 * Reads the frame that is actually on screen, straight out of the drawing
 * buffer.
 *
 * `drawImage` onto a 2D canvas is no good here: the WebGL buffer is cleared on
 * composite, so it reads back empty even when the frame drew fine. Reading
 * inside a rAF callback, which runs after the renderer's own, sees the real
 * thing.
 */
async function readFrame(page: Page): Promise<Frame> {
  return page.evaluate(
    () =>
      new Promise<{ lit: number; brightness: number }>((resolve) => {
        const canvas = document.querySelector('canvas')
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
        if (!canvas || !gl) return resolve({ lit: -1, brightness: -1 })

        requestAnimationFrame(() => {
          const pixels = new Uint8Array(canvas.width * canvas.height * 4)
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

          let lit = 0
          let total = 0
          for (let i = 0; i < pixels.length; i += 4) {
            // The clear colour is #08080c, so anything meaningfully above it is
            // something that was drawn.
            if (pixels[i] > 24 || pixels[i + 1] > 24 || pixels[i + 2] > 24) lit++
            total += pixels[i] + pixels[i + 1] + pixels[i + 2]
          }
          resolve({ lit, brightness: total / (canvas.width * canvas.height * 3) })
        })
      }),
  )
}

const litPixels = async (page: Page) => (await readFrame(page)).lit

/**
 * Mean brightness of a horizontal band of the frame, given as fractions of the
 * height measured from the top.
 *
 * Useful for asking where something is rather than whether it is there at all.
 */
async function bandBrightness(page: Page, from: number, to: number): Promise<number> {
  return page.evaluate(
    ([top, bottom]) =>
      new Promise<number>((resolve) => {
        const canvas = document.querySelector('canvas')
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')
        if (!canvas || !gl) return resolve(-1)

        requestAnimationFrame(() => {
          // readPixels counts rows from the bottom, so a band measured from the
          // top has to be flipped before it is asked for.
          const height = Math.max(1, Math.round((bottom - top) * canvas.height))
          const y = Math.round((1 - bottom) * canvas.height)
          const pixels = new Uint8Array(canvas.width * height * 4)
          gl.readPixels(0, y, canvas.width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

          let total = 0
          for (let i = 0; i < pixels.length; i += 4) {
            total += pixels[i] + pixels[i + 1] + pixels[i + 2]
          }
          resolve(total / (canvas.width * height * 3))
        })
      }),
    [from, to] as const,
  )
}

test.describe('the way into a room', () => {
  /** Above this the frame is overwhelmingly white rather than merely lit. */
  const WHITE = 200

  /**
   * Resolves when the machine reaches `phase`, watched from inside the page.
   *
   * Polling from the test would miss it: a whole transition is over in about a
   * second and a half, and every round trip costs a slice of that.
   */
  function reaches(page: Page, phase: string) {
    return page.locator('html').evaluate(
      (html, wanted) =>
        new Promise<void>((resolve) => {
          if (html.dataset.phase === wanted) return resolve()
          new MutationObserver((_records, observer) => {
            if (html.dataset.phase !== wanted) return
            observer.disconnect()
            resolve()
          }).observe(html, { attributes: true, attributeFilter: ['data-phase'] })
        }),
      phase,
    )
  }

  /**
   * The brightest frame seen before `work` finishes.
   *
   * Sampling stops early once the frame is white enough to settle the question,
   * but `work` is still awaited — a page.evaluate left pending when the test
   * ends is reported as a worker error rather than a failure, which is a
   * confusing way to find out a helper leaked.
   */
  async function peakBrightness(page: Page, work: Promise<unknown>): Promise<number> {
    let peak = 0
    let done = false
    const settled = work.then(() => {
      done = true
    })

    while (!done && peak < WHITE) {
      peak = Math.max(peak, (await readFrame(page)).brightness)
    }

    await settled
    return peak
  }

  test('the picked shape whitens and swallows the view on the way in', async ({ page }) => {
    // Selecting used to fade the screen to black. It now turns the chosen shape
    // into a white mask and grows it until it has taken the whole frame, so the
    // room opens out of white — this fails over a black fade.
    await openHub(page)
    expect((await readFrame(page)).brightness, 'the hub is meant to be a dark scene').toBeLessThan(
      60,
    )

    const entered = reaches(page, 'inRoom')
    await page.keyboard.press('Enter')

    expect(
      await peakBrightness(page, entered),
      'the transition never went through white',
    ).toBeGreaterThan(WHITE)
  })

  test('leaving goes through white as well', async ({ page }) => {
    await page.goto('/p/papercup')
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)

    const left = reaches(page, 'browsing')
    await page.getByTestId('exit-room').click()

    expect(await peakBrightness(page, left), 'the exit never went through white').toBeGreaterThan(
      WHITE,
    )
  })
})

test.describe('the spherical viewing room', () => {
  /**
   * How the hub's frame is weighted top against bottom.
   *
   * The shape sits above the caption, so an upright hub is heavier at the top.
   * Rolled over, the weighting inverts. A ratio rather than a level because the
   * absolute brightness depends on which shape is showing, and the point is
   * only which way up it is.
   */
  async function topHeaviness(page: Page): Promise<number> {
    const top = await bandBrightness(page, 0.05, 0.22)
    const bottom = await bandBrightness(page, 0.78, 0.95)
    return top / bottom
  }

  async function enterTheRoom(page: Page) {
    await page.goto('/p/svr')
    await expect(page.locator('html')).toHaveAttribute('data-phase', 'inRoom', SETTLE)
    await expect(page.locator('canvas')).toBeVisible()
    // Long enough for the model to arrive and the reveal to finish.
    await page.waitForTimeout(2500)
  }

  test('opens into a room with something drawn in it', async ({ page }) => {
    const errors = watchForErrors(page)
    await enterTheRoom(page)

    expect(await litPixels(page), 'the room drew nothing').toBeGreaterThan(2000)
    expect(errors).toEqual([])
  })

  test('walking changes what the object looks like', async ({ page }) => {
    await enterTheRoom(page)
    const before = await page.screenshot()

    // Far enough to be a different side of the object, not a wobble.
    await page.keyboard.down('ArrowDown')
    await page.waitForTimeout(1200)
    await page.keyboard.up('ArrowDown')
    await page.waitForTimeout(400)

    expect((await page.screenshot()).equals(before), 'walking moved nothing').toBe(false)
  })

  test('the room keeps the arrow keys to itself', async ({ page }) => {
    // The arrows used to step the hub in every phase, so walking a room also
    // silently reordered the carousel behind it — you came back out facing a
    // different project than the one you went in from.
    await enterTheRoom(page)
    await expect(page.locator('html')).toHaveAttribute('data-project', 'svr')

    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')

    await expect(page.locator('html')).toHaveAttribute('data-project', 'svr')
  })

  test('leaving hands the hub back the right way up', async ({ page }) => {
    // Walking tips the camera's up-vector over and leaves it there. Every
    // lookAt in the app reads that vector, so without putting it back the hub
    // returns upside down.
    async function leaveAndMeasure(walkFor: number) {
      await enterTheRoom(page)
      if (walkFor > 0) {
        // Past a quarter turn, deliberately. Up to that point the leftover
        // up-vector still projects onto roughly world-up and the hub comes back
        // looking fine, so a shorter walk proves nothing. Past it, the vector
        // swings through the view axis — where lookAt is degenerate — and out
        // the far side pointing down, which is where the bug actually shows.
        await page.keyboard.down('ArrowDown')
        await page.waitForTimeout(walkFor)
        await page.keyboard.up('ArrowDown')
      }
      await page.getByTestId('exit-room').click()
      await expect(page.locator('html')).toHaveAttribute('data-phase', 'browsing', SETTLE)
      await page.waitForTimeout(2000)
      return topHeaviness(page)
    }

    // The control is the same room and the same shape, left without walking —
    // not a fresh hub, which is showing a different project entirely and is no
    // basis for comparison.
    const withoutWalking = await leaveAndMeasure(0)
    const afterWalking = await leaveAndMeasure(2400)

    expect(
      afterWalking,
      'the hub came back rolled over — it is weighted the wrong way up',
    ).toBeGreaterThan(withoutWalking * 0.8)
  })
})

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
