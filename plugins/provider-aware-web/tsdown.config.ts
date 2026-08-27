import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-provider-aware-web',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
