import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from '../../../vendor/deepseek-harness/apps/web/node_modules/playwright/index.mjs'
import {
  launchWebScaffold, fixtureUserPrompts, type WebScaffold,
} from '../../../vendor/deepseek-harness/apps/web/tests/scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, probeFreePort } from '../../../vendor/deepseek-harness/apps/web/tests/support.ts'

let scaffold: WebScaffold
let browser: Browser
let page: Page
let temporary: string
let debugPort: number
const pageErrors: string[] = []

beforeAll(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'deepdeck-questions-'))
  const overlay = join(temporary, 'questions.yml')
  const plugin = fileURLToPath(new URL('../../../plugins/desktop-chrome', import.meta.url))
  const harnessHome = join(temporary, 'home')
  const pluginScope = join(harnessHome, 'profiles/scaffold/node_modules/@deepdeck')
  await mkdir(pluginScope, { recursive: true })
  await symlink(plugin, join(pluginScope, 'dsh-client-ui-desktop-chrome'), 'dir')
  await writeFile(overlay, `
- id: ui-layout
  name: '@deepseek-ai/dsh-client-ui-layout'
  disabled: true
- id: ui-sidebar
  name: '@deepseek-ai/dsh-client-ui-sidebar'
  disabled: true
- id: ui-settings-general
  name: '@deepseek-ai/dsh-client-ui-settings-general'
  disabled: true
- insert:
    - id: deepdeck-desktop-chrome
      name: '@deepdeck/dsh-client-ui-desktop-chrome'
`)
  scaffold = await launchWebScaffold({
    extraOverlayPath: overlay,
    // This product test submits custom answers and additional questions; keep
    // replay consumption checks without comparing its transcript to the stock UI golden.
    compareReplaySession: false,
    harnessHome,
    replayFixture: fileURLToPath(new URL('../../../vendor/deepseek-harness/snapshots/web/question-composer/session.v3.jsonl', import.meta.url)),
    paceMs: 15,
  })
  debugPort = await probeFreePort()
  browser = await chromium.launch({ channel: process.env.DEEPDECK_TEST_BROWSER_CHANNEL ?? 'chrome', args: [`--remote-debugging-port=${debugPort}`] })
  page = await newEnglishPage(browser)
  page.on('pageerror', error => { pageErrors.push(error.message); console.error(error.message) })
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()) })
  await page.goto(scaffold.authenticatedUrl)
  try {
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
  } catch (error) {
    console.error(await page.locator('body').innerText())
    await page.screenshot({ path: join(tmpdir(), 'deepdeck-question-boot.png') })
    throw error
  }
})

afterAll(async () => {
  await browser?.close()
  await scaffold?.close()
  if (temporary !== undefined) await rm(temporary, { recursive: true, force: true })
})

/** Measure visible bounds and actual pointer hit targets, independent of CSS hashes. */
async function expectActionsInsideCard() {
  const metrics = await page.locator('[data-question-key]').evaluate(frame => {
    const card = frame.querySelector('section')!
    const cardBox = card.getBoundingClientRect()
    const footer = card.querySelector('footer')!
    const buttons = [...footer.querySelectorAll('button')]
    return {
      cardWidth: cardBox.width,
      headingInset: card.querySelector('h2')!.getBoundingClientRect().left - cardBox.left,
      overflow: card.scrollWidth - card.clientWidth,
      buttons: buttons.map(button => {
        const box = button.getBoundingClientRect()
        const x = box.right - Math.min(4, box.width / 2)
        const y = box.top + box.height / 2
        const hit = document.elementFromPoint(x, y)
        return {
          label: button.textContent || button.getAttribute('aria-label'),
          inside: box.left >= cardBox.left && box.right <= cardBox.right
            && box.top >= cardBox.top && box.bottom <= cardBox.bottom
            && box.bottom <= innerHeight,
          hit: hit === button || (hit !== null && button.contains(hit)),
        }
      }),
    }
  })
  expect(metrics.overflow, JSON.stringify(metrics)).toBeLessThanOrEqual(1)
  expect(metrics.headingInset, JSON.stringify(metrics)).toBeLessThan(40)
  expect(metrics.buttons.length).toBe(4)
  for (const button of metrics.buttons) {
    expect(button.inside, JSON.stringify(metrics)).toBe(true)
    expect(button.hit, JSON.stringify(metrics)).toBe(true)
  }
  return metrics.cardWidth
}

