import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle('@deepdeck/dsh-browser', ['lib/types/index.js', 'lib/types/contracts.js', 'lib/types/invariant.js']).map(config => ({
  ...config,
  plugins: [{
    // Type checking uses the published declarations; bundle the public source
    // exports so they share the Harness module table and DeepDeck CSS pipeline.
    name: 'deepdeck-sidebar-source-exports',
    resolveId(source: string) {
      if (!source.startsWith('dsh-better-sidebar/src/')) return null
      return realpathSync(fileURLToPath(new URL(`./node_modules/${source}`, import.meta.url)))
    },
  }, ...(config.plugins ?? [])],
}))
