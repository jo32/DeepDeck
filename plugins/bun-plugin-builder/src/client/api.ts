import type {
  BunBuildLogs,
  BunBuildPreview,
  BunBuildResult,
  BunBuilderApiRequest,
  BunBuilderApiResponse,
  BunBuilderRuntimeStatus,
  BunHotUpdateResult,
} from '../api-types.js'

const API_PATH = '/api/deepdeck/bun-plugin-builder'

export class BunBuilderClientError extends Error {
  constructor(message: string, readonly logs?: Partial<BunBuildLogs>) {
    super(message)
    this.name = 'BunBuilderClientError'
  }
}

async function call(request: BunBuilderApiRequest): Promise<BunBuilderApiResponse> {
  const response = await fetch(API_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  const value: unknown = await response.json()
  if (typeof value !== 'object' || value === null || !('ok' in value)) {
    throw new BunBuilderClientError('Builder returned an invalid response')
  }
  const result = value as BunBuilderApiResponse
  if (!response.ok || !result.ok) {
    throw new BunBuilderClientError(result.ok ? 'Builder request failed' : result.error, result.ok ? undefined : result.logs)
  }
  return result
}

export async function readStatus(): Promise<BunBuilderRuntimeStatus> {
  const result = await call({ action: 'status' })
  if (!('status' in result)) throw new BunBuilderClientError('Builder status is unavailable')
  return result.status
}

export async function previewBuild(
  sourceDirectory: string,
  packageSubdirectory: string,
): Promise<BunBuildPreview> {
  const result = await call({
    action: 'preview',
    sourceDirectory,
    ...(packageSubdirectory.trim().length === 0 ? {} : { packageSubdirectory }),
  })
  if (!('preview' in result)) throw new BunBuilderClientError('Build preview is unavailable')
  return result.preview
}

export async function executeBuild(preview: BunBuildPreview): Promise<BunBuildResult> {
  const result = await call({
    action: 'build',
    previewId: preview.previewId,
    confirmation: preview.confirmation,
  })
  if (!('result' in result)) throw new BunBuilderClientError('Build result is unavailable')
  return result.result
}

export async function executeHotUpdate(preview: BunBuildPreview): Promise<BunHotUpdateResult> {
  const result = await call({
    action: 'hot-update',
    previewId: preview.previewId,
    confirmation: preview.confirmation,
  })
  if (!('hotUpdate' in result)) throw new BunBuilderClientError('Hot-update result is unavailable')
  return result.hotUpdate
}

export async function discardBuild(previewId: string): Promise<void> {
  const result = await call({ action: 'discard', previewId })
  if (!('discarded' in result)) throw new BunBuilderClientError('Build preview could not be discarded')
}
