import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-community-market-desktop-bridge',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
