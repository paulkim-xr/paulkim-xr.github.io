// Vitest 4 no longer augments Vite's UserConfig via a triple-slash reference;
// the `test` key is only typed on vitest/config's defineConfig.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // NO `base` option. This is a user-scoped Pages site and serves at the
  // domain root. Setting base would break every absolute asset URL.
  server: {
    host: true, // bind 0.0.0.0 so the Tailscale funnel can reach the dev server
    port: 5173,
    // Vite rejects requests whose Host header it does not recognise with
    // "Blocked request. This host is not allowed." The funnel arrives with the
    // tailnet hostname, so it must be listed or the Quest gets a 403 that
    // looks nothing like a host-header problem.
    allowedHosts: ['snowple.tail709630.ts.net', '.ts.net'],
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: [
        // Modules only. The R3F components alongside them need a renderer and
        // are covered by the end-to-end suite instead.
        'src/lib/**/*.ts',
        'src/transition/machine.ts',
        'src/content/**',
        'src/shape/merge.ts',
        'src/shape/shapes/**',
        'src/hub/budget.ts',
        'src/hub/fade.ts',
        'src/hub/wiggle.ts',
        'src/lab/circles/field.ts',
        'src/lab/gravity/nbody.ts',
        'src/lab/gravity/scatter.ts',
        'src/xr/useXrSupport.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
