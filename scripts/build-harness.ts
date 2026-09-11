import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  CLIENT_BUILD_RECORD_PATH,
  CLIENT_BUILD_PROFILE_SELECTOR,
  clientBuildProcessEnvironment,
  repositoryClientBuildEnvironment,
  resolveClientBuildEnvironment,
  writeClientBuildRecord,
} from '../vendor/deepseek-harness/scripts/client-build-environment.ts'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const harnessRoot = resolve(workspaceRoot, 'vendor/deepseek-harness')
const harnessManifest = JSON.parse(readFileSync(resolve(harnessRoot, 'package.json'), 'utf8')) as {
  packageManager?: unknown
}
const packageManager = harnessManifest.packageManager
if (typeof packageManager !== 'string' || !/^pnpm@\d+\.\d+\.\d+$/.test(packageManager)) {
  throw new Error('Harness must declare an exact pnpm packageManager version')
}
const corepack = process.platform === 'win32' ? 'corepack.cmd' : 'corepack'

function runPnpm(args: readonly string[], environment: NodeJS.ProcessEnv): void {
  const packageManagerEnvironment = { ...environment, CI: 'true' }
  delete packageManagerEnvironment.npm_execpath
  delete packageManagerEnvironment.npm_config_user_agent
  const result = spawnSync(corepack, [packageManager, ...args], {
    cwd: harnessRoot,
    env: packageManagerEnvironment,
    stdio: 'inherit',
  })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(`Harness build command exited with ${String(result.status ?? result.signal)}`)
  }
}

const { values } = parseArgs({
  options: { profile: { type: 'string' } },
  allowPositionals: false,
})
const repositoryEnvironment = repositoryClientBuildEnvironment(harnessRoot, process.env)
const profile = values.profile ?? process.env[CLIENT_BUILD_PROFILE_SELECTOR]
const clientEnvironment = resolveClientBuildEnvironment(repositoryEnvironment, profile)
const buildEnvironment = clientBuildProcessEnvironment(process.env, clientEnvironment)

// Upstream upgrades can remove packages while leaving their ignored lib/ trees.
// Clean generated artifacts before rebuilding so discovery cannot load retired modules.
runPnpm(['run', 'clean'], buildEnvironment)
rmSync(resolve(harnessRoot, CLIENT_BUILD_RECORD_PATH), { force: true })
runPnpm(['run', 'build:native-system'], buildEnvironment)
// build:lib shells out to bare pnpm, which can resolve the parent's pnpm 12
// under Corepack in CI. Keep both compilation stages on Harness's pinned version.
runPnpm(['run', 'build:lib:host'], buildEnvironment)
runPnpm(['run', 'build:lib:client'], buildEnvironment)

// Upstream's build:web script invokes a bare `pnpm`, which resolves to this
// parent workspace's pnpm 12 binary in a nested checkout. Invoke the equivalent
// target explicitly through Harness's pinned package manager instead.
runPnpm(['--filter', '@deepseek-ai/dsh-web-frontend', 'run', 'build'], buildEnvironment)

const record = writeClientBuildRecord(harnessRoot, clientEnvironment)
console.log(
  `build: recorded ${String(record.artifacts.fileCount)} client artifact(s) with ${String(Object.keys(record.environment).length)} public value(s)`,
)
