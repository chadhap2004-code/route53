// Record-type metadata used by forms and tables (labels match the Route 53 console).
import type { RecordSet, RecordType } from "./types";

export const RECORD_TYPES: { value: RecordType; label: string; placeholder: string; aliasable: boolean }[] = [
  { value: "A", label: "A – Routes traffic to an IPv4 address and some AWS resources", placeholder: "192.0.2.235", aliasable: true },
  { value: "AAAA", label: "AAAA – Routes traffic to an IPv6 address and some AWS resources", placeholder: "2001:0db8:85a3:0:0:8a2e:0370:7334", aliasable: true },
  { value: "CAA", label: "CAA – Restricts CAs that can create SSL/TLS certifications for the domain", placeholder: '0 issue "caname.com"', aliasable: true },
  { value: "CNAME", label: "CNAME – Routes traffic to another domain name and to some AWS resources", placeholder: "www.example.com", aliasable: true },
  { value: "MX", label: "MX – Specifies mail servers", placeholder: "10 mailserver.example.com", aliasable: true },
  { value: "NS", label: "NS – Name servers for a hosted zone", placeholder: "ns-1.example.net", aliasable: false },
  { value: "PTR", label: "PTR – Maps an IP address to a domain name", placeholder: "hostname.example.com", aliasable: true },
  { value: "SRV", label: "SRV – Application-specific values that identify servers", placeholder: "1 10 5269 xmpp-server.example.com", aliasable: true },
  { value: "TXT", label: "TXT – Verifies email senders and application-specific values", placeholder: '"Sample text entries"', aliasable: true },
];

export const RECORD_TYPE_FILTER_OPTIONS = [
  { value: "", label: "Type" },
  ...RECORD_TYPES.map((t) => ({ value: t.value, label: t.value })),
  { value: "SOA", label: "SOA" },
];

export const ROUTING_OPTIONS = [
  { value: "simple", label: "Simple routing" },
  { value: "weighted", label: "Weighted" },
];

export function typeMeta(type: RecordType) {
  return RECORD_TYPES.find((t) => t.value === type);
}

export function routingLabel(r: RecordSet["routing_policy"]): string {
  return r === "weighted" ? "Weighted" : "Simple";
}

/** "www.example.com." inside "example.com." -> "www" (for the name input with the zone suffix). */
export function relativeName(fqdn: string, zoneName: string): string {
  if (fqdn === zoneName) return "";
  return fqdn.endsWith("." + zoneName) ? fqdn.slice(0, -(zoneName.length + 1)) : fqdn;
}

/** Strip the trailing dot for display, like the console does for zone names in some places. */
export function displayName(name: string): string {
  return name.endsWith(".") && name.length > 1 ? name.slice(0, -1) : name;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export const TTL_PRESETS = [
  { label: "1m", value: 60 },
  { label: "1h", value: 3600 },
  { label: "1d", value: 86400 },
];
