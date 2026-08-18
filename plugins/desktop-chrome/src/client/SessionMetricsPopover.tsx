import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-session-stats/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import css from './session-metrics-popover.module.css'

export const SESSION_METRICS_LOCALE = 'deepdeck.desktop.sessionMetrics' as const

export const sessionMetricsZh = {
  'context.aria': '上下文已用 {percent}',
  'context.used': '上下文已用',
  'context.system': '系统提示词',
  'context.tools': '工具',
  'context.messages': '对话消息',
  'session.title': '本次会话',
  'session.empty': '发送消息后显示本次会话指标',
  'metric.counts': '轮次 / 步骤',
  'metric.llm': '模型耗时',
  'metric.tools': '工具耗时',
  'metric.ttft': '首 token 平均',
  'metric.speed': '生成速度',
  'metric.cache': '缓存命中',
  'metric.tokens': '输入 / 输出',
} as const

export const sessionMetricsEn = {
  'context.aria': '{percent} of context used',
  'context.used': 'of context used',
  'context.system': 'System prompt',
  'context.tools': 'Tools',
  'context.messages': 'Messages',
  'session.title': 'This session',
  'session.empty': 'Session metrics appear after the first message',
  'metric.counts': 'Turns / steps',
  'metric.llm': 'Model time',
  'metric.tools': 'Tool time',
  'metric.ttft': 'Average TTFT',
  'metric.speed': 'Generation speed',
  'metric.cache': 'Cache hit',
  'metric.tokens': 'Input / output',
} satisfies Record<keyof typeof sessionMetricsZh, string>

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'deepdeck.desktop.sessionMetrics': keyof typeof sessionMetricsZh
  }
}

type SessionMetricsPopoverProps =
  & PropsRuntime<'conversation.input.right'>
  & PropsLocale<typeof SESSION_METRICS_LOCALE>

interface Metric {
  label: keyof Pick<
    typeof sessionMetricsZh,
    | 'metric.counts'
    | 'metric.llm'
    | 'metric.tools'
    | 'metric.ttft'
    | 'metric.speed'
    | 'metric.cache'
    | 'metric.tokens'
  >
  value: string
}

const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Compact count used by both context composition and session token totals. */
export function formatCompactTokens(n: number): string {
  const scaled = (value: number): string =>
    value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${scaled(n / 1_000)}K`
  return `${scaled(n / 1_000_000)}M`
}

/** Compact elapsed time matching the conversation's existing stats vocabulary. */
export function formatMetricDuration(ms: number): string {
  const seconds = ms / 1_000
  if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)}m${whole % 60}s`
}

function formatThroughput(value: number): string {
  return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10)
}

/** Empty component that shadows the stock composer-dock stats entry. */
export function HiddenComposerStats(): null {
  return null
}

/** Context composition and durable session telemetry in one compact popover. */
export function SessionMetricsPopover({ useProjection, t }: SessionMetricsPopoverProps) {
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const stats = useProjection('sessionStats')
  const usage = useProjection('tokenUsage')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement | null>(null)

  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  const contextWindow = pressure?.contextWindow
  const available = usedTokens !== undefined && contextWindow !== undefined

  useEffect(() => {
    if (!available && open) setOpen(false)
  }, [available, open])

  useEffect(() => {
    if (!open || !available) return
    const onPointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [available, open])

  if (!available) return null

  const percent = Math.min(100, Math.round(usedTokens / contextWindow * 100))
  const reading = `${percent}%`
  const breakdownTotal = breakdown === undefined
    ? 0
    : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
  const rows = breakdown === undefined
    ? []
    : [
        { key: 'systemTokens', label: 'context.system', color: css.colorSystem },
        { key: 'toolsTokens', label: 'context.tools', color: css.colorTools },
        { key: 'messageTokens', label: 'context.messages', color: css.colorMessages },
      ] as const
  const segments = breakdown === undefined || breakdownTotal === 0
    ? [{ key: 'total', color: undefined, width: percent }]
    : rows.map(row => ({
        key: row.key,
        color: row.color,
        width: percent * breakdown[row.key] / breakdownTotal,
      })).filter(segment => segment.width > 0)

  const metrics: Metric[] = []
  if (stats !== undefined && stats.steps > 0) {
    metrics.push({ label: 'metric.counts', value: `${stats.turns} / ${stats.steps}` })
    if (stats.llmMs > 0) metrics.push({ label: 'metric.llm', value: formatMetricDuration(stats.llmMs) })
    if (stats.toolMs > 0) metrics.push({ label: 'metric.tools', value: formatMetricDuration(stats.toolMs) })
    if (stats.ttftSteps > 0) {
      metrics.push({ label: 'metric.ttft', value: formatMetricDuration(stats.ttftMs / stats.ttftSteps) })
    }
    if (stats.decodeMs > 0) {
      metrics.push({
        label: 'metric.speed',
        value: `${formatThroughput(stats.decodeTokens / (stats.decodeMs / 1_000))} tok/s`,
      })
    }
  }
  if (usage !== undefined) {
    const input = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
    if (input > 0 || usage.outputTokens > 0) {
      if (input > 0) {
        metrics.push({
          label: 'metric.cache',
          value: `${Math.round(usage.cacheReadTokens / input * 100)}%`,
        })
      }
      metrics.push({
        label: 'metric.tokens',
        value: `${formatCompactTokens(input)} / ${formatCompactTokens(usage.outputTokens)}`,
      })
    }
  }

  return (
    <span ref={rootRef} className={css.root}>
      <button
        type="button"
        className={css.trigger}
        data-deepdeck-session-meter
        aria-label={t('context.aria', { percent: reading })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
          <circle className={css.track} cx="7" cy="7" r={RADIUS} />
          <circle
            className={css.fill}
            cx="7"
            cy="7"
            r={RADIUS}
            strokeDasharray={`${CIRCUMFERENCE * percent / 100} ${CIRCUMFERENCE}`}
            transform="rotate(-90 7 7)"
          />
        </svg>
      </button>

      {open && (
        <div className={css.panel} role="dialog" aria-label={t('context.used')}>
          <div className={css.contextHeader}>
            <span className={css.percent}>{reading}</span>
            <span className={css.muted}>{t('context.used')}</span>
            <span className={css.figures}>
              {`~${formatCompactTokens(usedTokens)} / ${formatCompactTokens(contextWindow)}`}
            </span>
          </div>

          <div className={css.bar}>
            {segments.map(segment => (
              <span
                key={segment.key}
                className={segment.color === undefined ? css.segment : `${css.segment} ${segment.color}`}
                style={{ width: `${segment.width}%` }}
              />
            ))}
          </div>

          {breakdown !== undefined && (
            <dl className={css.contextRows}>
              {rows.map(row => (
                <div key={row.key} className={css.contextRow}>
                  <dt><span className={`${css.swatch} ${row.color}`} aria-hidden="true" />{t(row.label)}</dt>
                  <dd>{`~${formatCompactTokens(breakdown[row.key])}`}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className={css.divider} />
          <div className={css.sessionTitle}>{t('session.title')}</div>
          {metrics.length === 0
            ? <p className={css.empty}>{t('session.empty')}</p>
            : (
                <dl className={css.metricGrid}>
                  {metrics.map(metric => (
                    <div key={metric.label} className={css.metric}>
                      <dt>{t(metric.label)}</dt>
                      <dd>{metric.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
        </div>
      )}
    </span>
  )
}
