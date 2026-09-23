// Public configuration only. Never add credentials to this file.
export const MAX_PROMPT_LENGTH = 1700; // Reserve space for the style suffix.
export const STYLE_SUFFIXES = {
  Cinematic: "Cinematic composition, dramatic natural lighting, rich detail, film-like color grading.",
  Illustration: "Editorial illustration, expressive shapes, painterly textures, carefully composed colors.",
  Dreamscape: "Surreal dreamlike atmosphere, imaginative scenery, ethereal lighting, otherworldly detail.",
  "3D art": "Detailed 3D render, sculptural forms, physically based materials, soft studio lighting.",
} as const;
export type GenerationStyle = keyof typeof STYLE_SUFFIXES;
export const CANVASES = { square: [1024, 1024], landscape: [1024, 768], portrait: [768, 1024] } as const;
export type Canvas = keyof typeof CANVASES;
export type Engine = "schnell" | "phoenix";
