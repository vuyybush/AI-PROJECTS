import "server-only";

export class GenerationError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?:number) { super(message); }
}

export async function readLimited(stream: ReadableStream<Uint8Array> | null, maximum: number): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        throw new GenerationError(413, "TOO_LARGE", "The request or image is too large. Try a shorter prompt.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
