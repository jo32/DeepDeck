import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { boundedResponse } from './bounded-response.js'
import { packagePath, repositoryUrl, WEBMCP_SUBMISSIONS_URL } from './webmcp-package.js'
import { MAX_SUBMISSION_BYTES, parseSubmission, submissionKey } from './webmcp-submission.js'

const run = promisify(execFile)
export interface PublicationInput {
  directory: string; workspace: string; credentialsDirectory: string; origin: string
  repository: string; repositoryId: number; commit: string; manifestPath?: string
}

async function credential(directory: string, key: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const file = join(directory, `${key}.key`)
  try { await writeFile(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
  const token = await readFile(file, 'utf8')
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('The saved project publication credential is invalid.')
  return token
}

/** Read the exact published commit; never fetch GitHub or publish a working draft. */
export async function publishCommittedPackage(input: PublicationInput, request: typeof fetch = fetch, signal?: AbortSignal) {
  const directory = await realpath(input.directory), workspace = await realpath(input.workspace)
  const within = relative(workspace, directory)
  if (within === '..' || within.startsWith('../') || isAbsolute(within)) throw new Error('Choose a publication project inside this site Workspace.')
  if (!/^[a-f0-9]{40}$/.test(input.commit)) throw new Error('Choose the full published commit SHA.')
  const repository = repositoryUrl(input.repository), manifestPath = packagePath(input.manifestPath ?? 'webmcp.json')
  const git = async (...args: string[]) => (await run('git', ['-C', directory, ...args], {
    encoding: 'utf8', maxBuffer: MAX_SUBMISSION_BYTES, ...(signal ? { signal } : {}),
  })).stdout
  if (await realpath((await git('rev-parse', '--show-toplevel')).trim()) !== directory) throw new Error('Choose the Git project root for publication.')
  const remotes = await git('config', '--get-regexp', '^remote\\..*\\.url$')
  const matches = remotes.trim().split('\n').some(line => {
    const url = line.slice(line.indexOf(' ') + 1).replace(/^git@github\.com:/, 'https://github.com/')
    try { return repositoryUrl(url).toLowerCase() === repository.toLowerCase() } catch { return false }
  })
  if (!matches) throw new Error('The publication repository must match this project’s Git remote.')
  const readBlob = async (path: string) => {
    const listing = await git('ls-tree', input.commit, '--', path)
    if (!/^100(?:644|755) blob [a-f0-9]{40}\t/.test(listing)) throw new Error('Publish ordinary committed files, without symlinks or submodules.')
    return git('show', `${input.commit}:${path}`)
  }
  const manifest = JSON.parse(await readBlob(manifestPath))
  const source = await readBlob(packagePath(manifest.entry))
  const publisherToken = await credential(input.credentialsDirectory, submissionKey(repository, manifestPath))
  const publication = parseSubmission({ repository, repositoryId: input.repositoryId, manifestPath, commit: input.commit, manifest, source, publisherToken })
  if (publication.manifest.origin !== input.origin) throw new Error('The package origin does not match this Site Agent.')
  const body = JSON.stringify(publication)
  if (Buffer.byteLength(body) > MAX_SUBMISSION_BYTES) throw new Error('Publication exceeds 4 MB.')
  // Save the credential before sending, so retrying an uncertain response is
  // idempotent and does not require user intervention or a new credential.
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted()
    let response: Response
    try {
      response = await request(WEBMCP_SUBMISSIONS_URL, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) })
    } catch (error) {
      signal?.throwIfAborted()
      if (attempt === 2) throw error
      await delay(1000 * 2 ** attempt, undefined, { signal }); continue
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retry = Number(response.headers.get('retry-after'))
      await response.body?.cancel()
      await delay(response.status === 429 ? Math.max(60000, Number.isFinite(retry) ? retry * 1000 : 0) : 1000 * 2 ** attempt, undefined, { signal })
      continue
    }
    const receipt = JSON.parse(await boundedResponse(response, 8192))
    if (!response.ok) throw new Error(typeof receipt.error === 'string' ? receipt.error : 'The directory could not accept this publication.')
    if (receipt.status !== 'indexed' || receipt.commit !== input.commit || receipt.sourceSha256 !== publication.manifest.sourceSha256) throw new Error('The directory did not confirm the exact published package.')
    return { id: receipt.id as string, status: 'indexed' as const, entryId: receipt.entryId as string,
      repository, commit: input.commit, sourceSha256: publication.manifest.sourceSha256,
      statusUrl: `${new URL(WEBMCP_SUBMISSIONS_URL).origin}/api/webmcp/submissions?id=${encodeURIComponent(receipt.id)}` }
  }
  throw new Error('Publication could not complete.')
}
