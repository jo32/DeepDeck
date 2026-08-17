import { clientBundle } from '../../vendor/deepseek-harness/packages/client/tsdown.client.ts'

export default clientBundle(
  '@openworkbuddy/dsh-client-ui-desktop-chrome',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
