import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const desktopPatch = readFileSync(
  new URL('../../../plugins/desktop-chrome/cordis.patch.yml', import.meta.url),
  'utf8',
)
const pluginPatch = readFileSync(
  new URL('../../../plugins/computer-use/cordis.patch.yml', import.meta.url),
  'utf8',
)

describe('Computer Use desktop composition', () => {
  it.each([
    ['desktop', desktopPatch],
    ['plugin', pluginPatch],
  ])('joins startup discovery and uses the DeepDeck app-agent transport in the %s patch', (_name, patch) => {
    expect(patch).toMatch(
      /id: deepdeck-computer-use-runtime[\s\S]*?name: cordis:group[\s\S]*?inject:\s+- deepdeckComputerUse/,
    )
    expect(patch).toMatch(
      /id: deepdeck-computer-use-mcp[\s\S]*?disabled: !!js ctx\.deepdeckComputerUse\.enabled === false/,
    )
    expect(patch).toMatch(
      /id: deepdeck-computer-use-mcp[\s\S]*?command: !!js ctx\.deepdeckComputerUse\.mcpCommand[\s\S]*?args: !!js ctx\.deepdeckComputerUse\.mcpArgs/,
    )
    expect(patch).toMatch(
      /id: deepdeck-computer-use-mcp[\s\S]*?reconnect:\s+enabled: true\s+initialDelayMs: 500\s+maxDelayMs: 30000\s+maxAttempts: 10/,
    )
    expect(patch).not.toContain('OPEN_COMPUTER_USE_DISABLE_APP_AGENT_PROXY')
  })
})
