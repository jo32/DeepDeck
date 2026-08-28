export const COMPUTER_USE_SETTINGS_NAMESPACE = 'computer-use'
export const COMPUTER_USE_RUNTIME_GROUP_ID = 'deepdeck-computer-use-runtime'
export const COMPUTER_USE_MCP_ENTRY_ID = 'deepdeck-computer-use-mcp'

export interface ComputerUseSettings {
  readonly enabled: boolean
}

export interface ComputerUseRuntime {
  /** Live preference read by the MCP entry's Cordis disabled expression. */
  enabled: boolean
  /** Absolute root of the bundled DeepDeck plugin. */
  readonly root: string
  /** Command and arguments used for the long-lived MCP stdio transport. */
  readonly mcpCommand: string
  readonly mcpArgs: readonly string[]
  /** Signed macOS app whose identity owns Accessibility and Screen Recording. */
  readonly appBundle?: string
}
