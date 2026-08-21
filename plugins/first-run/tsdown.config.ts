import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-first-run',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
