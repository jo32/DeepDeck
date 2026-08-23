import { deepdeckClientBundle } from '../../scripts/deepdeck-client-bundle.ts'

export default deepdeckClientBundle(
  '@deepdeck/dsh-hackernews-reader',
  [
    'lib/types/index.js',
    'lib/types/invariant.js',
    'lib/types/app-actions.js',
    'lib/types/credentials.js',
    'lib/types/hn-auth.js',
    'lib/types/hn-api.js',
    'lib/types/reader-page.js',
  ],
)
