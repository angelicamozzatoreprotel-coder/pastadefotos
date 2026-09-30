import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// Registro em arquivo dos clientes já processados pelo polling.
export class ProcessedStore {
  constructor(file) {
    this.file = file;
    this.ids = new Set();
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      this.ids = new Set((data.processed ?? []).map(String));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.ids = new Set();
    }
    return this;
  }

  has(id) {
    return this.ids.has(String(id));
  }

  async add(id) {
    this.ids.add(String(id));
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify({ processed: [...this.ids] }, null, 2));
    await rename(tmp, this.file);
  }
}
