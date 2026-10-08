"use client";
// Left navigation, same structure and labels as the Route 53 console.
import Box from "@cloudscape-design/components/box";
import SideNavigation, { type SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import { usePathname } from "next/navigation";
import { useFollow } from "@/lib/useFollow";

const BASE = "/route53/v2";

// "New" marker shown next to recently added console sections, as in the real navigation.
const NEW = (
  <Box color="text-status-info" fontSize="body-s" fontWeight="bold">
    New
  </Box>
);

const items: SideNavigationProps.Item[] = [
  { type: "link", text: "Dashboard", href: `${BASE}/dashboard` },
  { type: "link", text: "Hosted zones", href: `${BASE}/hostedzones` },
  { type: "link", text: "Health checks", href: `${BASE}/healthchecks` },
  { type: "link", text: "Profiles", href: `${BASE}/profiles` },
  {
    type: "section",
    text: "Global Resolver",
    items: [
      { type: "link", text: "Global resolvers", href: `${BASE}/globalresolvers`, info: NEW },
      { type: "link", text: "Shared DNS views", href: `${BASE}/shareddnsviews`, info: NEW },
    ],
  },
  {
    type: "section",
    text: "VPC Resolver",
    items: [
      { type: "link", text: "VPCs", href: `${BASE}/resolver/vpcs` },
      { type: "link", text: "Inbound endpoints", href: `${BASE}/resolver/inbound` },
      { type: "link", text: "Outbound endpoints", href: `${BASE}/resolver/outbound` },
      { type: "link", text: "Rules", href: `${BASE}/resolver/rules` },
      { type: "link", text: "Query logging", href: `${BASE}/resolver/querylogging` },
      { type: "link", text: "Outposts", href: `${BASE}/resolver/outposts` },
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
  { type: "divider" },
  // In the console these open other AWS consoles; here they open the coming-soon page in a new tab.
  { type: "link", text: "DNS Firewall", href: `${BASE}/dnsfirewall`, external: true, externalIconAriaLabel: "Opens in a new tab" },
  {
    type: "link",
    text: "Application Recovery Controller",
    href: `${BASE}/recoverycontroller`,
    external: true,
    externalIconAriaLabel: "Opens in a new tab",
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
