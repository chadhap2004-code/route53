"use client";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table from "@cloudscape-design/components/table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import type { RecordSet } from "@/lib/types";
import { useNotifications } from "./Notifications";

interface Props {
  zoneId: string;
  records: RecordSet[];
  onDismiss: () => void;
  onDeleted: () => void;
}

export default function DeleteRecordsModal({ zoneId, records, onDismiss, onDeleted }: Props) {
  const qc = useQueryClient();
  const { notify } = useNotifications();
  const blocked = records.filter((r) => r.is_default);
  const mutation = useMutation({
    // One request = one atomic change batch on the server: all records go, or none do.
    mutationFn: () => api.deleteRecords(zoneId, records.map((r) => r.id)),
    onSuccess: (info) => {
      qc.invalidateQueries({ queryKey: ["records", zoneId] });
      qc.invalidateQueries({ queryKey: ["zone", zoneId] });
      qc.invalidateQueries({ queryKey: ["zones"] });
      notify({
        type: "success",
        header: `${records.length} record${records.length === 1 ? " was" : "s were"} successfully deleted.`,
        content: `Change ID: ${info.id} · Status: ${info.status}`,
      });
      onDeleted();
    },
  });

  return (
    <Modal
      visible
      size="large"
      onDismiss={onDismiss}
      header={records.length === 1 ? "Delete record?" : `Delete ${records.length} records?`}
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button variant="primary" disabled={blocked.length > 0} loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box>Are you sure you want to delete the following records? You can&apos;t undo this action.</Box>
        {blocked.length > 0 && (
          <Alert type="warning" header="Some records can't be deleted">
            The NS and SOA records at the zone apex are required by the hosted zone. Deselect them to continue (you can
            still edit them).
          </Alert>
        )}
        {mutation.isError && <Alert type="error" header="Records were not deleted">{errorMessage(mutation.error)}</Alert>}
        <Table
          variant="embedded"
          items={records}
          columnDefinitions={[
            { id: "name", header: "Record name", cell: (r) => r.name },
            { id: "type", header: "Type", cell: (r) => r.type },
            { id: "value", header: "Value/Route traffic to", cell: (r) => <span className="mono value-lines">{r.alias_target ? r.alias_target.dns_name : r.values.join("\n")}</span> },
          ]}
        />
      </SpaceBetween>
    </Modal>
  );
}
