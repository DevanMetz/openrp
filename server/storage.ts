/** Range reads keep reverse log queries bounded independently of retained log size. */
export interface LogFiles {
  list(): Promise<string[]>;
  size(name: string): Promise<number>;
  read(name: string): Promise<string>;
  range(name: string, start: number, length: number): Promise<Uint8Array>;
  write(name: string, data: string): Promise<void>;
  append(name: string, data: string): Promise<void>;
  remove(name: string): Promise<void>;
}
