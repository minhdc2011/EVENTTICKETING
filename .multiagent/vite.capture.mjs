// Dev-server config used only by org.ps1 for before/after screenshots.
// It loads the checkout's own vite.config.ts (from the current working directory) and gives each server its own
// dependency cache. The worktree links node_modules from the main checkout, so without this both servers would
// share node_modules/.vite and corrupt each other's pre-bundled React (blank pages, "reading 'useCallback'").
import {loadConfigFromFile, mergeConfig} from 'vite';

export default async (env) => {
  const loaded = await loadConfigFromFile(env, undefined, process.cwd());
  const cacheDir = process.env.CAPTURE_CACHE_DIR;
  if (!cacheDir) throw new Error('CAPTURE_CACHE_DIR is not set');
  return mergeConfig(loaded?.config ?? {}, {root: process.cwd(), cacheDir});
};
