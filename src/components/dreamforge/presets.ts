export const presets = ["Cinematic", "Illustration", "Dreamscape", "3D art"] as const;
export type StylePreset = (typeof presets)[number];
export const examples = [
  { title: "Somewhere, beyond.", category: "CINEMATIC", image: "portal", prompt: "A monumental sandstone doorway opening into a sunlit world, beside a still turquoise lake", style: "Cinematic" },
  { title: "A softer kind of wild.", category: "ILLUSTRATION", image: "botanical", prompt: "An oversized botanical garden growing beside a quiet lake, warm sun and painterly textures", style: "Illustration" },
  { title: "The hour between.", category: "DREAMSCAPE", image: "blue-hour", prompt: "A mysterious stone portal beside a blue mountain lake at twilight, a glowing moon beyond", style: "Dreamscape" },
  { title: "Built from a daydream.", category: "3D ART", image: "dunes", prompt: "A sculptural terracotta arch among rolling peach sand dunes, soft studio-like desert light", style: "3D art" },
] satisfies { title: string; category: string; image: string; prompt: string; style: StylePreset }[];
