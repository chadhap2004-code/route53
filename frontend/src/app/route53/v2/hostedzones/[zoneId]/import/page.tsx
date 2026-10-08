"use client";
// Import a BIND zone file: Preview (dry run on the server, rolled back) -> Import (same code, committed).
import Alert from "@cloudscape-design/components/alert";
import Badge from "@cloudscape-design/components/badge";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Checkbox from "@cloudscape-design/components/checkbox";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import FileUpload from "@cloudscape-design/components/file-upload";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import Textarea from "@cloudscape-design/components/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConsoleLayout, { route53Crumb, zonesCrumb } from "@/components/ConsoleLayout";
import { useNotifications } from "@/components/Notifications";
import { api, ApiError, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/dns";
import type { ImportResult } from "@/lib/types";

const SAMPLE = (zone: string) => `$ORIGIN ${zone}
$TTL 300
@        IN  A      192.0.2.1
www      IN  CNAME  ${zone}
shop 60  IN  A      192.0.2.2
@        IN  MX     10 mail.${zone}
mail     IN  A      192.0.2.3
@        IN  TXT    "v=spf1 mx -all"
`;

const BADGE: Record<string, "green" | "blue" | "grey"> = { CREATE: "green", UPSERT: "blue", SKIP: "grey" };

export default function ImportZoneFilePage({ params }: { params: { zoneId: string } }) {
  const { zoneId } = params;
  const router = useRouter();
  const qc = useQueryClient();
  const { notify } = useNotifications();
  const zone = useQuery({ queryKey: ["zone", zoneId], queryFn: () => api.getZone(zoneId) });
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);

  const previewMut = useMutation({
    mutationFn: () => api.importZoneFile(zoneId, text, true, overwrite),
    onSuccess: setPreview,
    onError: () => setPreview(null),
  });
  const importMut = useMutation({
    mutationFn: () => api.importZoneFile(zoneId, text, false, overwrite),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["records", zoneId] });
      qc.invalidateQueries({ queryKey: ["zone", zoneId] });
      qc.invalidateQueries({ queryKey: ["zones"] });
      notify({
        type: "success",
        header: `Imported ${res.created + res.updated} record(s) into ${displayName(zone.data?.name ?? "")}.`,
        content: `${res.created} created, ${res.updated} updated, ${res.skipped} skipped${res.change ? ` · Change ID: ${res.change.id}` : ""}`,
      });
      router.push(`/route53/v2/hostedzones/${zoneId}`);
    },
  });

  const name = zone.data ? displayName(zone.data.name) : zoneId;
  const err = previewMut.error || importMut.error;
  const toApply = preview ? preview.created + preview.updated : 0;

  return (
    <ConsoleLayout
      breadcrumbs={[route53Crumb, zonesCrumb, { text: name, href: `/route53/v2/hostedzones/${zoneId}` }, { text: "Import zone file", href: "#" }]}
      contentType="form"
    >
      <ContentLayout header={<Header variant="h1" description="Paste or upload a zone file in BIND format. Records are validated with the same rules as the console before anything is saved.">Import zone file</Header>}>
        <Form
          errorText={
            err ? (
              err instanceof ApiError && err.details.length > 1 ? (
                <ul style={{ margin: 0, paddingLeft: 16 }}>{err.details.map((d) => <li key={d}>{d}</li>)}</ul>
              ) : (
                errorMessage(err)
              )
            ) : undefined
          }
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="link" onClick={() => router.push(`/route53/v2/hostedzones/${zoneId}`)}>
                Cancel
              </Button>
              <Button disabled={!text.trim()} loading={previewMut.isPending} onClick={() => previewMut.mutate()}>
                Preview
              </Button>
              <Button variant="primary" disabled={!preview || toApply === 0} loading={importMut.isPending} onClick={() => importMut.mutate()}>
                Import {toApply ? `${toApply} record${toApply === 1 ? "" : "s"}` : ""}
              </Button>
            </SpaceBetween>
          }
        >
          <SpaceBetween size="l">
            <Container header={<Header variant="h2">Zone file</Header>}>
              <SpaceBetween size="l">
                <Alert type="info">
                  SOA and NS records for the zone apex are skipped because Route 53 manages them. Records for names outside{" "}
                  <b>{name}</b> are rejected.
                </Alert>
                <FormField label="Upload a file" description=".zone, .txt or .db files up to 1 MB">
                  <FileUpload
                    value={files}
                    accept=".zone,.txt,.db,text/plain"
                    onChange={async (e) => {
                      setFiles(e.detail.value);
                      const f = e.detail.value[0];
                      if (f) {
                        setText(await f.text());
                        setPreview(null);
                      }
                    }}
                    i18nStrings={{
                      uploadButtonText: () => "Choose file",
                      dropzoneText: () => "Drop file to upload",
                      removeFileAriaLabel: () => "Remove file",
                      limitShowFewer: "Show fewer files",
                      limitShowMore: "Show more files",
                      errorIconAriaLabel: "Error",
                    }}
                  />
                </FormField>
                <FormField
                  label="Zone file contents"
                  secondaryControl={zone.data && <Button variant="inline-link" onClick={() => { setText(SAMPLE(zone.data!.name)); setPreview(null); }}>Insert sample</Button>}
                >
                  <Textarea
                    value={text}
                    rows={14}
                    spellcheck={false}
                    placeholder={zone.data ? SAMPLE(zone.data.name) : ""}
                    onChange={(e) => {
                      setText(e.detail.value);
                      setPreview(null);
                    }}
                  />
                </FormField>
                <Checkbox checked={overwrite} onChange={(e) => { setOverwrite(e.detail.checked); setPreview(null); }} description="When unchecked, records whose name and type already exist are skipped.">
                  Overwrite existing records
                </Checkbox>
              </SpaceBetween>
            </Container>

            {preview && (
              <Table
                variant="container"
                items={preview.rows}
                header={
                  <Header
                    counter={`(${preview.rows.length})`}
                    description={`${preview.created} to create · ${preview.updated} to update · ${preview.skipped} skipped. Nothing has been saved yet.`}
                  >
                    Preview
                  </Header>
                }
                columnDefinitions={[
                  { id: "action", header: "Action", cell: (r) => <Badge color={BADGE[r.action]}>{r.action}</Badge> },
                  { id: "name", header: "Record name", cell: (r) => r.name },
                  { id: "type", header: "Type", cell: (r) => r.type },
                  { id: "ttl", header: "TTL", cell: (r) => r.ttl ?? "-" },
                  { id: "values", header: "Value", cell: (r) => <span className="value-lines mono">{r.values.join("\n")}</span> },
                  { id: "reason", header: "Note", cell: (r) => r.reason || "-" },
                ]}
                empty={<Box textAlign="center">The file contains no records.</Box>}
              />
            )}
          </SpaceBetween>
        </Form>
      </ContentLayout>
    </ConsoleLayout>
  );
}
