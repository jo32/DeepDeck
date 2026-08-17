/**
 * DeepDeck Agent-preset presentation enhancement.
 *
 * The upstream plugin remains the sole owner of loading, selection, copying,
 * viewing, deletion, and Creator-mode session staging. This plugin decorates
 * the mounted settings surface through its stable settings-slot anchor, so an
 * upstream update can still replace the whole behavior without carrying a
 * fork in vendor/.
 */

import css from './styles.module.css'

type LocaleId = 'zh' | 'en'

interface LocaleSnapshot {
  readonly active: string
}

interface LocaleFace {
  getSnapshot: () => LocaleSnapshot
  subscribe: (listener: () => void) => () => void
}

interface ClientContext {
  readonly locale: LocaleFace
  effect: (setup: () => void | (() => void), label?: string) => void
}

interface ModeCopy {
  readonly introduction: string
  readonly example: string
}

interface PageCopy {
  readonly intro: string
  readonly introductionLabel: string
  readonly exampleLabel: string
  readonly modes: Readonly<Record<string, ModeCopy>>
}

const COPY: Readonly<Record<LocaleId, PageCopy>> = {
  zh: {
    intro: '预设决定新会话可用的工具、提示词和执行方式，不会改变模型。点击一个模式可将它设为之后新会话的默认预设。',
    introductionLabel: '模式介绍',
    exampleLabel: '例如这样用',
    modes: {
      standard: {
        introduction: '完整能力模式，可使用文件编辑、Shell、文件与网页检索、Skills、计划、目标、子代理和工作流，适合需要边执行边判断的综合任务。',
        example: '“分析这个项目的登录故障，定位原因、修改代码并运行测试验证。”',
      },
      code: {
        introduction: '在标准能力之上，通过 Code Mode SDK 编排工具调用，适合边界清楚、可以批量筛选、合并、排序、去重或校验的流程。',
        example: '“读取所有配置文件，找出重复依赖，合并结果并输出一份校验报告。”',
      },
      minimal: {
        introduction: '只提供持久 Bash 与文本编辑器，工具范围最小、行为更受限，适合简单修改、兼容性测试或排查扩展工具影响。',
        example: '“把 package.json 的 test 脚本改成 vitest，然后在终端运行验证。”',
      },
      cordis: {
        introduction: '专门用于创建自定义 Agent 预设；除了标准能力，还可以检查运行时、试验插件并生成预设文件。',
        example: '“创建一个代码审查预设：只读仓库、禁止执行发布命令，并固定输出风险清单。”',
      },
    },
  },
  en: {
    intro: 'A preset controls the tools, prompt, and execution style used by new sessions. It does not change the model. Select a mode to make it the default for sessions you start later.',
    introductionLabel: 'About this mode',
    exampleLabel: 'Example request',
    modes: {
      standard: {
        introduction: 'The complete toolset for work that needs judgment between steps: file editing, shell, file and web search, skills, plans, goals, subagents, and workflows.',
        example: '“Investigate this project’s login failure, fix the cause, and run the tests to verify it.”',
      },
      code: {
        introduction: 'Adds Code Mode SDK orchestration to the Standard toolset. Best for bounded workflows that can batch filtering, joining, ranking, deduplication, or validation.',
        example: '“Read every configuration file, find duplicate dependencies, merge the results, and return a validation report.”',
      },
      minimal: {
        introduction: 'Keeps only persistent Bash and text editing. Use it for small changes, compatibility checks, or isolating the effect of extended tools.',
        example: '“Change the package.json test script to Vitest, then run it in the terminal.”',
      },
      cordis: {
        introduction: 'Purpose-built for authoring custom Agent presets, with runtime inspection, plugin experiments, and preset-file guidance in addition to Standard capabilities.',
        example: '“Create a code-review preset that can only read the repository, cannot publish, and always returns a risk checklist.”',
      },
    },
  },
}

const BUILT_IN_IDS = new Set(Object.keys(COPY.zh.modes))

