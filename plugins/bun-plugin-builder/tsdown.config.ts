import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-bun-plugin-builder',
  [
    'lib/types/index.js',
    'lib/types/builder.js',
    'lib/types/routes.js',
    'lib/types/api-types.js',
    'lib/types/invariant.js',
  ],
)
