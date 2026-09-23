import { MAX_PROMPT_LENGTH, STYLE_SUFFIXES, CANVASES, type Canvas, type Engine, type GenerationStyle } from "../../config/generation";
import { GenerationError } from "../server/http";

export function validateGeneration(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GenerationError(400, "INVALID_INPUT", "Send a prompt and a supported style.");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["prompt", "style", "engine", "canvas", "styleNotes"].includes(key))) {
    throw new GenerationError(400, "INVALID_INPUT", "Unsupported generation setting.");
  }
  if (typeof input.prompt !== "string" || input.prompt.trim().length < 3 || input.prompt.length > MAX_PROMPT_LENGTH) {
    throw new GenerationError(400, "INVALID_PROMPT", `Use a prompt between 3 and ${MAX_PROMPT_LENGTH} characters.`);
  }
  if (typeof input.style !== "string" || !Object.hasOwn(STYLE_SUFFIXES, input.style)) {
    throw new GenerationError(400, "INVALID_STYLE", "Choose one of the available styles.");
  }
  const engine = input.engine ?? "schnell";
  const canvas = input.canvas ?? "square";
  const styleNotes = input.styleNotes ?? "";
  if (engine !== "schnell" && engine !== "phoenix") throw new GenerationError(400, "INVALID_ENGINE", "Choose an available model.");
  if (typeof canvas !== "string" || !Object.hasOwn(CANVASES, canvas) || (engine === "schnell" && canvas !== "square")) throw new GenerationError(400, "INVALID_CANVAS", "This model does not support the selected canvas.");
  if (typeof styleNotes !== "string" || styleNotes.length > 160) throw new GenerationError(400, "INVALID_STYLE_NOTES", "Keep style notes within 160 characters.");
  return { prompt: input.prompt.trim(), style: input.style as GenerationStyle, engine: engine as Engine, canvas: canvas as Canvas, styleNotes: styleNotes.trim() };
}
