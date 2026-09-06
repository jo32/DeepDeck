import { fileURLToPath } from 'node:url'
import { defineConfig } from '../../../vendor/deepseek-harness/node_modules/vitest/dist/config.js'
import tsconfigPaths from '../../../vendor/deepseek-harness/node_modules/vite-tsconfig-paths'
import { standardDecoratorPlugin, vitestExecArgv } from '../../../vendor/deepseek-harness/vitest.shared.ts'

export default defineConfig({
  resolve: { alias: { vitest: fileURLToPath(new URL('../../../vendor/deepseek-harness/node_modules/vitest/dist/index.js', import.meta.url)) } },
  plugins: [
    tsconfigPaths({ projects: [fileURLToPath(new URL('../../../vendor/deepseek-harness/tsconfig.base.json', import.meta.url))] }),
    standardDecoratorPlugin(),
  ],
  test: {
    execArgv: vitestExecArgv,
    include: ['apps/desktop/scripts/question-composer.e2e.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
})
