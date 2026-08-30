// Human-readable diagnosis of an HTMLMediaElement failure, so a video/audio
// that won't load tells the user WHICH file, from WHERE, and WHY — instead of
// silently leaving "No media loaded" on screen.

export function describeMediaError(el: HTMLMediaElement, name: string, url: string): string {
  const code = el.error?.code;
  const detail = el.error?.message ? ` (${el.error.message})` : '';
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return `Loading of "${name}" was aborted${detail}.`;
    case MediaError.MEDIA_ERR_NETWORK:
      return `Network error loading "${name}" from ${url}. Is the CAST server running?${detail}`;
    case MediaError.MEDIA_ERR_DECODE:
      return `"${name}" is corrupt or uses a codec this browser can't decode${detail}.`;
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      // The common iPhone case: .MOV is HEVC/H.265, which Chrome usually can't play.
      return `Can't play "${name}" — the browser doesn't support this file's codec. ` +
        `iPhone .MOV files are often HEVC/H.265; re-encode to H.264 MP4 and re-import${detail}.`;
    default:
      // No MediaError set — usually a 404 (file missing) or the server being down.
      return `Failed to load "${name}" from ${url}. The file may be missing from the project ` +
        `folder or the server may be unavailable${detail}.`;
  }
}
