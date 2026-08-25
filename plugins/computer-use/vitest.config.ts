import { resolve } from 'node:path'

export default {
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': resolve(
        import.meta.dirname,
        '../../vendor/deepseek-harness/packages/client/ui-primitives/lib/index.js',
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}
