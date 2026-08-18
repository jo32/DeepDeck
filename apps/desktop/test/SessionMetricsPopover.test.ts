// @vitest-environment jsdom

import { act, createElement, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { UseProjection } from '@deepseek-ai/dsh-client-runtime/client'
import {
  SessionMetricsPopover,
  formatCompactTokens,
  formatMetricDuration,
  sessionMetricsZh,
} from '../../../plugins/desktop-chrome/src/client/SessionMetricsPopover.tsx'

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined
let container: HTMLDivElement | undefined

afterEach(async () => {
  if (root !== undefined) await act(async () => { root?.unmount() })
  container?.remove()
  root = undefined
  container = undefined
})

const t = ((key: keyof typeof sessionMetricsZh, params?: Record<string, unknown>) => {
  const value = sessionMetricsZh[key]
  return Object.entries(params ?? {}).reduce(
    (copy, [name, replacement]) => copy.replace(`{${name}}`, String(replacement)),
    value,
  )
}) as ComponentProps<typeof SessionMetricsPopover>['t']

function projection(values: Record<string, unknown>): UseProjection {
  return ((key: string) => values[key]) as UseProjection
}

describe('SessionMetricsPopover', () => {
  it('formats compact token and duration readings', () => {
    expect(formatCompactTokens(6_900)).toBe('6.9K')
    expect(formatCompactTokens(272_000)).toBe('272K')
    expect(formatMetricDuration(3_300)).toBe('3.3s')
    expect(formatMetricDuration(100_000)).toBe('1m40s')
  })

  it('combines context composition and session telemetry in one dialog', async () => {
    const useProjection = projection({
      contextPressure: { projectedTokens: 6_900, contextWindow: 272_000 },
      contextBreakdown: { systemTokens: 1_500, toolsTokens: 6_400, messageTokens: 1_000 },
      sessionStats: {
        turns: 1,
        steps: 1,
        llmMs: 3_600,
        toolMs: 0,
        ttftMs: 3_300,
        ttftSteps: 1,
        decodeMs: 295,
        decodeTokens: 13,
      },
      tokenUsage: {
        uncachedInputTokens: 2_900,
        cacheReadTokens: 3_600,
        cacheWriteTokens: 400,
        outputTokens: 13,
      },
    })

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(createElement(SessionMetricsPopover, {
        useProjection,
        t,
      } as ComponentProps<typeof SessionMetricsPopover>))
    })

    const trigger = container.querySelector<HTMLButtonElement>('[data-deepdeck-session-meter]')
    expect(trigger?.getAttribute('aria-label')).toBe('上下文已用 3%')
    await act(async () => { trigger?.click() })

    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('~6.9K / 272K')
    expect(container.textContent).toContain('系统提示词~1.5K')
    expect(container.textContent).toContain('本次会话')
    expect(container.textContent).toContain('轮次 / 步骤1 / 1')
    expect(container.textContent).toContain('模型耗时3.6s')
    expect(container.textContent).toContain('首 token 平均3.3s')
    expect(container.textContent).toContain('生成速度44.1 tok/s')
    expect(container.textContent).toContain('缓存命中52%')
    expect(container.textContent).toContain('输入 / 输出6.9K / 13')

    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})

