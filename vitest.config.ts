import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',        // core/ 는 DOM 을 쓰지 않는다 (§0.3)
  },
});
