/** Minimal streaming HTTP port shared by account, moderation and analytics handlers. */
export interface HttpRequest extends AsyncIterable<Uint8Array> {
  method?: string;
  url?: string;
  headers: { authorization?: string; 'content-type'?: string };
  setTimeout(ms: number, callback: () => void): void;
  destroy(): void;
}
export interface HttpResponse {
  destroyed: boolean;
  setHeader(name: string, value: string | number): void;
  writeHead(status: number, headers?: Record<string, string>): void;
  end(body?: string): void;
}
export async function handleHttp(
  request: Request,
  handler: (req: HttpRequest, res: HttpResponse) => Promise<void>,
): Promise<Response> {
  let status = 200,
    body = '';
  const headers = new Headers();
  const reader = request.body?.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const res: HttpResponse = {
    destroyed: false,
    setHeader: (key, value) => {
      headers.set(key, String(value));
    },
    writeHead: (code, values) => {
      status = code;
      for (const [k, v] of Object.entries(values ?? {})) headers.set(k, v);
    },
    end: (value = '') => {
      body = value;
    },
  };
  const req: HttpRequest = {
    method: request.method,
    url: new URL(request.url).pathname + new URL(request.url).search,
    headers: Object.fromEntries(request.headers),
    setTimeout: (ms, callback) => {
      timer = setTimeout(callback, ms);
    },
    destroy: () => {
      res.destroyed = true;
      void reader?.cancel();
    },
    async *[Symbol.asyncIterator]() {
      if (!reader) return;
      while (true) {
        const part = await reader.read();
        if (part.done) return;
        yield part.value;
      }
    },
  };
  try {
    await handler(req, res);
  } finally {
    clearTimeout(timer);
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
  }
  return new Response(res.destroyed ? '{"error":"Request timed out"}' : body, {
    status: res.destroyed ? 408 : status,
    headers,
  });
}
