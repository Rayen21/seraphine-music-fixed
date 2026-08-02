import viteConfig from './vite.config'
import { defineConfig, mergeConfig } from 'vitest/config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.spec.ts']
    }
  })
)
