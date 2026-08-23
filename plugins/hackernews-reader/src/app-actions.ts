type JsonObject = Record<string, unknown>

export interface PreparedAction {
  readonly prompt: string
  readonly title: string
  readonly sessionTitle?: string
}

interface HackerNewsActionPayload {
  readonly storyId: number
  readonly title: string
  readonly url: string
  readonly hnUrl: string
  readonly selection: string
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function actionPayload(value: unknown): HackerNewsActionPayload {
  if (!isObject(value)) throw new Error('Hacker News action payload must be an object')
  const storyId = Number(value.storyId)
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  if (!Number.isSafeInteger(storyId) || storyId <= 0 || title.length === 0) {
    throw new Error('Hacker News action requires a valid story')
  }
  return {
    storyId,
    title,
    url: typeof value.url === 'string' ? value.url : '',
    hnUrl: typeof value.hnUrl === 'string' ? value.hnUrl : `https://news.ycombinator.com/item?id=${String(storyId)}`,
    selection: typeof value.selection === 'string' ? value.selection.trim().slice(0, 8_000) : '',
  }
}

function storyContext(payload: HackerNewsActionPayload): string {
  return [
    `Title: ${payload.title}`,
    `Hacker News item: ${payload.hnUrl}`,
    ...(payload.url.length === 0 ? [] : [`Source: ${payload.url}`]),
  ].join('\n')
}

export function prepareHackerNewsAction(actionId: string, value: unknown): PreparedAction {
  const payload = actionPayload(value)
  const context = storyContext(payload)
  if (actionId === 'explain') {
    const subject = payload.selection.length > 0
      ? `Selected passage:\n${payload.selection}`
      : 'Explain the central idea and why this discussion matters.'
    return {
      title: payload.selection.length > 0 ? 'Explain selection' : 'Explain story',
      sessionTitle: `[HN] Explain · ${payload.title}`,
      prompt: `Explain the following Hacker News context clearly. Define unfamiliar concepts, preserve important nuance, and distinguish facts from participants' opinions.\n\n${context}\n\n${subject}`,
    }
  }
  if (actionId === 'summarize') {
    const scope = payload.selection.length > 0
      ? `Summarize only this selected passage:\n${payload.selection}`
      : `Use the hackernews_read_story tool with story_id ${String(payload.storyId)} to read the discussion before answering.`
    return {
      title: payload.selection.length > 0 ? 'Summarize selection' : 'Summarize discussion',
      sessionTitle: `[HN] Summary · ${payload.title}`,
      prompt: `Summarize this Hacker News item. Cover the main claim, strongest supporting and opposing views, useful technical details, and anything that needs verification.\n\n${context}\n\n${scope}`,
    }
  }
  throw new Error(`Unknown Hacker News action '${actionId}'`)
}
