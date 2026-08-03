const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/;

function hostnameMatchesYouTube(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'youtu.be' || YOUTUBE_HOSTS.has(host);
}

function idFromPath(pathname: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  // youtu.be/<id>
  if (segments.length === 1) {
    return YOUTUBE_ID_PATTERN.test(segments[0]) ? segments[0] : null;
  }

  const [prefix, maybeId] = segments;
  if (['embed', 'v', 'shorts', 'live'].includes(prefix) && maybeId && YOUTUBE_ID_PATTERN.test(maybeId)) {
    return maybeId;
  }

  return null;
}

export function parseYouTubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!hostnameMatchesYouTube(parsed.hostname)) return null;

  if (parsed.hostname.toLowerCase() === 'youtu.be') {
    return idFromPath(parsed.pathname);
  }

  const fromQuery = parsed.searchParams.get('v');
  if (fromQuery && YOUTUBE_ID_PATTERN.test(fromQuery)) {
    return fromQuery;
  }

  return idFromPath(parsed.pathname);
}
