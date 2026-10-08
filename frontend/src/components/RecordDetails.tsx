"use client";
// Content of the split panel shown when one record is selected (like the console's "Record details").
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { formatDate, routingLabel } from "@/lib/dns";
import type { RecordSet } from "@/lib/types";

export default function RecordDetails({ record, onEdit }: { record: RecordSet; onEdit: () => void }) {
  const value = record.alias_target ? record.alias_target.dns_name : record.values.join("\n");
  return (
    <SpaceBetween size="l">
      <Box float="right">
        <Button onClick={onEdit}>Edit record</Button>
      </Box>
      <KeyValuePairs
        columns={1}
        items={[
          { label: "Record name", value: <CopyToClipboard variant="inline" textToCopy={record.name} copyErrorText="Failed to copy" copySuccessText="Record name copied" /> },
          { label: "Record type", value: record.type },
          {
            label: record.alias_target ? "Route traffic to" : "Value",
            value: (
              <SpaceBetween size="xxs">
                <span className="value-lines">{value}</span>
                <CopyToClipboard variant="icon" textToCopy={value} copyErrorText="Failed to copy" copySuccessText="Value copied" />
              </SpaceBetween>
            ),
          },
          { label: "Alias", value: record.alias_target ? "Yes" : "No" },
          { label: "TTL (seconds)", value: record.ttl ?? "-" },
          { label: "Routing policy", value: routingLabel(record.routing_policy) },
          ...(record.routing_policy === "weighted"
            ? [
                { label: "Weight", value: record.weight ?? "-" },
                { label: "Record ID", value: record.set_identifier ?? "-" },
              ]
            : []),
          ...(record.alias_target
            ? [{ label: "Evaluate target health", value: record.alias_target.evaluate_target_health ? "Yes" : "No" }]
            : []),
          { label: "Last updated", value: formatDate(record.updated_at) },
        ]}
      />
      {record.is_default && (
        <Box color="text-body-secondary" fontSize="body-s">
          Route 53 created this record with the hosted zone. You can edit it, but you can&apos;t delete it.
        </Box>
      )}
    </SpaceBetween>
  );
}
