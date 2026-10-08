"use client";
// Health checks list, laid out like the console's (empty state). Creating health checks is outside the
// scope of this clone, so the table is always empty and "Create health check" shows an info notification.
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { useState } from "react";
import ConsoleLayout, { route53Crumb } from "@/components/ConsoleLayout";
import { useNotifications } from "@/components/Notifications";

const DOCS = "https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-failover.html";

interface HealthCheck {
  id: string;
}

export default function HealthChecksPage() {
  const { notify } = useNotifications();
  const [filter, setFilter] = useState("");

  function notAvailable() {
    notify({ type: "info", content: "Health checks are outside the scope of this clone." });
  }

  return (
    <ConsoleLayout
      breadcrumbs={[route53Crumb, { text: "Health checks", href: "/route53/v2/healthchecks" }]}
      contentType="table"
    >
      <Table<HealthCheck>
        variant="full-page"
        items={[]}
        selectionType="multi"
        selectedItems={[]}
        trackBy="id"
        ariaLabels={{ selectionGroupLabel: "Health check selection", allItemsSelectionLabel: () => "Select all health checks" }}
        columnDefinitions={[
          { id: "id", header: "ID", cell: (h) => h.id },
          { id: "name", header: "Name", cell: () => "-" },
          { id: "status", header: "Status", cell: () => "-" },
          { id: "description", header: "Description", cell: () => "-" },
          { id: "alarms", header: "Alarms", cell: () => "-" },
        ]}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter="(0)"
            info={
              <Link variant="info" href={DOCS} target="_blank" rel="noopener noreferrer">
                Info
              </Link>
            }
            description="Route 53 health checks monitor the health and performance of your web applications, web servers, and other resources."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button disabled>Delete health check</Button>
                <Button variant="primary" data-shortcut="create" onClick={notAvailable}>
                  Create health check
                </Button>
              </SpaceBetween>
            }
          >
            Health checks
          </Header>
        }
        filter={
          <div data-shortcut="search">
            <TextFilter
              filteringText={filter}
              filteringPlaceholder="Find health check"
              filteringAriaLabel="Find health check"
              onChange={(e) => setFilter(e.detail.filteringText)}
            />
          </div>
        }
        pagination={<Pagination currentPageIndex={1} pagesCount={1} />}
        empty={
          <Box textAlign="center" color="inherit" padding="l">
            <SpaceBetween size="xs">
              <b>No health checks</b>
              <Box color="inherit">You don&apos;t have any health checks.</Box>
              <Button onClick={notAvailable}>Create health check</Button>
            </SpaceBetween>
          </Box>
        }
      />
    </ConsoleLayout>
  );
}
