import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = path.join(root, 'manifest.json');

// Read + parse once, at module scope: if manifest.json is missing or is not
// valid JSON, every test below fails loudly rather than silently skipping.
const manifestSource = readFileSync(manifestPath, 'utf8');
const manifest = JSON.parse(manifestSource);

test('manifest.json parses to an object with manifest_version 3', () => {
  assert.equal(typeof manifest, 'object');
  assert.equal(manifest.manifest_version, 3);
});

test('content_scripts has exactly one entry, all_frames false', () => {
  assert.ok(Array.isArray(manifest.content_scripts));
  assert.equal(manifest.content_scripts.length, 1);
  assert.equal(manifest.content_scripts[0].all_frames, false);
});

test('every content_scripts[].js path exists on disk', () => {
  for (const entry of manifest.content_scripts) {
    assert.ok(Array.isArray(entry.js) && entry.js.length > 0, 'entry has no js files');
    for (const jsPath of entry.js) {
      assert.ok(existsSync(path.join(root, jsPath)), `content script ${jsPath} does not exist`);
    }
  }
});

test('every icon path in icons exists on disk', () => {
  assert.ok(manifest.icons && typeof manifest.icons === 'object', 'manifest.icons is missing');
  const sizes = Object.keys(manifest.icons);
  assert.ok(sizes.length > 0, 'manifest.icons has no entries');
  for (const iconPath of Object.values(manifest.icons)) {
    assert.ok(existsSync(path.join(root, iconPath)), `icon ${iconPath} does not exist`);
  }
});

test('web_accessible_resources covers src/*.js and both asset tiers', () => {
  assert.ok(
    Array.isArray(manifest.web_accessible_resources) && manifest.web_accessible_resources.length > 0,
    'manifest.web_accessible_resources is missing or empty'
  );
  const resources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);
  assert.ok(resources.includes('src/*.js'), 'src/*.js is not web-accessible');
  assert.ok(
    resources.some((pattern) => pattern.startsWith('assets/desktop/')),
    'no web-accessible pattern covers assets/desktop/'
  );
  assert.ok(
    resources.some((pattern) => pattern.startsWith('assets/mobile/')),
    'no web-accessible pattern covers assets/mobile/'
  );
});

test('src/main.js imports only local modules that exist on disk', () => {
  const mainPath = path.join(root, 'src', 'main.js');
  assert.ok(existsSync(mainPath), 'src/main.js does not exist');
  const source = readFileSync(mainPath, 'utf8');
  const specifiers = [...source.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(specifiers.length > 0, 'src/main.js has no relative imports to check');
  for (const specifier of specifiers) {
    const resolved = path.join(root, 'src', specifier);
    assert.ok(existsSync(resolved), `src/main.js imports ${specifier}, which does not exist`);
  }
});
