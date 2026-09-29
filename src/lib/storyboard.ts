export type Character = { id: string; name: string; description: string; wardrobe: string };
export type Scene = { id: string; title: string; action: string; setting: string; shot: string };
export type Board = { version: 1; title: string; characterId: string; characters: Character[]; scenes: Scene[]; direction: string };
export const MAX_SCENES = 6;
export const MAX_CHARACTERS = 8;
export function starterBoard(): Board {
  return { version: 1, title: "A small discovery", characterId: "character-1", direction: "Warm cinematic light, natural colors, detailed materials.", characters: [{ id: "character-1", name: "Pip", description: "A small fictional orange robot with a square head, two round teal eyes and a white chest panel", wardrobe: "A blue canvas satchel" }], scenes: [{ id: "scene-1", title: "Arrival", action: "Steps onto a quiet garden path", setting: "A rooftop garden at sunrise", shot: "Wide shot" }, { id: "scene-2", title: "Discovery", action: "Carefully examines a tiny flowering plant", setting: "The same rooftop garden at sunrise", shot: "Medium shot" }, { id: "scene-3", title: "A closer look", action: "Holds a watering can beside the plant", setting: "The same rooftop garden at sunrise", shot: "Close-up" }] };
}
export function composePrompt(board: Board, scene: Scene): string {
  const c = board.characters.find(c => c.id === board.characterId);
  if (!c) return "";
  return [c.description.trim(), c.wardrobe.trim() ? `Wearing/carrying: ${c.wardrobe.trim()}` : "", `Action: ${scene.action.trim()}`, `Location: ${scene.setting.trim()}`, scene.shot, board.direction.trim()].filter(Boolean).join(". ");
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown, n: number): x is string => typeof x === "string" && x.length <= n;
export function parseBoard(value: unknown): Board {
  if (!record(value) || value.version !== 1 || !text(value.title, 80) || !text(value.direction, 200) || !text(value.characterId, 80) || !Array.isArray(value.characters) || !Array.isArray(value.scenes)) throw Error("Choose a DreamForge storyboard JSON export.");
  if (!value.characters.length || value.characters.length > MAX_CHARACTERS || !value.scenes.length || value.scenes.length > MAX_SCENES) throw Error("Use 1–8 characters and 1–6 scenes.");
  const characters = value.characters.map(c => {
    if (!record(c) || !text(c.id, 80) || !c.id || !text(c.name, 40) || !c.name.trim() || !text(c.description, 500) || !text(c.wardrobe, 160)) throw Error("Invalid character profile.");
    return { id: c.id, name: c.name, description: c.description, wardrobe: c.wardrobe };
  });
  const scenes = value.scenes.map(s => {
    if (!record(s) || !text(s.id, 80) || !s.id || !text(s.title, 60) || !text(s.action, 350) || !text(s.setting, 250) || !text(s.shot, 60)) throw Error("Invalid scene.");
    return { id: s.id, title: s.title, action: s.action, setting: s.setting, shot: s.shot };
  });
  if (new Set(characters.map(c=>c.id)).size !== characters.length || new Set(scenes.map(s=>s.id)).size !== scenes.length || !characters.some(c=>c.id===value.characterId)) throw Error("Invalid or duplicate identifiers.");
  return {version: 1, title: value.title, direction: value.direction, characterId: value.characterId, characters, scenes};
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function exportBoard(board: Board) {
  return {...board, prompts:board.scenes.map(scene=>({id:scene.id,title:scene.title,prompt:composePrompt(board,scene)}))};
}
export function storyboardHtml(board: Board, frames: Record<string,string>): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(board.title)}</title><style>body{font:16px system-ui;color:#191919;max-width:1000px;margin:40px auto;padding:20px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px}article{border:1px solid #ddd;padding:20px;break-inside:avoid}img{width:100%;height:220px;object-fit:contain;background:#eee}p{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#555}@media print{body{margin:0}article{break-inside:avoid}}</style><h1>${escapeHtml(board.title)}</h1><p>DreamForge storyboard • Reference descriptions guide prompts; identity is not guaranteed.</p><section>${board.scenes.map((s,i)=>`<article><h2>${i+1}. ${escapeHtml(s.title)}</h2>${/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(frames[s.id]??'')?`<img alt="Manually attached scene artwork" src="${frames[s.id]}"><small>Manually attached artwork</small>`:'<p>No artwork attached.</p>'}<p>${escapeHtml(composePrompt(board,s))}</p></article>`).join('')}</section></html>`;
}
