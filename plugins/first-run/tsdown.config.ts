import { clientBundle } from '../../vendor/deepseek-harness/packages/client/tsdown.client.ts'

export default clientBundle(
  '@deepdeck/dsh-first-run',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
