import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTER_COUNT } from '../src/config.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/atlases.json', import.meta.url))
);

test('the manifest describes both tiers', () => {
  assert.deepEqual(Object.keys(manifest.tiers).sort(), ['desktop', 'mobile']);
});

test('each tier lists ten characters plus a shockwave', () => {
  const expectedCharacters = Array.from({ length: CHARACTER_COUNT }, (_, i) =>
    `char_${String(i + 1).padStart(2, '0')}`
  );
  for (const [name, tier] of Object.entries(manifest.tiers)) {
    assert.equal(tier.characters.length, CHARACTER_COUNT, `${name} character count`);
    assert.deepEqual(tier.characters, expectedCharacters, `${name} character list`);
    assert.equal(
      new Set(tier.characters).size,
      tier.characters.length,
      `${name} characters are unique`
    );
    assert.equal(tier.shockwave, 'shockwave');
    assert.equal(tier.suffix, name);
  }
});
