import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', 'data', 'cache');

const TTL_MINUTES = Number(process.env.CACHE_TTL_MINUTES) || 15;

function ensureDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cachePath(key) {
  const safe = key.replace(/[^a-z0-9_-]/gi, '_');
  return path.join(CACHE_DIR, `${safe}.json`);
}

/**
 * Returns cached value if present and not expired, else null.
 */
export function getCached(key, ttlMinutes = TTL_MINUTES) {
  try {
    const file = cachePath(key);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const ageMs = Date.now() - raw.timestamp;
    if (ageMs > ttlMinutes * 60 * 1000) return null;
    return raw.value;
  } catch {
    return null;
  }
}

/**
 * Delete cache entries to force a fresh fetch. Pass an array of keys to clear
 * just those, or omit to clear everything. Returns the number of files removed.
 */
export function clearCache(keys = null) {
  try {
    if (!fs.existsSync(CACHE_DIR)) return 0;
    let files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
    if (Array.isArray(keys)) {
      const want = new Set(keys.map((k) => `${k.replace(/[^a-z0-9_-]/gi, '_')}.json`));
      files = files.filter((f) => want.has(f));
    }
    for (const f of files) fs.unlinkSync(path.join(CACHE_DIR, f));
    return files.length;
  } catch (err) {
    console.error('[cache] clear failed:', err.message);
    return 0;
  }
}

export function setCached(key, value) {
  try {
    ensureDir();
    const file = cachePath(key);
    fs.writeFileSync(
      file,
      JSON.stringify({ timestamp: Date.now(), value }, null, 2)
    );
  } catch (err) {
    console.error('[cache] write failed:', err.message);
  }
}

/**
 * Wraps an async producer with caching. On producer failure, falls back
 * to stale cache (ignoring TTL) if any exists, so the app degrades gracefully.
 */
export async function withCache(key, producer, ttlMinutes = TTL_MINUTES) {
  const fresh = getCached(key, ttlMinutes);
  if (fresh !== null) return { data: fresh, cached: true };

  try {
    const value = await producer();
    setCached(key, value);
    return { data: value, cached: false };
  } catch (err) {
    const stale = getCached(key, Infinity);
    if (stale !== null) {
      console.warn(`[cache] producer failed for ${key}, serving stale.`);
      return { data: stale, cached: true, stale: true };
    }
    throw err;
  }
}