it('keeps ordinary question actions reachable in a narrow desktop conversation', async () => {
  const settled = scaffold.whenTurnSettled()
  const input = page.locator('[contenteditable="true"]').first()
  await input.fill(fixtureUserPrompts(await readFile(new URL('../../../vendor/deepseek-harness/snapshots/web/question-composer/session.v3.jsonl', import.meta.url), 'utf8'))[0]!)
  await input.press('Enter')
  const composer = page.locator('[data-question-key]')
  await composer.waitFor({ timeout: 30_000 })
  // This attribute is emitted only by the desktop renderer, proving the slot wins.
  expect(await composer.locator('[role="status"]').getAttribute('hidden')).not.toBeNull()

  for (const width of [1200, 900, 600, 420, 360]) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(500)
    await expectActionsInsideCard()
  }
  await page.setViewportSize({ width: 600, height: 440 })
    await page.waitForTimeout(500)
  await expectActionsInsideCard()
  await page.setViewportSize({ width: 420, height: 900 })
    await page.waitForTimeout(500)
  await composer.getByRole('checkbox', { name: 'Blue' }).click()
  await composer.getByRole('textbox').fill('Keep this draft after collapsing')
  await composer.getByRole('button', { name: 'Collapse the question card' }).click()
  expect(await composer.getByRole('textbox').count()).toBe(0)
  await composer.getByRole('button', { name: 'Expand the question card' }).click()
  expect(await composer.getByRole('checkbox', { name: 'Blue' }).getAttribute('aria-checked')).toBe('true')
  expect(await composer.getByRole('textbox').inputValue()).toBe('Keep this draft after collapsing')
  await composer.getByRole('button', { name: 'Submit', exact: true }).click()
  const sessionId = await settled
  await composer.waitFor({ state: 'detached' })

  const agent = scaffold.ctx.agents.get(sessionId)!
  const login = scaffold.ctx.userQuestions.ask({ agent, questions: [{
    id: 'login', header: 'NGA 登录',
    question: '登录页面已交给你（默认是 App 扫码，也可点“使用密码登录”）。完成登录后请选择：',
    options: [
      { label: '已登录，继续 (Recommended)', description: '我将重新接管页面并验证登录状态。' },
      { label: '取消', description: '停止登录流程。' },
    ],
  }] })
  await composer.waitFor()
  await page.setViewportSize({ width: 600, height: 440 })
    await page.waitForTimeout(500)
  await expectActionsInsideCard()
  await page.setViewportSize({ width: 420, height: 900 })
    await page.waitForTimeout(500)
  await expectActionsInsideCard()
  await composer.getByRole('radio', { name: '已登录，继续', exact: true }).click()
  const screenshot = process.env.DEEPDECK_QUESTION_SCREENSHOT ?? join(tmpdir(), 'deepdeck-question-fixed.png')
  await composer.screenshot({ path: screenshot })
  console.log(`Question card screenshot: ${screenshot}`)
  if (process.env.DEEPDECK_AGENT_BROWSER !== undefined) {
    const { stdout } = await promisify(execFile)(process.execPath, [
      process.env.DEEPDECK_AGENT_BROWSER, '--session', 'deepdeck-question-check',
      '--cdp', `http://127.0.0.1:${debugPort}`, 'snapshot', '-i',
    ])
    console.log(stdout)
  }
  await composer.getByRole('button', { name: 'Submit', exact: true }).click()
  expect(await login).toEqual({ answers: [{ id: 'login', selected: ['已登录，继续 (Recommended)'] }] })
  await composer.waitFor({ state: 'detached' })

  const free = scaffold.ctx.userQuestions.ask({ agent, questions: [
    { id: 'free', question: 'Anything else?' },
    { id: 'more', question: 'One more answer?' },
  ] })
  await composer.waitFor()
  expect(await composer.getByRole('button', { name: 'Next', exact: true }).isDisabled()).toBe(true)
  await expectActionsInsideCard()
  await composer.getByRole('textbox').fill('A long answer\n'.repeat(20))
  await composer.getByRole('button', { name: 'Next', exact: true }).click()
  await composer.getByRole('button', { name: 'Skip this question' }).click()
  expect(await free).toEqual({ answers: [
    { id: 'free', selected: [], custom: 'A long answer\n'.repeat(20).trim() },
    { id: 'more', selected: [] },
  ] })
  await composer.waitFor({ state: 'detached' })
  const plan = scaffold.ctx.userQuestions.ask({ agent, questions: [{
    id: 'review', question: 'Review this plan', detail: 'A plan for the fixture.',
    intent: { kind: 'plan-review', approve: 'Proceed' },
    options: [{ label: 'Proceed' }, { label: 'Decline' }],
  }] })
  const review = page.locator('[data-plan-review-key]')
  await review.waitFor()
  expect(await composer.count()).toBe(0)
  await review.getByRole('button', { name: 'Refuse', exact: true }).click()
  expect(await plan).toEqual({ answers: [{ id: 'review', selected: ['Decline'] }] })
  await review.waitFor({ state: 'detached' })
  expect(pageErrors).toEqual([])
})
