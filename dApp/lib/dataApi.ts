export type DataApiConfig = {
  url: string;
  key: string;
  dataSource: string;
  db: string;
};

export class DataApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function getConfig(): DataApiConfig {
  const url = process.env.DATA_API_URL;
  const key = process.env.DATA_API_KEY;
  const dataSource = process.env.DATA_API_DATA_SOURCE;
  const db = process.env.DATA_API_DB;
  if (!url || !key || !dataSource || !db) {
    throw new DataApiError('CONFIG_MISSING', 'Data API env vars missing', 500);
  }
  return { url, key, dataSource, db } as DataApiConfig;
}

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  if (signal) signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

async function callDataApi(action: string, body: Record<string, unknown>, opts?: { timeoutMs?: number }) {
  const cfg = getConfig();
  const endpoint = `${cfg.url.replace(/\/$/, '')}/action/${action}`;
  const timeoutMs = opts?.timeoutMs ?? 10000;
  const { signal, cancel } = withTimeout(undefined, timeoutMs);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': cfg.key,
      },
      body: JSON.stringify({
        dataSource: cfg.dataSource,
        database: cfg.db,
        ...body,
      }),
      signal,
      // Explicitly disable Next caching for DB calls
      cache: 'no-store',
    });

    const isJson = res.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const status = res.status;
      // Normalize common errors
      if (status === 401 || status === 403) {
        throw new DataApiError('DB_UNAUTHORIZED', 'Data API unauthorized', 502);
      }
      if (status >= 400 && status < 500) {
        throw new DataApiError('DB_BAD_REQUEST', typeof payload === 'string' ? payload : 'Data API bad request', 400);
      }
      throw new DataApiError('DB_ERROR', typeof payload === 'string' ? payload : 'Data API error', 502);
    }

    return payload;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new DataApiError('DB_TIMEOUT', 'Data API timeout', 504);
    }
    if (err instanceof DataApiError) throw err;
    throw new DataApiError('DB_ERROR', 'Data API fetch failed');
  } finally {
    cancel();
  }
}

export async function findLatestCampaigns(limit = 50) {
  const result = await callDataApi('find', {
    collection: 'campaigns',
    filter: {},
    sort: { createdAt: -1 },
    limit,
  });
  // Data API returns { documents: [...] }
  return (result?.documents ?? []) as any[];
}

export async function insertOne(collection: string, document: Record<string, unknown>) {
  const result = await callDataApi('insertOne', {
    collection,
    document,
  });
  return result?.insertedId as string | undefined;
}

export async function find(collection: string, body: Record<string, unknown>) {
  const result = await callDataApi('find', {
    collection,
    ...body,
  });
  return (result?.documents ?? []) as any[];
}
