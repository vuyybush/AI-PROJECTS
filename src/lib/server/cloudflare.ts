import "server-only";
import { STYLE_SUFFIXES, CANVASES, type Canvas, type Engine, type GenerationStyle } from "../../config/generation";
import { GenerationError, readLimited } from "./http";

const SCHNELL_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const PHOENIX_MODEL = "@cf/leonardo/phoenix-1.0";
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

type ImageResult = {
  bytes: Uint8Array;
  mime: string;
  model: string;
  fallback: boolean;
};

class ModelCapacityError extends Error {
  constructor(public model: string) {
    super(`No capacity for ${model}`);
    this.name = "ModelCapacityError";
  }
}

export async function generateCloudflareImage(
  input: { prompt: string; style: GenerationStyle; engine: Engine; canvas: Canvas; styleNotes: string }, signal: AbortSignal,
): Promise<ImageResult> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!account || !/^[a-f0-9]{32}$/i.test(account) || !token) {
    throw new GenerationError(503, "NOT_CONFIGURED", "Image generation is not configured. Check the server environment variables.");
  }

  const finalPrompt = `${input.prompt}\n\nVisual style: ${STYLE_SUFFIXES[input.style]}\n${input.styleNotes}`;
  if (finalPrompt.length > 2048) throw new GenerationError(400, "INVALID_PROMPT", "Shorten the prompt and try again.");

  const [width, height] = CANVASES[input.canvas];
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const primary: { model: string; payload: Record<string, string | number> } = input.engine === "phoenix"
    ? { model: PHOENIX_MODEL, payload: { prompt: finalPrompt, width, height, num_steps: 10, seed } }
    : { model: SCHNELL_MODEL, payload: { prompt: finalPrompt, num_steps: 4, width: 1024, height: 1024, seed } };
  try {
    return { ...await runModel(account, token, primary.model, primary.payload, signal), model: primary.model, fallback: false };
  } catch (error) {
    if(error instanceof ModelCapacityError)throw new GenerationError(503,"MODEL_BUSY","This image model is busy. Try again later.",60);
    throw error;
  }
}

async function runModel(
  account: string,
  token: string,
  model: string,
  payload: Record<string, string | number>,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      model === "@cf/black-forest-labs/flux-1-schnell"
        ? { prompt: payload.prompt, steps: 4 }
        : payload
    ),
    signal,
    cache: "no-store",
    redirect: "error",
  });

  if (response.ok && response.headers.get("content-type")?.startsWith("image/")) {
    return inspectImage(await readImage(response));
  }

  let data;
  try {
    data = JSON.parse(await readLimited(response.body, 5 * 1024 * 1024));
  } catch (error) {
    if (signal.aborted) throw error;
    throw new GenerationError(502, "INVALID_RESPONSE", "The image service returned an unreadable response. Please try again later.");
  }

  const codes = Array.isArray(data?.errors)
    ? data.errors.map((error: { code?: number }) => Number(error?.code)).filter(Number.isFinite)
    : [];

  if (!response.ok || data?.success !== true) {
    console.warn("[DreamForge] Cloudflare image request failed.", {
      model,
      status: response.status,
      codes,
      errors: data?.errors,
      requestId: response.headers.get("cf-ray"),
    });
  }

  if (codes.includes(3036) || codes.includes(4006)) {
    throw new GenerationError(429, "DAILY_LIMIT", "The Cloudflare daily generation allowance is exhausted. It resets at 00:00 UTC (5:30 AM IST).");
  }
  if (codes.includes(3040)) throw new ModelCapacityError(model);
  if (response.status === 429) {
    throw new GenerationError(429, "RATE_LIMIT", "Cloudflare rejected too many requests. Wait one minute, then generate one image at a time.");
  }
  if ([401, 403].includes(response.status)) {
    throw new GenerationError(503, "PROVIDER_ACCESS", "Cloudflare access failed. Check the server token, permissions, and account ID.");
  }
  if ([408, 504].includes(response.status) || codes.includes(3007) || codes.includes(3008)) {
    throw new GenerationError(504, "TIMEOUT", "Generation timed out. Please try again later.");
  }
  if (!response.ok || data?.success !== true) {
    throw new GenerationError(502, "GENERATION_FAILED", "Cloudflare could not complete this request. Check the server terminal for its status and error code.");
  }

  const encoded = data?.result?.image;
  if (typeof encoded !== "string" || !encoded || encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new GenerationError(502, "INVALID_IMAGE", "The image service returned an invalid image.");
  }
  return inspectImage(Buffer.from(encoded, "base64"));
}

async function readImage(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new GenerationError(502, "INVALID_IMAGE", "No image was returned.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel();
        throw new GenerationError(502, "INVALID_IMAGE", "Image exceeded the response limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function inspectImage(bytes: Uint8Array): { bytes: Uint8Array; mime: string } {
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const png = bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (bytes.length < 4 || bytes.length > MAX_IMAGE_BYTES || (!jpeg && !png)) {
    throw new GenerationError(502, "INVALID_IMAGE", "The image service returned an unsupported image.");
  }
  return { bytes: new Uint8Array(bytes), mime: jpeg ? "image/jpeg" : "image/png" };
}