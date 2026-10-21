/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execFileSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

// Version shown in the app: major.minor from package.json, patch = commits since package.json's
// version was last edited (so bumping major/minor resets it to 0), plus the short commit hash.
function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}
const [major, minor] = pkg.version.split('.');
const versionCommit = git('log', '-G"version"', '--format=%H', '-n', '1', '--', 'package.json');
const sinceBump = versionCommit ? git('rev-list', '--count', `${versionCommit}..HEAD`) : null;
const commitHash = git('rev-parse', '--short', 'HEAD');
const appVersion = sinceBump ? `${major}.${minor}.${sinceBump}${commitHash ? ` (${commitHash})` : ''}` : pkg.version;

// GitHub Pages serves project sites from /<repo-name>/. The deploy workflow sets
// BASE_PATH from the repository name; the fallback matches a repo called "shiftly".
const base = process.env.BASE_PATH ?? '/shiftly/';

export default defineConfig(({ command, isPreview }) => {
  // The dev server runs at the root; builds (and `vite preview` of a build) use the repo sub-path.
  const appBase = command === 'build' || isPreview ? base : '/';
  return {
    base: appBase,
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['apple-touch-icon-v2.png', 'favicon.svg'],
        manifest: {
          name: 'Shiftly',
          short_name: 'Shiftly',
          description: 'A private shift calendar for rotating day and night shifts.',
          display: 'standalone',
          orientation: 'portrait',
          background_color: '#000000',
          theme_color: '#000000',
          start_url: appBase,
          scope: appBase,
          categories: ['productivity', 'lifestyle'],
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          navigateFallback: `${appBase}index.html`,
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
    ],
    test: {
      globalSetup: ['./src/test/global-setup.ts'],
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  };
});
