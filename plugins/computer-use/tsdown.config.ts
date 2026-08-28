import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-computer-use',
  ['lib/types/index.js', 'lib/types/invariant.js', 'lib/types/app-agent-proxy.js'],
)
