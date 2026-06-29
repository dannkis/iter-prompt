import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.mjs';

test('concurrent writes serialize and failed changes do not damage persisted data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'iter-prompt-'));
  try {
    const store = new Store(directory);
    await store.init();
    await Promise.all(Array.from({ length: 15 }, (_, index) => store.mutate(state => {
      state.experiments.push({ id: String(index) }); return index;
    })));
    await assert.rejects(store.mutate(state => { state.experiments = []; throw new Error('Invalid update'); }));
    assert.equal((await store.read()).experiments.length, 15);
    const reopened = new Store(directory);
    await reopened.init();
    assert.equal((await reopened.read()).experiments.length, 15);
    await assert.rejects(store.saveAsset('data:image/png;base64,YmFk', 'fake.png'), /file content/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
