"use client";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useRouter } from "next/navigation";
import ConsoleLayout, { route53Crumb } from "./ConsoleLayout";

export default function ComingSoon({ title }: { title: string }) {
  const router = useRouter();
  return (
    <ConsoleLayout breadcrumbs={[route53Crumb, { text: title, href: "#" }]}>
      <ContentLayout header={<Header variant="h1">{title}</Header>}>
        <Container>
          <Box textAlign="center" padding={{ vertical: "xxl" }}>
            <SpaceBetween size="m">
              <Box variant="h2">Coming soon</Box>
              <Box color="text-body-secondary">
                {title} is not part of this clone yet. Hosted zones and DNS records are fully functional.
              </Box>
              <Button variant="primary" onClick={() => router.push("/route53/v2/hostedzones")}>
                Go to hosted zones
              </Button>
            </SpaceBetween>
          </Box>
        </Container>
      </ContentLayout>
    </ConsoleLayout>
  );
}
