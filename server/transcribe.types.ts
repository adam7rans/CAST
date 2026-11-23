export type TranscribeEvent =
  | { type: 'video_saved'; message: string }
  | { type: 'video_optimizing'; message: string }
  | { type: 'video_optimized'; message: string; originalBytes: number; optimizedBytes: number }
  | { type: 'video_optimization_skipped'; message: string }
  | { type: 'video_optimization_failed'; message: string }
  | { type: 'caption_saved'; message: string }
  | { type: 'audio_extracting'; message: string }
  | { type: 'audio_extracted'; message: string }
  | { type: 'submitted'; message: string }
  | { type: 'polling'; status: string; message: string }
  | { type: 'done'; message: string }
  | { type: 'error'; message: string };
