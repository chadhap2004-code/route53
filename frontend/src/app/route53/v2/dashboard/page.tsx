"use client";
// Route 53 dashboard, laid out like the console's: service summary, register domain, notifications,
// more resources and service health. Only the hosted zone count is live; the rest is static.
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Icon from "@cloudscape-design/components/icon";
import Input from "@cloudscape-design/components/input";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import ConsoleLayout, { route53Crumb } from "@/components/ConsoleLayout";
import { useNotifications } from "@/components/Notifications";
import { RefreshStatus, skeletonColumns, skeletonItems } from "@/components/TableSkeleton";
import { api } from "@/lib/api";
import { readPref, writePref } from "@/lib/storage";
import { useFollow } from "@/lib/useFollow";
import { useRefresh } from "@/lib/useRefresh";

const DOCS = "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html";

const MORE_RESOURCES = [
  { text: "Documentation", href: "https://docs.aws.amazon.com/route53/" },
  { text: "API reference", href: "https://docs.aws.amazon.com/Route53/latest/APIReference/Welcome.html" },
  { text: "FAQs", href: "https://aws.amazon.com/route53/faqs/" },
  { text: "Forum - DNS and health checks", href: "https://repost.aws/search/content?globalSearch=Route%2053%20DNS%20health%20checks" },
  { text: "Forum - Domain name registration", href: "https://repost.aws/search/content?globalSearch=Route%2053%20domain%20registration" },
  { text: "Request a limit increase", href: "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DNSLimitations.html" },
];

interface NotificationRow {
  id: string;
}

const NOTIFICATION_COLUMNS: TableProps.ColumnDefinition<NotificationRow>[] = [
  { id: "resource", header: "Resource", cell: () => null },
  { id: "status", header: "Status", cell: () => null },
  { id: "updated", header: "Last update", cell: () => null, sortingField: "updated" },
];

