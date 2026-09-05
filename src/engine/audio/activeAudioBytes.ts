// The currently-loaded audio track's raw bytes, kept outside the store (a
// zustand store is the wrong place for a multi-MB binary blob). Two
// consumers need these bytes: the live <audio> element (via an object URL)
// and VideoExporter, which writes them to a temp file to mux into the
// exported MP4. Both read through here rather than re-decoding/re-fetching.
let bytes: Uint8Array | null = null;
let objectUrl: string | null = null;

export function setActiveAudioBytes(next: Uint8Array | null): string | null {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
  bytes = next;
  if (next) {
    objectUrl = URL.createObjectURL(new Blob([next.slice()], { type: "audio/mpeg" }));
  }
  return objectUrl;
}

export function getActiveAudioBytes(): Uint8Array | null {
  return bytes;
}

export function getActiveAudioObjectUrl(): string | null {
  return objectUrl;
}
