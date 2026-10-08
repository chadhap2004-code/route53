"use client";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Tiles from "@cloudscape-design/components/tiles";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConsoleLayout, { route53Crumb, zonesCrumb } from "@/components/ConsoleLayout";
import { useNotifications } from "@/components/Notifications";
import TagsEditor, { tagsValid } from "@/components/TagsEditor";
import { api, ApiError, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/dns";
import type { Tag, ZoneType } from "@/lib/types";

const REGIONS = ["us-east-1", "us-east-2", "us-west-1", "us-west-2", "ap-south-1", "ap-southeast-1", "eu-west-1", "eu-central-1"].map(
  (r) => ({ value: r, label: r }),
);
// Client-side check for fast feedback; the backend is the source of truth.
const DOMAIN_RE = /^(?=.{1,254}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.?$/i;

export default function CreateHostedZonePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { notify } = useNotifications();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [type, setType] = useState<ZoneType>("public");
  const [region, setRegion] = useState(REGIONS[4]);
  const [vpcId, setVpcId] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const nameError = !name.trim() ? "Domain name is required." : !DOMAIN_RE.test(name.trim()) ? "Enter a valid domain name, such as example.com." : "";
  const vpcError = type === "private" && !/^vpc-[0-9a-f]{8,17}$/.test(vpcId.trim()) ? "Enter a VPC ID such as vpc-0a1b2c3d." : "";

  const mutation = useMutation({
    mutationFn: () =>
      api.createZone({
        name: name.trim(),
        comment: comment.trim(),
        type,
        vpc: type === "private" ? { vpc_id: vpcId.trim(), region: region.value } : null,
        tags: tags.map((t) => ({ key: t.key.trim(), value: t.value })),
      }),
    onSuccess: (zone) => {
      qc.invalidateQueries({ queryKey: ["zones"] });
      notify({ type: "success", content: `Hosted zone ${displayName(zone.name)} was successfully created.` });
      router.push(`/route53/v2/hostedzones/${zone.id}`);
    },
  });

  function submit() {
    setSubmitted(true);
    if (nameError || vpcError || !tagsValid(tags)) return;
    mutation.mutate();
  }

  return (
    <ConsoleLayout breadcrumbs={[route53Crumb, zonesCrumb, { text: "Create hosted zone", href: "#" }]} contentType="form">
      <ContentLayout header={<Header variant="h1">Create hosted zone</Header>}>
        <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Form
            errorText={mutation.isError ? errorMessage(mutation.error) : undefined}
            errorIconAriaLabel="Error"
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="link" formAction="none" onClick={() => router.push("/route53/v2/hostedzones")}>
                  Cancel
                </Button>
                <Button variant="primary" formAction="submit" loading={mutation.isPending}>
                  Create hosted zone
                </Button>
              </SpaceBetween>
            }
          >
            <SpaceBetween size="l">
              <Container
                header={
                  <Header variant="h2" description="A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains.">
                    Hosted zone configuration
                  </Header>
                }
              >
                <SpaceBetween size="l">
                  <FormField
                    label="Domain name"
                    description="This is the name of the domain that you want to route traffic for."
                    constraintText="Valid characters: a-z, 0-9, hyphen (-), underscore (_) and period (.). Labels can't start or end with a hyphen."
                    errorText={submitted ? nameError : undefined}
                  >
                    <Input value={name} placeholder="example.com" onChange={(e) => setName(e.detail.value)} autoFocus />
                  </FormField>
                  <FormField
                    label={<>Description <i>- optional</i></>}
                    description="This value lets you distinguish hosted zones that have the same name."
                    constraintText={`The description can have up to 256 characters. ${256 - comment.length} characters remaining.`}
                  >
                    <Textarea value={comment} rows={3} placeholder="The hosted zone is used for..." onChange={(e) => setComment(e.detail.value.slice(0, 256))} />
                  </FormField>
                  <FormField label="Type" description="The type indicates whether you want to route traffic on the internet or in an Amazon VPC.">
                    <Tiles
                      value={type}
                      onChange={(e) => setType(e.detail.value as ZoneType)}
                      columns={2}
                      items={[
                        { value: "public", label: "Public hosted zone", description: "A public hosted zone determines how traffic is routed on the internet." },
                        { value: "private", label: "Private hosted zone", description: "A private hosted zone determines how traffic is routed within an Amazon VPC." },
                      ]}
                    />
                  </FormField>
                </SpaceBetween>
              </Container>

              {type === "private" && (
                <Container
                  header={
                    <Header variant="h2" description="To use this hosted zone to resolve DNS queries for one or more VPCs, choose the VPCs. VPC association is simulated in this clone.">
                      VPCs to associate with the hosted zone
                    </Header>
                  }
                >
                  <SpaceBetween size="l">
                    <FormField label="Region">
                      <Select selectedOption={region} options={REGIONS} onChange={(e) => setRegion(e.detail.selectedOption as (typeof REGIONS)[number])} />
                    </FormField>
                    <FormField label="VPC ID" errorText={submitted ? vpcError : undefined}>
                      <Input value={vpcId} placeholder="vpc-0a1b2c3d" onChange={(e) => setVpcId(e.detail.value)} />
                    </FormField>
                  </SpaceBetween>
                </Container>
              )}

              <Container
                header={
                  <Header variant="h2" description="Apply tags to hosted zones to help organize and identify them.">
                    Tags
                  </Header>
                }
              >
                <TagsEditor tags={tags} onChange={setTags} />
              </Container>
              {mutation.error instanceof ApiError && mutation.error.code === "ConflictingDomainExists" && (
                <Alert type="info">Choose a different VPC, or edit the existing private hosted zone instead.</Alert>
              )}
            </SpaceBetween>
          </Form>
        </form>
      </ContentLayout>
    </ConsoleLayout>
  );
}
