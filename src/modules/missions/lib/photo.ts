import { compressImage, readExifDate } from '../platform'

export const PHOTO_MAX_EDGE = 1600
export const PHOTO_MAX_BYTES = 350 * 1024

/** A photo ready for upload: resized (longest side 1600 px), re-encoded JPEG ≤ ~350 KB, with the capture time read first. */
export async function preparePhoto(file: File): Promise<{ blob: Blob; capturedAt: string | null }> {
  const taken = await readExifDate(file)
  const blob = await compressImage(file, { maxEdge: PHOTO_MAX_EDGE, maxBytes: PHOTO_MAX_BYTES })
  return { blob, capturedAt: taken ? taken.toISOString() : null }
}
