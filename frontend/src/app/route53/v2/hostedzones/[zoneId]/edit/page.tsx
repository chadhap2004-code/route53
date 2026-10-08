"use client";
// Route 53 only allows changing a zone's description (and tags). The domain name is shown read-only.
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import Textarea from "@cloudscape-design/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ConsoleLayout, { route53Crumb, zonesCrumb } from "@/components/ConsoleLayout";
import { useNotifications } from "@/components/Notifications";
import TagsEditor, { tagsValid } from "@/components/TagsEditor";
import { api, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/dns";
import type { Tag } from "@/lib/types";

export default function EditHostedZonePage({ params }: { params: { zoneId: string } }) {
  const { zoneId } = params;
  const router = useRouter();
  const qc = useQueryClient();
  const { notify } = useNotifications();
  const zone = useQuery({ queryKey: ["zone", zoneId], queryFn: () => api.getZone(zoneId) });
  const [comment, setComment] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (zone.data) {
      setComment(zone.data.comment);
      setTags(zone.data.tags);
    }
  }, [zone.data]);

  const mutation = useMutation({
    mutationFn: () => api.updateZone(zoneId, { comment, tags: tags.map((t) => ({ key: t.key.trim(), value: t.value })) }),
    onSuccess: (z) => {
      qc.setQueryData(["zone", zoneId], z);
      qc.invalidateQueries({ queryKey: ["zones"] });
      notify({ type: "success", content: `Hosted zone ${displayName(z.name)} was successfully updated.` });
      router.push(`/route53/v2/hostedzones/${zoneId}`);
    },
  });

  const name = zone.data ? displayName(zone.data.name) : zoneId;
  return (
    <ConsoleLayout
      breadcrumbs={[route53Crumb, zonesCrumb, { text: name, href: `/route53/v2/hostedzones/${zoneId}` }, { text: "Edit hosted zone", href: "#" }]}
      contentType="form"
    >
      <ContentLayout header={<Header variant="h1">Edit hosted zone</Header>}>
        {zone.isLoading ? (
          <Spinner size="large" />
        ) : zone.isError ? (
          <Container>{errorMessage(zone.error)}</Container>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (tagsValid(tags)) mutation.mutate(); }}>
            <Form
              errorText={mutation.isError ? errorMessage(mutation.error) : undefined}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" formAction="none" onClick={() => router.push(`/route53/v2/hostedzones/${zoneId}`)}>
                    Cancel
                  </Button>
                  <Button variant="primary" formAction="submit" loading={mutation.isPending}>
                    Save changes
                  </Button>
                </SpaceBetween>
              }
            >
              <SpaceBetween size="l">
                <Container header={<Header variant="h2">Hosted zone settings</Header>}>
                  <SpaceBetween size="l">
                    <FormField label="Domain name" description="You can't change the domain name of an existing hosted zone.">
                      <Input value={name} disabled />
                    </FormField>
                    <FormField
                      label={<>Description <i>- optional</i></>}
                      description="This value lets you distinguish hosted zones that have the same name."
                      constraintText={`${256 - comment.length} characters remaining.`}
                    >
                      <Textarea value={comment} rows={3} onChange={(e) => setComment(e.detail.value.slice(0, 256))} autoFocus />
                    </FormField>
                  </SpaceBetween>
                </Container>
                <Container header={<Header variant="h2">Tags</Header>}>
                  <TagsEditor tags={tags} onChange={setTags} />
                </Container>
              </SpaceBetween>
            </Form>
          </form>
        )}
      </ContentLayout>
    </ConsoleLayout>
  );
}
