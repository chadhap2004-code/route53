"use client";
// Delete confirmation that mirrors the console: type "delete" to confirm, and a clear explanation
// when the zone still has records (the backend enforces HostedZoneNotEmpty either way).
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Input from "@cloudscape-design/components/input";
import Modal from "@cloudscape-design/components/modal";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/dns";
import type { HostedZone } from "@/lib/types";
import { useNotifications } from "./Notifications";

interface Props {
  zone: HostedZone;
  onDismiss: () => void;
  onDeleted: () => void;
}

export default function DeleteZoneModal({ zone, onDismiss, onDeleted }: Props) {
  const [confirm, setConfirm] = useState("");
  const qc = useQueryClient();
  const { notify } = useNotifications();
  const extra = zone.record_count - 2; // NS + SOA are removed with the zone
  const mutation = useMutation({
    mutationFn: () => api.deleteZone(zone.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["zones"] });
      qc.removeQueries({ queryKey: ["zone", zone.id] });
      notify({ type: "success", content: `Hosted zone ${displayName(zone.name)} was successfully deleted.` });
      onDeleted();
    },
  });

  return (
    <Modal
      visible
      onDismiss={onDismiss}
      header="Delete hosted zone?"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button variant="link" onClick={onDismiss}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={confirm !== "delete" || extra > 0}
              loading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Delete
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="m">
        <Box>
          Permanently delete hosted zone <b>{displayName(zone.name)}</b> ({zone.id})? You can&apos;t undo this action.
        </Box>
        {extra > 0 && (
          <Alert type="warning" header="This hosted zone still contains records">
            You can delete a hosted zone only when it contains just the default NS and SOA records. Delete the other{" "}
            {extra} record{extra === 1 ? "" : "s"} first.
          </Alert>
        )}
        {mutation.isError && <Alert type="error">{errorMessage(mutation.error)}</Alert>}
        <FormField label={<>To confirm deletion, type <i>delete</i> in the field.</>}>
          <Input
            value={confirm}
            placeholder="delete"
            disabled={extra > 0}
            onChange={(e) => setConfirm(e.detail.value)}
            ariaLabel="Type delete to confirm"
          />
        </FormField>
      </SpaceBetween>
    </Modal>
  );
}
