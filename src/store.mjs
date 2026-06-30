import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from './domain.mjs';

export class Store {
  constructor(directory, seed = () => ({ version: 1, experiments: [] })) {
    this.directory = directory;
    this.file = join(directory, 'workspace.json');
    this.seed = seed;
    this.queue = Promise.resolve();
  }
  async init() {
    await mkdir(join(this.directory, 'assets'), { recursive: true });
    try { this.state = JSON.parse(await readFile(this.file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Workspace data could not be read. Back it up before attempting repair.');
      this.state = this.seed();
      await this.persist(this.state);
    }
    if (this.state.version !== 1 || !Array.isArray(this.state.experiments)) throw new Error('Unsupported workspace format.');
  }
  async persist(state) {
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(temporary, this.file);
  }
  async read() { await this.queue; return structuredClone(this.state); }
  mutate(callback) {
    const operation = this.queue.then(async () => {
      const next = structuredClone(this.state);
      const result = await callback(next);
      await this.persist(next);
      this.state = next;
      return structuredClone(result);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async saveAsset(dataUrl, name = 'image') {
    if (typeof dataUrl !== 'string') throw new AppError('An image is required.');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(dataUrl);
    if (!match) throw new AppError('Upload a PNG, JPEG, or WebP image.');
    const data = Buffer.from(match[2], 'base64');
    if (!data.length || data.length > 12 * 1024 * 1024) throw new AppError('Images must be smaller than 12 MB.');
    const valid = (match[1] === 'png' && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
      || (match[1] === 'jpeg' && data.subarray(0, 3).equals(Buffer.from([255,216,255])))
      || (match[1] === 'webp' && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP');
    if (!valid) throw new AppError('The file content does not match its image format.');
    const file = randomUUID() + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]);
    await writeFile(join(this.directory, 'assets', file), data, { mode: 0o600 });
    return { url: '/files/' + file, name: String(name).slice(0, 160), mime: 'image/' + match[1], bytes: data.length };
  }
}
