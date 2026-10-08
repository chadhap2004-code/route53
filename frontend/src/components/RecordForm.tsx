"use client";
// One record's fields, used by "Quick create record" (several at once) and "Edit record".
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ColumnLayout from "@cloudscape-design/components/column-layout";
import FormField from "@cloudscape-design/components/form-field";
import Grid from "@cloudscape-design/components/grid";
import Input from "@cloudscape-design/components/input";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Textarea from "@cloudscape-design/components/textarea";
import Toggle from "@cloudscape-design/components/toggle";
import { RECORD_TYPES, ROUTING_OPTIONS, TTL_PRESETS, displayName, typeMeta } from "@/lib/dns";
import type { RecordSet, RecordSetInput, RecordType, RoutingPolicy } from "@/lib/types";

export interface RecordDraft {
  key: number;
  name: string; // relative to the zone ("" = apex)
  type: RecordType;
  alias: boolean;
  aliasTarget: string;
  evaluateHealth: boolean;
  value: string; // one value per line
  ttl: string;
  routing: RoutingPolicy;
  weight: string;
  setIdentifier: string;
}

let nextKey = 1;
export function emptyDraft(): RecordDraft {
  return {
    key: nextKey++,
    name: "",
    type: "A",
    alias: false,
    aliasTarget: "",
    evaluateHealth: false,
    value: "",
    ttl: "300",
    routing: "simple",
    weight: "",
    setIdentifier: "",
  };
}

export function draftFromRecord(r: RecordSet, zoneName: string): RecordDraft {
  const rel = r.name === zoneName ? "" : r.name.endsWith("." + zoneName) ? r.name.slice(0, -(zoneName.length + 1)) : r.name;
  return {
    key: nextKey++,
    name: rel,
    type: r.type,
    alias: !!r.alias_target,
    aliasTarget: r.alias_target?.dns_name ?? "",
    evaluateHealth: r.alias_target?.evaluate_target_health ?? false,
    value: r.values.join("\n"),
    ttl: r.ttl === null ? "300" : String(r.ttl),
    routing: r.routing_policy,
    weight: r.weight === null ? "" : String(r.weight),
    setIdentifier: r.set_identifier ?? "",
  };
}

export function draftToInput(d: RecordDraft): RecordSetInput {
  return {
    name: d.name.trim(),
    type: d.type,
    ttl: d.alias ? null : Number(d.ttl),
    values: d.alias ? [] : d.value.split("\n").map((v) => v.trim()).filter(Boolean),
    routing_policy: d.routing,
    set_identifier: d.routing === "weighted" ? d.setIdentifier.trim() : null,
    weight: d.routing === "weighted" && d.weight !== "" ? Number(d.weight) : null,
    alias_target: d.alias ? { dns_name: d.aliasTarget.trim(), evaluate_target_health: d.evaluateHealth } : null,
  };
}

/** Client-side checks for instant feedback. The server re-validates everything. */
export function draftErrors(d: RecordDraft): Partial<Record<keyof RecordDraft, string>> {
  const e: Partial<Record<keyof RecordDraft, string>> = {};
  if (d.alias) {
    if (!d.aliasTarget.trim()) e.aliasTarget = "Enter the DNS name of the resource to route traffic to.";
  } else {
    if (!d.value.trim()) e.value = "Enter at least one value.";
    if (!/^\d+$/.test(d.ttl) || Number(d.ttl) > 2147483647) e.ttl = "TTL must be a whole number of seconds (0 – 2147483647).";
    if (d.type === "CNAME" && d.value.trim().split("\n").filter((v) => v.trim()).length > 1) e.value = "A CNAME record can have only one value.";
  }
  if (d.routing === "weighted") {
    if (!/^\d+$/.test(d.weight) || Number(d.weight) > 255) e.weight = "Weight must be a number from 0 to 255.";
    if (!d.setIdentifier.trim()) e.setIdentifier = "Record ID is required for weighted records.";
  }
  return e;
}

interface Props {
  draft: RecordDraft;
  zoneName: string;
  onChange: (d: RecordDraft) => void;
  showErrors: boolean;
  mode: "create" | "edit";
  isDefault?: boolean;
}

