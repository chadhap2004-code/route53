"use client";
// "Quick create record": several records submitted as ONE atomic change batch.
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Form from "@cloudscape-design/components/form";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConsoleLayout, { route53Crumb, zonesCrumb } from "@/components/ConsoleLayout";
import { useNotifications } from "@/components/Notifications";
import RecordForm, { draftErrors, draftToInput, emptyDraft, type RecordDraft } from "@/components/RecordForm";
import { api, ApiError, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/dns";

export default function CreateRecordPage({ params }: { params: { zoneId: string } }) {
  const { zoneId } = params;
  const router = useRouter();
  const qc = useQueryClient();
  const { notify } = useNotifications();
  const zone = useQuery({ queryKey: ["zone", zoneId], queryFn: () => api.getZone(zoneId) });
  const [drafts, setDrafts] = useState<RecordDraft[]>(() => [emptyDraft()]);
  const [showErrors, setShowErrors] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.changeRecordSets(zoneId, drafts.map((d) => ({ action: "CREATE" as const, record_set: draftToInput(d) }))),
    onSuccess: (info) => {
      qc.invalidateQueries({ queryKey: ["records", zoneId] });
      qc.invalidateQueries({ queryKey: ["zone", zoneId] });
      qc.invalidateQueries({ queryKey: ["zones"] });
      notify({
        type: "success",
        header: `${drafts.length} record${drafts.length === 1 ? " was" : "s were"} successfully created in ${displayName(zone.data?.name ?? "")}.`,
        content: `Change ID: ${info.id} · Status: ${info.status}`,
      });
      router.push(`/route53/v2/hostedzones/${zoneId}`);
    },
  });

  function submit() {
    setShowErrors(true);
    if (drafts.some((d) => Object.keys(draftErrors(d)).length > 0)) return;
    mutation.mutate();
  }

  const name = zone.data ? displayName(zone.data.name) : zoneId;
  const details = mutation.error instanceof ApiError ? mutation.error.details : [];

  return (
    <ConsoleLayout
      breadcrumbs={[route53Crumb, zonesCrumb, { text: name, href: `/route53/v2/hostedzones/${zoneId}` }, { text: "Create record", href: "#" }]}
      contentType="form"
    >
      <ContentLayout header={<Header variant="h1" description="Records define how you want to route traffic for a domain and its subdomains.">Create record</Header>}>
        {!zone.data ? (
          zone.isError ? <Alert type="error">{errorMessage(zone.error)}</Alert> : <Spinner size="large" />
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <Form
              errorText={
                mutation.isError ? (
                  details.length > 1 ? (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>{details.map((d) => <li key={d}>{d.replace(/^Change (\d+):/, "Record $1:")}</li>)}</ul>
                  ) : (
                    errorMessage(mutation.error).replace(/^Change (\d+):/, "Record $1:")
                  )
                ) : undefined
              }
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" formAction="none" onClick={() => router.push(`/route53/v2/hostedzones/${zoneId}`)}>
                    Cancel
                  </Button>
                  <Button variant="primary" formAction="submit" loading={mutation.isPending}>
                    Create record{drafts.length > 1 ? "s" : ""}
                  </Button>
                </SpaceBetween>
              }
            >
              <SpaceBetween size="l">
                {drafts.map((d, i) => (
                  <Container
                    key={d.key}
                    header={
                      <Header
                        variant="h2"
                        actions={
                          drafts.length > 1 && (
                            <Button formAction="none" onClick={() => setDrafts(drafts.filter((x) => x.key !== d.key))}>
                              Delete
                            </Button>
                          )
                        }
                      >
                        Record {i + 1}
                      </Header>
                    }
                  >
                    <RecordForm
                      draft={d}
                      zoneName={zone.data.name}
                      mode="create"
                      showErrors={showErrors}
                      onChange={(nd) => setDrafts(drafts.map((x) => (x.key === d.key ? nd : x)))}
                    />
                  </Container>
                ))}
                <Button formAction="none" iconName="add-plus" onClick={() => setDrafts([...drafts, emptyDraft()])}>
                  Add another record
                </Button>
              </SpaceBetween>
            </Form>
          </form>
        )}
      </ContentLayout>
    </ConsoleLayout>
  );
}
