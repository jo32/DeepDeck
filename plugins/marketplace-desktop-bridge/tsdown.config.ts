import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-app-market-desktop-bridge',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
