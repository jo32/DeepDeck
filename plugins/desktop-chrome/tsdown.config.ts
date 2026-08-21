import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-client-ui-desktop-chrome',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
