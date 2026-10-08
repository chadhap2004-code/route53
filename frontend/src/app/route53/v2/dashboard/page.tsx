"use client";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import ConsoleLayout, { route53Crumb } from "@/components/ConsoleLayout";
import { api } from "@/lib/api";
import { useFollow } from "@/lib/useFollow";

function Card({ title, body, action }: { title: string; body: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Container header={<Header variant="h2">{title}</Header>} fitHeight>
      <SpaceBetween size="m">
        {body}
        {action}
      </SpaceBetween>
    </Container>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const follow = useFollow();
  const zones = useQuery({ queryKey: ["zones", "count"], queryFn: () => api.listZones({ page_size: 1 }) });
  return (
    <ConsoleLayout breadcrumbs={[route53Crumb, { text: "Dashboard", href: "/route53/v2/dashboard" }]}>
      <ContentLayout header={<Header variant="h1">Route 53 Dashboard</Header>}>
        <ColumnLayout columns={2}>
          <Card
            title="DNS management"
            body={
              <SpaceBetween size="xxs">
                <Box variant="awsui-value-large">{zones.data?.total ?? "–"}</Box>
                <Link href="/route53/v2/hostedzones" onFollow={follow}>
                  Hosted zones
                </Link>
              </SpaceBetween>
            }
            action={<Button onClick={() => router.push("/route53/v2/hostedzones/create")}>Create hosted zone</Button>}
          />
          <Card title="Traffic management" body={<Box color="text-body-secondary">Coming soon</Box>} />
          <Card title="Availability monitoring" body={<Box color="text-body-secondary">Coming soon</Box>} />
          <Card title="Domain registration" body={<Box color="text-body-secondary">Coming soon</Box>} />
        </ColumnLayout>
      </ContentLayout>
    </ConsoleLayout>
  );
}
