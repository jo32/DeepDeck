import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-app-conversations',
  [
    'lib/types/index.js',
    'lib/types/contracts.js',
    'lib/types/app-settings-contract.js',
    'lib/types/invariant.js',
  ],
)
