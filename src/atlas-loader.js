import { parseAtlas } from './atlas.js';

// Assets are fetched, not assigned to <img>.src: a strict page img-src CSP can
// block an extension-URL image element, while a content-script fetch runs in
// the isolated world and is not subject to page CSP.
export function createAtlasLoader({ tier, resolveUrl }) {
  const resolve = resolveUrl || ((path) => chrome.runtime.getURL(path));

  return async function load(key) {
    const base = `assets/${tier}/${key}_${tier}`;
    const response = await fetch(resolve(`${base}.json`));
    if (!response.ok) throw new Error(`atlas json ${key}: ${response.status}`);
    const json = await response.json();
    const parsed = parseAtlas(json);

    const imageResponse = await fetch(resolve(`assets/${tier}/${parsed.image}`));
    if (!imageResponse.ok) throw new Error(`atlas image ${key}: ${imageResponse.status}`);
    const blob = await imageResponse.blob();
    const image = await createImageBitmap(blob);

    return { image, frames: parsed.frames };
  };
}
