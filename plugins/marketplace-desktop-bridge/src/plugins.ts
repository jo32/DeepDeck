import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface CommunityMarketPluginBundle {
  readonly bundleId: string
  readonly packageName: string
  readonly status: 'active' | 'disabled'
  readonly mutable: boolean
}

export interface CommunityMarketPlugins {
  list(): readonly CommunityMarketPluginBundle[]
  disabledPackageNames(): readonly string[]
  isDisabled(packageName: string): boolean
  previewDisable(bundleId: string): never
  executeDisable(previewId: string): Promise<never>
  previewEnable(bundleId: string): never
  executeEnable(previewId: string): Promise<never>
}

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_BUNDLES = 1024

function profileBundles(profileDir: string): readonly string[] {
  const bytes = readFileSync(join(profileDir, 'package.json'))
  if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new Error('DeepDeck profile manifest is too large')
  const manifest = JSON.parse(bytes.toString('utf8')) as {
    dsh?: { profile?: { bundles?: unknown } }
  }
  const bundles = manifest.dsh?.profile?.bundles
  if (bundles === undefined) return []
  if (
    !Array.isArray(bundles)
    || bundles.length > MAX_BUNDLES
    || bundles.some((bundle) => typeof bundle !== 'string' || !PACKAGE_NAME_PATTERN.test(bundle))
  ) throw new Error('DeepDeck profile bundle list is invalid')
  return bundles as string[]
}

/**
 * Inventory bridge used by Community Market receipts.
 *
 * DeepDeck does not yet filter bundle composition before Loader startup, so
 * every row is deliberately immutable. Managed receipt-owned packages can
 * still be uninstalled through desktopPnpm without presenting a disable
 * control whose state the next generation could not enforce.
 */
export class DeepDeckCommunityMarketPlugins implements CommunityMarketPlugins {
  private readonly ids = new Map<string, string>()

  constructor(private readonly profileDir: string) {}

  list(): readonly CommunityMarketPluginBundle[] {
    return profileBundles(this.profileDir).map((packageName) => ({
      bundleId: this.bundleId(packageName),
      packageName,
      status: 'active',
      mutable: false,
    }))
  }

  disabledPackageNames(): readonly string[] {
    return []
  }

  isDisabled(): boolean {
    return false
  }

  previewDisable(): never {
    throw new Error('DeepDeck does not expose bundle disabling')
  }

  async executeDisable(): Promise<never> {
    throw new Error('DeepDeck does not expose bundle disabling')
  }

  previewEnable(): never {
    throw new Error('DeepDeck does not expose bundle enabling')
  }

  async executeEnable(): Promise<never> {
    throw new Error('DeepDeck does not expose bundle enabling')
  }

  private bundleId(packageName: string): string {
    const current = this.ids.get(packageName)
    if (current !== undefined) return current
    const id = `bundle_${randomBytes(24).toString('base64url')}`
    this.ids.set(packageName, id)
    return id
  }
}