function activeLocale(locale: string): LocaleId {
  return locale.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

function directChildren(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
}

function addClass(element: HTMLElement, className: string | undefined): void {
  if (className !== undefined && className !== '') element.classList.add(className)
}

function appendTextBlock(
  document: Document,
  parent: HTMLElement,
  className: string,
  label: string,
  text: string,
): void {
  const block = document.createElement('span')
  block.className = className

  const heading = document.createElement('span')
  heading.className = css.detailLabel ?? ''
  heading.textContent = label

  const content = document.createElement('span')
  content.className = css.detailText ?? ''
  content.textContent = text

  block.append(heading, content)
  parent.append(block)
}

function decorateBuiltInCard(card: HTMLElement, id: string, copy: PageCopy, locale: LocaleId): void {
  const mode = copy.modes[id]
  if (mode === undefined) return
  const code = directChildren(card)
    .flatMap(child => child.tagName === 'BUTTON' ? directChildren(child) : [])
    .find(child => child.tagName === 'CODE' && child.textContent?.trim() === id)
    ?? Array.from(card.querySelectorAll<HTMLElement>('code')).find(node => node.textContent?.trim() === id)
  const main = code?.closest('button')
  if (!(code instanceof HTMLElement) || !(main instanceof HTMLElement)) return

  card.dataset.openworkbuddyPresetId = id
  addClass(main, css.modeMain)
  addClass(code, css.modeId)
  const children = directChildren(main)
  const head = children[0]
  if (head !== undefined) addClass(head, css.modeHead)

  const originalDescription = children.find(child => child !== head && child.tagName === 'SPAN')
  if (originalDescription !== undefined) addClass(originalDescription, css.originalDescription)

  let details = directChildren(main).find(child => child.dataset.openworkbuddyPresetDetails === 'true')
  if (details === undefined) {
    details = main.ownerDocument.createElement('span')
    details.dataset.openworkbuddyPresetDetails = 'true'
    details.className = css.details ?? ''
    main.insertBefore(details, code)
  }
  if (details.dataset.openworkbuddyLocale === locale) return
  details.dataset.openworkbuddyLocale = locale
  details.replaceChildren()
  appendTextBlock(main.ownerDocument, details, css.introduction ?? '', copy.introductionLabel, mode.introduction)
  appendTextBlock(main.ownerDocument, details, css.example ?? '', copy.exampleLabel, mode.example)
}

/** Decorate every currently mounted Agent-preset settings page. */
export function decorateAgentPresetSections(document: Document, locale: string): void {
  const localeId = activeLocale(locale)
  const copy = COPY[localeId]
  for (const outlet of document.querySelectorAll<HTMLElement>('[data-slot="settings.section"]')) {
    const presetCodes = Array.from(outlet.querySelectorAll<HTMLElement>('li code'))
      .filter(code => BUILT_IN_IDS.has(code.textContent?.trim() ?? ''))
    if (presetCodes.length === 0) continue

    const heading = outlet.querySelector<HTMLElement>('h2')
    if (heading === null) continue
    const page = heading.parentElement
    if (!(page instanceof HTMLElement)) continue
    addClass(page, css.page)

    const pageIntro = heading.nextElementSibling
    if (pageIntro instanceof HTMLParagraphElement) {
      if (pageIntro.dataset.openworkbuddyOriginalText === undefined) {
        pageIntro.dataset.openworkbuddyOriginalText = pageIntro.textContent ?? ''
      }
      if (pageIntro.textContent !== copy.intro) pageIntro.textContent = copy.intro
      addClass(pageIntro, css.pageIntro)
    }

    for (const list of page.querySelectorAll<HTMLElement>('ul')) {
      addClass(list, css.list)
      for (const card of directChildren(list)) {
        if (card.tagName !== 'LI') continue
        addClass(card, css.modeSection)
        const main = directChildren(card).find(child => child.tagName === 'BUTTON')
        const actions = main?.nextElementSibling
        if (actions instanceof HTMLElement) addClass(actions, css.actions)
      }
    }

    for (const code of presetCodes) {
      const id = code.textContent?.trim() ?? ''
      const card = code.closest('li')
      if (card instanceof HTMLElement) decorateBuiltInCard(card, id, copy, localeId)
    }
  }
}

function removeDecorations(document: Document): void {
  for (const details of document.querySelectorAll<HTMLElement>('[data-openworkbuddy-preset-details="true"]')) {
    details.remove()
  }
  for (const intro of document.querySelectorAll<HTMLElement>('[data-openworkbuddy-original-text]')) {
    intro.textContent = intro.dataset.openworkbuddyOriginalText ?? ''
    delete intro.dataset.openworkbuddyOriginalText
  }
  const classes = Object.values(css).filter(Boolean)
  for (const node of document.querySelectorAll<HTMLElement>('[data-slot="settings.section"] *')) {
    node.classList.remove(...classes)
    delete node.dataset.openworkbuddyPresetId
  }
}

/** Locale is the only Cordis dependency; the settings surface itself stays upstream-owned. */
export const inject = ['locale']

/** Install the idempotent page decorator and unwind every injected DOM node on unload. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    if (typeof document === 'undefined' || document.body === null) return
    let queued = false
    const decorate = (): void => {
      queued = false
      decorateAgentPresetSections(document, ctx.locale.getSnapshot().active)
    }
    const schedule = (): void => {
      if (queued) return
      queued = true
      queueMicrotask(decorate)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    const unsubscribeLocale = ctx.locale.subscribe(schedule)
    decorate()
    return () => {
      observer.disconnect()
      unsubscribeLocale()
      removeDecorations(document)
    }
  }, 'openworkbuddy: horizontal Agent-preset sections')
}
