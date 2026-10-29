import { readFile } from 'node:fs/promises'

import { expect, test } from '#tests/e2e/fixtures'
import { CanvasHelper } from '#tests/helpers/canvas'
import { mockFontsource } from '#tests/helpers/fonts/fontsource'

const MESSAGE = 'A sentence long enough that it has to wrap onto a second line.'

test('wrapped text keeps its lines after a .fig is saved and reopened (#914)', async ({ page }) => {
  await page.goto('/?test&no-chrome&no-rulers')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  await page.evaluate((message) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Editor unavailable')
    const card = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'Card',
      width: 260,
      height: 52,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true, opacity: 1 }]
    })
    store.graph.createNode('TEXT', card.id, {
      name: 'Message',
      text: message,
      x: 10,
      y: 10,
      width: 230,
      height: 32,
      fontFamily: 'Inter',
      fontSize: 13,
      lineHeight: { value: 16, unit: 'PIXELS' },
      textAutoResize: 'HEIGHT',
      fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 }, visible: true, opacity: 1 }]
    })
  }, MESSAGE)

  const picker = await page.evaluateHandle(() => {
    const original = window.showSaveFilePicker
    window.showSaveFilePicker = undefined
    return {
      restore: () => {
        window.showSaveFilePicker = original
      }
    }
  })
  let bytes: number[]
  try {
    page.once('dialog', (dialog) => dialog.accept('Card.fig'))
    const download = page.waitForEvent('download')
    await page.evaluate(() => window.openPencil?.getStore?.().saveFigFileAs())
    bytes = [...(await readFile(await (await download).path()))]
  } finally {
    await picker.evaluate((handle) => handle.restore())
    await picker.dispose()
  }

  const lines = await page.evaluate(async (saved) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Editor unavailable')
    await store.openFigFile(new File([new Uint8Array(saved)], 'Card.fig'))
    const message = [...store.graph.nodes.values()].find((node) => node.name === 'Message')
    store.requestRender()
    return new Set(message?.derivedTextGlyphs?.map((glyph) => glyph.y)).size
  }, bytes)
  expect(lines).toBe(2)
  await canvas.waitForRender()
  expect(await canvas.screenshotCanvasRegion()).toMatchSnapshot('reopened-wrapped-text.png')
})

test('fallback text with an unloaded primary keeps its weight after saving and reopening', async ({
  page
}) => {
  await mockFontsource(page, [])
  await page.goto('/?test&no-chrome&no-rulers')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  const result = await page.evaluate(async () => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('Editor unavailable')
    const frame = store.graph.createNode('FRAME', store.state.currentPageId, {
      name: 'Font file regression',
      width: 320,
      height: 100,
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true, opacity: 1 }]
    })
    const sample = store.graph.createNode('TEXT', frame.id, {
      name: 'Fallback sample',
      text: 'Missing',
      x: 20,
      y: 20,
      width: 280,
      height: 60,
      fontFamily: 'Saved Text Primary',
      fontWeight: 700,
      fontSize: 40,
      textAutoResize: 'NONE',
      fills: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 }, visible: true, opacity: 1 }]
    })
    let saved: Uint8Array | undefined
    await store.saveFigFileCopy(async (bytes) => {
      saved = bytes
    })
    if (!saved) throw new Error('Save did not produce a file')
    await store.openFigFile(new File([new Uint8Array(saved)], 'Fallback.fig'))
    store.centerOn(160, 50, 1)
    store.requestRender()
    const reopened = store.graph.getNode(sample.id)
    return { text: reopened?.text, glyphs: reopened?.derivedTextGlyphs?.length }
  })
  expect(result).toEqual({ text: 'Missing', glyphs: 7 })
  await canvas.waitForRender()
  canvas.assertNoErrors()
  // Text fills too little of the canvas for the default percentage tolerance to catch bad outlines.
  expect(await canvas.screenshotCanvasRegion()).toMatchSnapshot('fallback-file-after-reopen.png', {
    maxDiffPixels: 20
  })
})