function Summary({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Box textAlign="center">
      <SpaceBetween size="xs">
        <Box variant="h3" padding="n">
          {title}
        </Box>
        {description && <Box fontSize="body-s">{description}</Box>}
        {children}
      </SpaceBetween>
    </Box>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const follow = useFollow();
  const { notify } = useNotifications();
  const zones = useQuery({ queryKey: ["zones", "count"], queryFn: () => api.listZones({ page_size: 1 }) });
  // Notifications are always empty in this clone; refresh refetches the zone count and shows the
  // console's loading rows for a moment.
  const { refreshing, refresh } = useRefresh(zones.refetch);
  const [domain, setDomain] = useState("");
  const [notificationFilter, setNotificationFilter] = useState("");
  // The console has no such banner, so it can be closed for good. Console pages render only in the
  // browser (ConsoleShell), so reading localStorage here can't cause a hydration mismatch.
  const [showTips, setShowTips] = useState(() => !readPref("r53.dashboard.tipsDismissed", false));

  return (
    <ConsoleLayout breadcrumbs={[route53Crumb, { text: "Dashboard", href: "/route53/v2/dashboard" }]}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            info={
              <Link variant="info" href={DOCS} target="_blank" rel="noopener noreferrer">
                Info
              </Link>
            }
          >
            Route 53 Dashboard
          </Header>
        }
      >
        <SpaceBetween size="l">
          {showTips && (
            <Alert
              type="info"
              header="Try the bonus features"
              dismissible
              dismissAriaLabel="Dismiss"
              onDismiss={() => {
                setShowTips(false);
                writePref("r53.dashboard.tipsDismissed", true);
              }}
            >
              Open a hosted zone to <b>Import zone file</b> or <b>Export</b> it as BIND or JSON. Press <kbd>?</kbd> for
              keyboard shortcuts and <kbd>t</kbd> for dark mode.
            </Alert>
          )}

          <Container>
            <ColumnLayout columns={4}>
              <Summary
                title="DNS management"
                description="A hosted zone tells Route 53 how to respond to DNS queries for a domain such as example.com."
              >
                <Button onClick={() => router.push("/route53/v2/hostedzones/create")}>Create hosted zone</Button>
                <Link href="/route53/v2/hostedzones" onFollow={follow}>
                  {zones.data ? `${zones.data.total} hosted zone${zones.data.total === 1 ? "" : "s"}` : "Hosted zones"}
                </Link>
              </Summary>
              <Summary
                title="Availability monitoring"
                description="Health checks monitor your applications and web resources, and direct DNS queries to healthy resources."
              >
                <Button onClick={() => router.push("/route53/v2/healthchecks")}>Create health check</Button>
              </Summary>
              <Summary
                title="Traffic management"
                description="A visual tool that lets you easily create policies for multiple endpoints in complex configurations."
              >
                <Button onClick={() => router.push("/route53/v2/trafficpolicies")}>Create policy</Button>
              </Summary>
              <Summary title="Domain registration">
                <Box fontSize="heading-l" fontWeight="bold">
                  0
                </Box>
                <Box>Domains</Box>
              </Summary>
            </ColumnLayout>
          </Container>

          <Container header={<Header variant="h2">Register domain</Header>}>
            <SpaceBetween size="s">
              <Box>
                Find and register an available domain, or{" "}
                <Link href="/route53/v2/domains" onFollow={follow}>
                  transfer your existing domains
                </Link>{" "}
                to Route 53.
              </Box>
              <FormField
                stretch
                constraintText="Each label (each part between dots) can be up to 63 characters long and must start with a-z or 0-9. Maximum length: 255 characters, including dots. Valid characters: a-z, 0-9, and - (hyphen)"
              >
                <Input
                  value={domain}
                  placeholder="Enter a domain name"
                  ariaLabel="Domain name"
                  onChange={(e) => setDomain(e.detail.value)}
                />
              </FormField>
              <Button onClick={() => notify({ type: "info", content: "Domain registration is outside the scope of this clone." })}>
                Check
              </Button>
            </SpaceBetween>
          </Container>

          <Table<NotificationRow>
            variant="container"
            trackBy="id"
            items={refreshing ? skeletonItems<NotificationRow>(0) : []}
            columnDefinitions={refreshing ? skeletonColumns(NOTIFICATION_COLUMNS) : NOTIFICATION_COLUMNS}
            header={
              <Header
                variant="h2"
                actions={
                  <Button iconName="refresh" variant="icon" ariaLabel="Refresh notifications" disabled={refreshing} onClick={refresh} />
                }
              >
                Notifications
              </Header>
            }
            filter={
              <>
                <RefreshStatus refreshing={refreshing} text="Loading notifications" />
                <TextFilter
                  filteringText={notificationFilter}
                  filteringPlaceholder="Find notifications"
                  filteringAriaLabel="Find notifications"
                  disabled={refreshing}
                  onChange={(e) => setNotificationFilter(e.detail.filteringText)}
                />
              </>
            }
            pagination={<Pagination currentPageIndex={1} pagesCount={1} disabled={refreshing} />}
            empty={<Box textAlign="center" color="inherit">No notifications to display</Box>}
          />

          <Container
            header={
              <Header variant="h2">
                More resources <Icon name="external" />
              </Header>
            }
          >
            <ColumnLayout columns={1} borders="horizontal">
              {MORE_RESOURCES.map((r) => (
                <Link key={r.text} href={r.href} target="_blank" rel="noopener noreferrer">
                  {r.text}
                </Link>
              ))}
            </ColumnLayout>
          </Container>

          <Container header={<Header variant="h2">Service health</Header>}>
            To view the current status of Route 53, see the{" "}
            <Link href="https://health.aws.amazon.com/health/status" external>
              AWS Service Health Dashboard
            </Link>
            .
          </Container>
        </SpaceBetween>
      </ContentLayout>
    </ConsoleLayout>
  );
}
