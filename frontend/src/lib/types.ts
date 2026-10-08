// Mirrors the Pydantic models in backend/app/schemas.py.
// If you change a model there, change it here too (the OpenAPI spec at /docs is the reference).

export type RecordType = "A" | "AAAA" | "CNAME" | "TXT" | "MX" | "NS" | "PTR" | "SRV" | "CAA" | "SOA";
export type RoutingPolicy = "simple" | "weighted";
export type ZoneType = "public" | "private";

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface User {
  username: string;
  account_id: string;
  account_name: string;
}

export interface Tag {
  key: string;
  value: string;
}

export interface Vpc {
  vpc_id: string;
  region: string;
}

export interface HostedZone {
  id: string;
  name: string;
  type: ZoneType;
  comment: string;
  record_count: number;
  caller_reference: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  name_servers: string[];
  vpcs: Vpc[];
  tags: Tag[];
}

export interface ZoneCreateInput {
  name: string;
  type: ZoneType;
  comment: string;
  vpc?: Vpc | null;
  tags: Tag[];
}

export interface AliasTarget {
  dns_name: string;
  evaluate_target_health: boolean;
}

export interface RecordSet {
  id: number;
  name: string;
  type: RecordType;
  ttl: number | null;
  values: string[];
  routing_policy: RoutingPolicy;
  set_identifier: string | null;
  weight: number | null;
  alias_target: AliasTarget | null;
  health_check_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecordSetInput {
  name: string;
  type: RecordType;
  ttl: number | null;
  values: string[];
  routing_policy: RoutingPolicy;
  set_identifier?: string | null;
  weight?: number | null;
  alias_target?: AliasTarget | null;
  health_check_id?: string | null;
}

export interface RecordSetUpdateInput {
  ttl: number | null;
  values: string[];
  weight?: number | null;
  alias_target?: AliasTarget | null;
  health_check_id?: string | null;
}

export type ChangeAction = "CREATE" | "UPSERT" | "DELETE";

export interface ChangeInfo {
  id: string;
  status: "PENDING" | "INSYNC";
  comment: string;
  submitted_at: string;
  submitted_by: string;
  change_count: number;
}

export interface ImportRow {
  action: "CREATE" | "UPSERT" | "SKIP";
  name: string;
  type: string;
  ttl: number | null;
  values: string[];
  reason: string;
}

export interface ImportResult {
  dry_run: boolean;
  rows: ImportRow[];
  created: number;
  updated: number;
  skipped: number;
  change: ChangeInfo | null;
}
