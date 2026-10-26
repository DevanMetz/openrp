import type { LogFiles } from '../../server/storage.ts';

/** Byte-addressed storage double for runtime-independent aggregation tests. */
export class MemoryFiles implements LogFiles {
  private values = new Map<string, Uint8Array>();
  async list() {
    return [...this.values.keys()];
  }
  private get(name: string) {
    const value = this.values.get(name);
    if (!value) throw new Error(`Missing fixture: ${name}`);
    return value;
  }
  async size(name: string) {
    return this.get(name).length;
  }
  async read(name: string) {
    return new TextDecoder().decode(this.get(name));
  }
  async range(name: string, start: number, length: number) {
    return this.get(name).slice(start, start + length);
  }
  async write(name: string, value: string) {
    this.values.set(name, new TextEncoder().encode(value));
  }
  async append(name: string, value: string) {
    const previous = this.values.get(name) ?? new Uint8Array();
    const bytes = new TextEncoder().encode(value);
    const result = new Uint8Array(previous.length + bytes.length);
    result.set(previous);
    result.set(bytes, previous.length);
    this.values.set(name, result);
  }
  async remove(name: string) {
    this.values.delete(name);
  }
}
