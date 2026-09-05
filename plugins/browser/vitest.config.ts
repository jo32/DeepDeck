import { fileURLToPath } from 'node:url'

export default {
  resolve: { alias: {
    '@deepseek-ai/dsh-client-ui-slots': fileURLToPath(new URL('../../vendor/deepseek-harness/packages/client/ui-slots/lib/index.js', import.meta.url)),
  } },
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
}
