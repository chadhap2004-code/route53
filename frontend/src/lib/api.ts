// Thin typed client for the FastAPI backend.
// All calls go to same-origin /api/*, which next.config.mjs rewrites to the backend.
// `credentials: "same-origin"` sends the HttpOnly session cookie automatically.

import type {
  ChangeAction,
  ChangeInfo,
  HostedZone,
  ImportResult,
  Page,
  RecordSet,
  RecordSetInput,
  RecordSetUpdateInput,
  Tag,
  User,
  ZoneCreateInput,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: string[] = [],
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined | null>;

function qs(params: Query = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
      // Session expired: send the user back to sign-in, remembering where they were.
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(res.status, err?.code ?? "Error", err?.message ?? res.statusText, err?.details ?? []);
  }
  return data as T;
}

export const api = {
  // auth
  login: (username: string, password: string) => request<User>("POST", "/auth/login", { username, password }),
  signup: (username: string, password: string) => request<User>("POST", "/auth/signup", { username, password }),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<User>("GET", "/auth/me"),

  // hosted zones
  listZones: (p: Query) => request<Page<HostedZone>>("GET", `/hosted-zones${qs(p)}`),
  getZone: (id: string) => request<HostedZone>("GET", `/hosted-zones/${id}`),
  createZone: (body: ZoneCreateInput) => request<HostedZone>("POST", "/hosted-zones", body),
  updateZone: (id: string, body: { comment?: string; tags?: Tag[] }) =>
    request<HostedZone>("PATCH", `/hosted-zones/${id}`, body),
  deleteZone: (id: string) => request<void>("DELETE", `/hosted-zones/${id}`),

  // records
  listRecords: (zoneId: string, p: Query) => request<Page<RecordSet>>("GET", `/hosted-zones/${zoneId}/records${qs(p)}`),
  getRecord: (zoneId: string, id: number) => request<RecordSet>("GET", `/hosted-zones/${zoneId}/records/${id}`),
  updateRecord: (zoneId: string, id: number, body: RecordSetUpdateInput) =>
    request<RecordSet>("PUT", `/hosted-zones/${zoneId}/records/${id}`, body),
  deleteRecords: (zoneId: string, ids: number[]) =>
    request<ChangeInfo>("POST", `/hosted-zones/${zoneId}/records/bulk-delete`, { record_ids: ids }),
  changeRecordSets: (zoneId: string, changes: { action: ChangeAction; record_set: RecordSetInput }[], comment = "") =>
    request<ChangeInfo>("POST", `/hosted-zones/${zoneId}/changes`, { changes, comment }),

  // import / export
  importZoneFile: (zoneId: string, zone_file: string, dry_run: boolean, overwrite: boolean) =>
    request<ImportResult>("POST", `/hosted-zones/${zoneId}/import`, { zone_file, dry_run, overwrite }),
  exportUrl: (zoneId: string, format: "bind" | "json") => `/api/hosted-zones/${zoneId}/export?format=${format}`,

  resetDemo: () => request<void>("POST", "/demo/reset"),
};

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong";
}
