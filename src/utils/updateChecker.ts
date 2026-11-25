export const APP_VERSION = '1.2.0';
export const GITHUB_REPO = 'SofyanAgusAditya/Financial_Tracker';
export const GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
export const GITHUB_RELEASES_FALLBACK_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;

const UPDATE_CHECK_TIMEOUT_MS = 5000;

export interface ReleaseUpdateInfo {
  version: string;
  tagName: string;
  title: string;
  notes: string;
  releaseUrl: string;
  apkDownloadUrl?: string;
  publishedAt?: string;
}

export type UpdateCheckResult =
  | { status: 'update_available'; release: ReleaseUpdateInfo }
  | { status: 'up_to_date'; currentVersion: string; latestVersion: string }
  | { status: 'unavailable' };

interface SemverParts {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

interface GitHubReleaseAsset {
  name?: unknown;
  browser_download_url?: unknown;
}

interface GitHubReleasePayload {
  tag_name?: unknown;
  name?: unknown;
  body?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  draft?: unknown;
  assets?: unknown;
}

export function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^v/i, '');
}

export function parseSemverParts(raw: string): SemverParts | null {
  const normalized = normalizeVersion(raw);
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
    normalized
  );
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = match[3] ? Number(match[3]) : 0;
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }

  return {
    major,
    minor,
    patch,
    prerelease: match[4] ?? null,
  };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  if (!pa || !pb) return 0;

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  if (pa.prerelease === null && pb.prerelease !== null) return 1;
  if (pa.prerelease !== null && pb.prerelease === null) return -1;
  if (pa.prerelease !== null && pb.prerelease !== null) {
    if (pa.prerelease === pb.prerelease) return 0;
    return pa.prerelease.localeCompare(pb.prerelease, undefined, { numeric: true });
  }

  return 0;
}

export function isNewerVersion(
  latestVersion: string,
  currentVersion: string = APP_VERSION
): boolean {
  const parsedLatest = parseSemverParts(latestVersion);
  const parsedCurrent = parseSemverParts(currentVersion);
  if (!parsedLatest || !parsedCurrent) return false;
  return compareSemver(latestVersion, currentVersion) > 0;
}

/**
 * Checks GitHub Releases in the background with a short timeout.
 * Silently returns `{ status: 'unavailable' }` whenever offline, timed out,
 * rate-limited, or encountering malformed data so offline-first usage is unaffected.
 */
export async function checkForAppUpdate(
  currentVersion: string = APP_VERSION,
  timeoutMs: number = UPDATE_CHECK_TIMEOUT_MS
): Promise<UpdateCheckResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'unavailable' };
  }
  if (typeof fetch !== 'function') {
    return { status: 'unavailable' };
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(GITHUB_RELEASES_API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return { status: 'unavailable' };
    }

    const data = (await response.json()) as GitHubReleasePayload;
    if (!data || typeof data !== 'object' || data.draft === true) {
      return { status: 'unavailable' };
    }

    const rawTag = typeof data.tag_name === 'string' ? data.tag_name.trim() : '';
    const version = normalizeVersion(rawTag);
    if (!rawTag || !parseSemverParts(version)) {
      return { status: 'unavailable' };
    }

    const title =
      typeof data.name === 'string' && data.name.trim().length > 0
        ? data.name.trim()
        : rawTag;
    const notes = typeof data.body === 'string' ? data.body.trim() : '';
    const releaseUrl =
      typeof data.html_url === 'string' && /^https?:\/\//i.test(data.html_url)
        ? data.html_url
        : GITHUB_RELEASES_FALLBACK_URL;
    const publishedAt =
      typeof data.published_at === 'string' && data.published_at.trim().length > 0
        ? data.published_at.trim()
        : undefined;

    let apkDownloadUrl: string | undefined;
    if (Array.isArray(data.assets)) {
      const apkAsset = (data.assets as GitHubReleaseAsset[]).find(
        (asset) =>
          asset &&
          typeof asset === 'object' &&
          typeof asset.name === 'string' &&
          asset.name.toLowerCase().endsWith('.apk') &&
          typeof asset.browser_download_url === 'string' &&
          /^https?:\/\//i.test(asset.browser_download_url)
      );
      if (typeof apkAsset?.browser_download_url === 'string') {
        apkDownloadUrl = apkAsset.browser_download_url;
      }
    }

    if (isNewerVersion(version, currentVersion)) {
      return {
        status: 'update_available',
        release: {
          version,
          tagName: rawTag,
          title,
          notes,
          releaseUrl,
          apkDownloadUrl,
          publishedAt,
        },
      };
    }

    return {
      status: 'up_to_date',
      currentVersion: normalizeVersion(currentVersion),
      latestVersion: version,
    };
  } catch {
    return { status: 'unavailable' };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export function openReleaseUrl(release: ReleaseUpdateInfo | null): void {
  if (typeof window === 'undefined') return;
  const targetUrl = release?.releaseUrl || GITHUB_RELEASES_FALLBACK_URL;
  window.open(targetUrl, '_blank', 'noopener,noreferrer');
}
