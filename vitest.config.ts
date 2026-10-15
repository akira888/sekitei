import { defineConfig } from 'vitest/config'

// vite.config.ts の RubyPlugin はテストに不要なので、テスト用の設定を分けている
export default defineConfig({
  test: {
    include: ['app/frontend/**/*.test.ts'],
  },
})
