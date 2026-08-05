import viteConfig from './vite.config.ts'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    plugins: [],
    test: {
      environment: 'happy-dom',
      include: ['tests/**/*.spec.ts']
    }
  })
)