export default function RecordForm({ draft, zoneName, onChange, showErrors, mode, isDefault }: Props) {
  const set = <K extends keyof RecordDraft>(k: K, v: RecordDraft[K]) => onChange({ ...draft, [k]: v });
  const errs = showErrors ? draftErrors(draft) : {};
  const meta = typeMeta(draft.type);
  const editing = mode === "edit";
  const typeOptions = editing && !meta ? [{ value: draft.type, label: draft.type }] : RECORD_TYPES;
  const selectedType = typeOptions.find((t) => t.value === draft.type) ?? null;

  return (
    <SpaceBetween size="l">
      <ColumnLayout columns={2}>
        <FormField
          label="Record name"
          info={undefined}
          description="Keep blank to create a record for the root domain."
          constraintText="Valid characters: a-z, 0-9, ! &quot; # $ % & ' ( ) * + , - / : ; < = > ? @ [ \ ] ^ _ ` { | } . ~"
        >
          <Grid gridDefinition={[{ colspan: 7 }, { colspan: 5 }]}>
            <Input
              value={draft.name}
              placeholder="subdomain"
              disabled={editing}
              onChange={(e) => set("name", e.detail.value)}
              ariaLabel="Record name"
            />
            <Box padding={{ top: "xxs" }} color="text-body-secondary">
              .{displayName(zoneName)}
            </Box>
          </Grid>
        </FormField>
        <FormField label="Record type">
          <Select
            selectedOption={selectedType}
            options={typeOptions}
            disabled={editing}
            onChange={(e) => {
              const t = e.detail.selectedOption.value as RecordType;
              onChange({ ...draft, type: t, alias: typeMeta(t)?.aliasable ? draft.alias : false });
            }}
            ariaLabel="Record type"
          />
        </FormField>
      </ColumnLayout>

      {meta?.aliasable && !isDefault && (
        <Toggle checked={draft.alias} onChange={(e) => set("alias", e.detail.checked)} description="Route traffic to an AWS resource or another record in this hosted zone instead of entering values.">
          Alias
        </Toggle>
      )}

      {draft.alias ? (
        <SpaceBetween size="l">
          <FormField
            label="Route traffic to"
            description="DNS name of the endpoint, e.g. a CloudFront distribution (d111111abcdef8.cloudfront.net), an S3 website endpoint, a load balancer, or another record in this hosted zone."
            errorText={errs.aliasTarget}
          >
            <Input value={draft.aliasTarget} placeholder="d111111abcdef8.cloudfront.net" onChange={(e) => set("aliasTarget", e.detail.value)} />
          </FormField>
          <Toggle checked={draft.evaluateHealth} onChange={(e) => set("evaluateHealth", e.detail.checked)}>
            Evaluate target health
          </Toggle>
        </SpaceBetween>
      ) : (
        <FormField label="Value" description="Enter multiple values on separate lines." errorText={errs.value}>
          <Textarea
            value={draft.value}
            rows={Math.min(8, Math.max(3, draft.value.split("\n").length))}
            placeholder={meta?.placeholder ?? ""}
            onChange={(e) => set("value", e.detail.value)}
            spellcheck={false}
          />
        </FormField>
      )}

      <ColumnLayout columns={2}>
        <FormField
          label="TTL (seconds)"
          description={draft.alias ? "Alias records use the TTL of the target." : "Recommended values: 60 to 172800 (two days)."}
          errorText={errs.ttl}
        >
          <SpaceBetween direction="horizontal" size="xs">
            <Input type="number" inputMode="numeric" value={draft.alias ? "" : draft.ttl} disabled={draft.alias} onChange={(e) => set("ttl", e.detail.value)} ariaLabel="TTL in seconds" />
            {TTL_PRESETS.map((p) => (
              <Button key={p.label} formAction="none" disabled={draft.alias} onClick={() => set("ttl", String(p.value))}>
                {p.label}
              </Button>
            ))}
          </SpaceBetween>
        </FormField>
        <FormField label="Routing policy" description={editing ? "You can't change the routing policy of an existing record." : undefined}>
          <Select
            selectedOption={ROUTING_OPTIONS.find((o) => o.value === draft.routing) ?? null}
            options={ROUTING_OPTIONS}
            disabled={editing || isDefault}
            onChange={(e) => set("routing", e.detail.selectedOption.value as RoutingPolicy)}
          />
        </FormField>
      </ColumnLayout>

      {draft.routing === "weighted" && (
        <ColumnLayout columns={2}>
          <FormField label="Weight" description="0 – 255. Traffic share = weight ÷ sum of weights for this name and type." errorText={errs.weight}>
            <Input type="number" value={draft.weight} placeholder="10" onChange={(e) => set("weight", e.detail.value)} />
          </FormField>
          <FormField label="Record ID" description="Distinguishes records with the same name and type, e.g. 'blue'." errorText={errs.setIdentifier}>
            <Input value={draft.setIdentifier} disabled={editing} placeholder="blue" onChange={(e) => set("setIdentifier", e.detail.value)} />
          </FormField>
        </ColumnLayout>
      )}
    </SpaceBetween>
  );
}
