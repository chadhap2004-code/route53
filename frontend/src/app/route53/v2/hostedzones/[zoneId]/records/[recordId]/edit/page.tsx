"use client";
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
import { useEffect, useState } from "react";
import ConsoleLayout, { route53Crumb, zonesCrumb } from "@/components/ConsoleLayout";
import { useNotifications } from "@/components/Notifications";
import RecordForm, { draftErrors, draftFromRecord, draftToInput, type RecordDraft } from "@/components/RecordForm";
import { api, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/dns";

export default function EditRecordPage({ params }: { params: { zoneId: string; recordId: string } }) {
  const { zoneId } = params;
  const recordId = Number(params.recordId);
  const router = useRouter();
  const qc = useQueryClient();
  const { notify } = useNotifications();
  const zone = useQuery({ queryKey: ["zone", zoneId], queryFn: () => api.getZone(zoneId) });
  const record = useQuery({ queryKey: ["record", zoneId, recordId], queryFn: () => api.getRecord(zoneId, recordId) });
  const [draft, setDraft] = useState<RecordDraft | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (record.data && zone.data && !draft) setDraft(draftFromRecord(record.data, zone.data.name));
  }, [record.data, zone.data, draft]);

  const mutation = useMutation({
    mutationFn: () => {
      const input = draftToInput(draft!);
      return api.updateRecord(zoneId, recordId, {
        ttl: input.ttl,
        values: input.values,
        weight: input.weight,
        alias_target: input.alias_target,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["records", zoneId] });
      qc.invalidateQueries({ queryKey: ["zone", zoneId] });
      qc.setQueryData(["record", zoneId, recordId], r);
      notify({ type: "success", content: `Record ${r.name} (${r.type}) was successfully updated.` });
      router.push(`/route53/v2/hostedzones/${zoneId}`);
    },
  });

  const name = zone.data ? displayName(zone.data.name) : zoneId;
  const error = zone.error || record.error;

  return (
    <ConsoleLayout
      breadcrumbs={[route53Crumb, zonesCrumb, { text: name, href: `/route53/v2/hostedzones/${zoneId}` }, { text: "Edit record", href: "#" }]}
      contentType="form"
    >
      <ContentLayout header={<Header variant="h1">Edit record</Header>}>
        {error ? (
          <Alert type="error">{errorMessage(error)}</Alert>
        ) : !draft || !zone.data || !record.data ? (
          <Spinner size="large" />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setShowErrors(true);
              if (Object.keys(draftErrors(draft)).length === 0) mutation.mutate();
            }}
          >
            <Form
              errorText={mutation.isError ? errorMessage(mutation.error) : undefined}
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button variant="link" formAction="none" onClick={() => router.push(`/route53/v2/hostedzones/${zoneId}`)}>
                    Cancel
                  </Button>
                  <Button variant="primary" formAction="submit" loading={mutation.isPending}>
                    Save
                  </Button>
                </SpaceBetween>
              }
            >
              <Container header={<Header variant="h2" description="Record name, type and record ID identify the record and can't be changed.">Record details</Header>}>
                <RecordForm draft={draft} zoneName={zone.data.name} mode="edit" isDefault={record.data.is_default} showErrors={showErrors} onChange={setDraft} />
              </Container>
            </Form>
          </form>
        )}
      </ContentLayout>
    </ConsoleLayout>
  );
}
