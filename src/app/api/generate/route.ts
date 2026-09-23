import { requireAccount, checkOrigin } from "../../../lib/server/accounts";
import { saveGeneration } from "../../../lib/server/history";
import { validateGeneration } from "../../../lib/validators/generation";
import { generateCloudflareImage } from "../../../lib/server/cloudflare";
import { GenerationError, readLimited } from "../../../lib/server/http";
import { reserveGeneration } from "../../../lib/server/quota";
import { verifyHuman } from "../../../lib/server/turnstile";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  let reservation:Awaited<ReturnType<typeof reserveGeneration>>|undefined;
  const controller = new AbortController();
  const disconnect = () => controller.abort();
  request.signal.addEventListener("abort", disconnect, { once: true });
  if (request.signal.aborted) controller.abort();
  const deadline = setTimeout(() => controller.abort(), 50_000);
  try {
    checkOrigin(request);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new GenerationError(415, "INVALID_CONTENT_TYPE", "Send the request as JSON.");
    }
    const text = await readLimited(request.body, 16_384);
    let value;
    try { value = JSON.parse(text); }
    catch { throw new GenerationError(400, "INVALID_JSON", "The request contains invalid JSON."); }
    if(!value||typeof value!=="object"||Array.isArray(value))throw new GenerationError(400,"INVALID_INPUT","Send a valid generation request.");
    const {turnstileToken,...settings}=value;
    const input = validateGeneration(settings);
    const { client, user } = await requireAccount();
    if(!user.email_confirmed_at)throw new GenerationError(403,"CONFIRM_EMAIL","Confirm your email before generating.");
    await verifyHuman(turnstileToken,"generate");
    reservation=await reserveGeneration(user.id,input.engine);
    controller.signal.throwIfAborted();
    const image = await generateCloudflareImage(input, controller.signal);
    let historyId = "";
    try { historyId = await saveGeneration(client, user.id, input, image); }
    catch { /* Deliver the image even when persistence fails. Never claim it saved. */ }
    return new Response(image.bytes as BodyInit, {
      headers: {
        ...HEADERS,
        "Content-Type": image.mime,
        "X-History-Saved": historyId ? "true" : "false",
        "X-History-Id": historyId,
        "X-Generation-Model": image.model,
        "X-Generation-Fallback": String(image.fallback),
        "X-User-Remaining": String(reservation.remaining),
      },
    });
  } catch (error) {
    const safe = controller.signal.aborted
      ? new GenerationError(504, "TIMEOUT", "Generation was interrupted or took too long. Try again later.")
      : error instanceof GenerationError ? error
      : new GenerationError(502, "UNAVAILABLE", "Could not reach the image service. Please try again later.");
    return Response.json({ error: { code: safe.code, message: safe.message, retryAfter:safe.retryAfter } }, { status: safe.status, headers: {...HEADERS,...(safe.retryAfter?{"Retry-After":String(safe.retryAfter)}:{})} });
  } finally {
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", disconnect);
    await reservation?.release();
  }
}
