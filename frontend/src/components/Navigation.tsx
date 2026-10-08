"use client";
// Left navigation, same structure and labels as the Route 53 console.
import SideNavigation, { type SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import { usePathname } from "next/navigation";
import { useFollow } from "@/lib/useFollow";

const BASE = "/route53/v2";

const items: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: `${BASE}/dashboard` },
  { type: "link", text: "Hosted zones", href: `${BASE}/hostedzones` },
  { type: "link", text: "Health checks", href: `${BASE}/healthchecks` },
  { type: "link", text: "Profiles", href: `${BASE}/profiles` },
  {
    type: "section",
    text: "IP-based routing",
    items: [{ type: "link", text: "CIDR collections", href: `${BASE}/cidrcollections` }],
  },
  {
    type: "section",
    text: "Traffic flow",
    items: [
      { type: "link", text: "Traffic policies", href: `${BASE}/trafficpolicies` },
      { type: "link", text: "Policy records", href: `${BASE}/policyrecords` },
    ],
  },
  {
    type: "section",
    text: "Domains",
    items: [
      { type: "link", text: "Registered domains", href: `${BASE}/domains` },
      { type: "link", text: "Requests", href: `${BASE}/domainrequests` },
    ],
  },
  {
    type: "section",
    text: "Resolver",
    items: [
      { type: "link", text: "VPCs", href: `${BASE}/resolver/vpcs` },
      { type: "link", text: "Inbound endpoints", href: `${BASE}/resolver/inbound` },
      { type: "link", text: "Outbound endpoints", href: `${BASE}/resolver/outbound` },
      { type: "link", text: "Rules", href: `${BASE}/resolver/rules` },
      { type: "link", text: "Query logging", href: `${BASE}/resolver/querylogging` },
    ],
  },
  {
    type: "section",
    text: "DNS Firewall",
    items: [
      { type: "link", text: "Rule groups", href: `${BASE}/firewall/rulegroups` },
      { type: "link", text: "Domain lists", href: `${BASE}/firewall/domainlists` },
    ],
  },
];

export default function Navigation() {
  const pathname = usePathname();
  const follow = useFollow();
  // Highlight the deepest nav item that prefixes the current path (zone pages highlight "Hosted zones").
  const active = pathname.startsWith(`${BASE}/hostedzones`) ? `${BASE}/hostedzones` : pathname;
  return (
    <SideNavigation
      header={{ text: "Route 53", href: `${BASE}/dashboard` }}
      activeHref={active}
      items={items}
      onFollow={follow}
    />
  );
}
