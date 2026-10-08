import ComingSoon from "@/components/ComingSoon";

// Every Route 53 section outside the assignment scope lands here (Health checks, Traffic policies, Resolver, ...).
const TITLES: Record<string, string> = {
  profiles: "Profiles",
  cidrcollections: "CIDR collections",
  trafficpolicies: "Traffic policies",
  policyrecords: "Policy records",
  domains: "Registered domains",
  domainrequests: "Requests",
  "resolver/vpcs": "Resolver VPCs",
  "resolver/inbound": "Inbound endpoints",
  "resolver/outbound": "Outbound endpoints",
  "resolver/rules": "Resolver rules",
  "resolver/querylogging": "Query logging",
  "resolver/outposts": "Outposts",
  globalresolvers: "Global resolvers",
  shareddnsviews: "Shared DNS views",
  dnsfirewall: "DNS Firewall",
  recoverycontroller: "Application Recovery Controller",
  "firewall/rulegroups": "DNS Firewall rule groups",
  "firewall/domainlists": "DNS Firewall domain lists",
};

export default function Placeholder({ params }: { params: { slug: string[] } }) {
  const key = params.slug.join("/");
  return <ComingSoon title={TITLES[key] ?? "This page"} />;
}
