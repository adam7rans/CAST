export class ClipFinderError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

export function publicClipError(error: unknown): ClipFinderError {
  return error instanceof ClipFinderError ? error : new ClipFinderError(
    'discovery_failed', 'Clip discovery failed. No clips were changed. Try again.', 502,
  );
}
