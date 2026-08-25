export const COMPUTER_USE_SETTINGS_NAMESPACE = 'computer-use'
export const COMPUTER_USE_MCP_ENTRY_ID = 'deepdeck-computer-use-mcp'

export interface ComputerUseSettings {
  readonly enabled: boolean
}

export interface ComputerUseRuntime {
  /** Live preference read by the MCP entry's Cordis disabled expression. */
  enabled: boolean
  /** Absolute root of the bundled DeepDeck plugin. */
  readonly root: string
  /** Absolute JavaScript launcher shipped by open-computer-use. */
  readonly launcher: string
}
