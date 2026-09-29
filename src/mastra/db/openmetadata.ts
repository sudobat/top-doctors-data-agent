const DEFAULT_BASE_URL = 'http://localhost:8585';
export const PUBLISHED_STATUS = 'Approved';

export function isPublishedStatus(status: string | undefined): boolean {
  return !status || status === PUBLISHED_STATUS;
}

export type OmGlossaryTerm = {
  id?: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  synonyms?: string[];
  entityStatus?: string;
  glossary?: { name?: string; fullyQualifiedName?: string };
};

export type OmMetric = {
  id?: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  entityStatus?: string;
  metricType?: string;
  unitOfMeasurement?: string;
  metricExpression?: { language?: string; code?: string };
};

export type OmTable = {
  id?: string;
  name?: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  columns?: Array<{
    name?: string;
    displayName?: string;
    description?: string;
    dataType?: string;
  }>;
};

let cachedToken: { value: string; expiresAt: number } | undefined;

export function openMetadataBaseUrl(): string {
  return (process.env.OPENMETADATA_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
}

async function loginForToken(): Promise<string> {
  const email = process.env.OPENMETADATA_EMAIL || 'admin@open-metadata.org';
  const password = process.env.OPENMETADATA_PASSWORD || 'admin';
  // OpenMetadata expects the password field as base64.
  const passwordB64 = Buffer.from(password, 'utf8').toString('base64');
  const res = await fetch(`${openMetadataBaseUrl()}/api/v1/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: passwordB64 }),
  });
  if (!res.ok) {
    throw new Error(`OpenMetadata login failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { accessToken?: string; token?: string };
  const token = body.accessToken || body.token;
  if (!token) {
    throw new Error('OpenMetadata login response did not include an access token.');
  }
  return token;
}

export async function getOpenMetadataToken(): Promise<string> {
  const fromEnv = process.env.OPENMETADATA_JWT_TOKEN;
  if (fromEnv) return fromEnv;

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const token = await loginForToken();
  cachedToken = { value: token, expiresAt: now + 50 * 60 * 1000 };
  return token;
}

async function omFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getOpenMetadataToken();
  const url = path.startsWith('http') ? path : `${openMetadataBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`OpenMetadata API ${res.status} for ${path}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

type Paged<T> = { data?: T[]; paging?: { total?: number }; hits?: T[] };

function asList<T>(body: Paged<T> | T[]): T[] {
  if (Array.isArray(body)) return body;
  return body.data || body.hits || [];
}

/** Only Approved (published) glossary terms are returned. */
export async function searchPublishedGlossaryTerms(query: string, limit = 10): Promise<OmGlossaryTerm[]> {
  const q = encodeURIComponent(query.trim() || '*');
  const body = await omFetch<Paged<OmGlossaryTerm>>(
    `/api/v1/glossaryTerms/search?q=${q}&entityStatus=${PUBLISHED_STATUS}&limit=${limit}`,
  );
  return asList(body).filter(t => isPublishedStatus(t.entityStatus));
}

export async function getPublishedGlossaryTerm(fqnOrName: string): Promise<OmGlossaryTerm | null> {
  const fqn = encodeURIComponent(fqnOrName);
  try {
    const term = await omFetch<OmGlossaryTerm>(
      `/api/v1/glossaryTerms/name/${fqn}?fields=synonyms,relatedTerms,reviewers,owners`,
    );
    if (!isPublishedStatus(term.entityStatus)) {
      return null;
    }
    return term;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('404')) return null;
    throw err;
  }
}

/** Metrics with Approved status, or without status when the server omits it. */
export async function searchPublishedMetrics(query: string, limit = 10): Promise<OmMetric[]> {
  const q = query.trim().toLowerCase();
  const body = await omFetch<Paged<OmMetric>>(`/api/v1/metrics?limit=${Math.max(limit, 50)}&fields=owners`);
  const rows = asList(body).filter(m => isPublishedStatus(m.entityStatus));
  if (!q || q === '*') return rows.slice(0, limit);
  return rows
    .filter(m => {
      const hay = [m.name, m.displayName, m.fullyQualifiedName, m.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .slice(0, limit);
}

export async function getPublishedMetric(fqnOrName: string): Promise<OmMetric | null> {
  const fqn = encodeURIComponent(fqnOrName);
  try {
    const metric = await omFetch<OmMetric>(`/api/v1/metrics/name/${fqn}?fields=owners`);
    if (!isPublishedStatus(metric.entityStatus)) {
      return null;
    }
    return metric;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('404')) return null;
    throw err;
  }
}

export function isCertifiedTableName(name: string): boolean {
  return name.startsWith('silver_') || name.startsWith('gold_');
}

/** Certified warehouse tables: silver_ / gold_ assets known to OpenMetadata. */
export async function listCertifiedAssets(limit = 50): Promise<OmTable[]> {
  const body = await omFetch<{
    hits?: Array<{ _source?: OmTable }> | { hits?: Array<{ _source?: OmTable }> };
    data?: OmTable[];
  }>(`/api/v1/search/query?q=*&index=table_search_index&from=0&size=${limit}`);

  const rawHits = Array.isArray(body.hits) ? body.hits : body.hits?.hits || [];
  const fromHits = rawHits.map(h => h._source).filter((t): t is OmTable => Boolean(t?.name));

  const rows = fromHits.length ? fromHits : asList(body as Paged<OmTable>);
  return rows.filter(t => isCertifiedTableName(t.name || ''));
}

export async function getCertifiedTable(fqnOrName: string): Promise<OmTable | null> {
  const fqn = encodeURIComponent(fqnOrName);
  try {
    const table = await omFetch<OmTable>(`/api/v1/tables/name/${fqn}?fields=columns,tags,owners`);
    const name = table.name || '';
    if (!isCertifiedTableName(name)) {
      return null;
    }
    return table;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('404')) return null;
    throw err;
  }
}
