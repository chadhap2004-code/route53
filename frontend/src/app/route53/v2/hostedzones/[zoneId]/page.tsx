"use client";
// Hosted zone details: zone summary, Records / DNSSEC / Tags tabs, record table with split panel.
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import CopyToClipboard from "@cloudscape-design/components/copy-to-clipboard";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import KeyValuePairs from "@cloudscape-design/components/key-value-pairs";
import Pagination from "@cloudscape-design/components/pagination";
import PropertyFilter from "@cloudscape-design/components/property-filter";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import SplitPanel from "@cloudscape-design/components/split-panel";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import Tabs from "@cloudscape-design/components/tabs";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ConsoleLayout, { route53Crumb, zonesCrumb } from "@/components/ConsoleLayout";
import DeleteRecordsModal from "@/components/DeleteRecordsModal";
import DeleteZoneModal from "@/components/DeleteZoneModal";
import { useNotifications } from "@/components/Notifications";
import RecordDetails from "@/components/RecordDetails";
import { api, errorMessage } from "@/lib/api";
import { RECORD_TYPES, displayName, formatDate, routingLabel } from "@/lib/dns";
import { EMPTY_QUERY, PROPERTY_FILTER_I18N, cleanQuery, tokenValue } from "@/lib/propertyFilter";
import { readPref, writePref } from "@/lib/storage";
import type { HostedZone, RecordSet } from "@/lib/types";

// Free text searches record names and values. Type and routing policy are filtered by the API;
// Alias is filtered on the current page only (see the README limitations).
const FILTERING_PROPERTIES = [
  { key: "type", propertyLabel: "Type", groupValuesLabel: "Type values", operators: ["="] as const },
  { key: "routing", propertyLabel: "Routing policy", groupValuesLabel: "Routing policy values", operators: ["="] as const },
  { key: "alias", propertyLabel: "Alias", groupValuesLabel: "Alias values", operators: ["="] as const },
];
const FILTERING_OPTIONS = [
  ...[...RECORD_TYPES.map((t) => t.value), "SOA"].map((value) => ({ propertyKey: "type", value })),
  { propertyKey: "routing", value: "Simple" },
  { propertyKey: "routing", value: "Weighted" },
  { propertyKey: "alias", value: "Yes" },
  { propertyKey: "alias", value: "No" },
];

const COLUMN_IDS = ["name", "type", "routing", "differentiator", "alias", "value", "ttl", "health", "evaluate", "recordId"];
const DEFAULT_VISIBLE = ["name", "type", "routing", "differentiator", "alias", "value", "ttl", "health", "evaluate", "recordId"];

function ZoneDetails({ zone, onEdit }: { zone: HostedZone; onEdit: () => void }) {
  return (
    <ExpandableSection
      variant="container"
      headerText="Hosted zone details"
      headerActions={<Button onClick={onEdit}>Edit hosted zone</Button>}
      defaultExpanded={false}
    >
      <KeyValuePairs
        columns={3}
        items={[
          { label: "Hosted zone name", value: displayName(zone.name) },
          { label: "Hosted zone ID", value: <CopyToClipboard variant="inline" textToCopy={zone.id} copyErrorText="Failed to copy" copySuccessText="Hosted zone ID copied" /> },
          { label: "Description", value: zone.comment || "-" },
          { label: "Type", value: zone.type === "private" ? "Private hosted zone" : "Public hosted zone" },
          { label: "Record count", value: zone.record_count },
          { label: "Query log", value: "-" },
          {
            label: "Name servers",
            value: (
              <SpaceBetween size="xxxs">
                {zone.name_servers.map((ns) => (
                  <span key={ns}>{ns}</span>
                ))}
                {zone.name_servers.length > 0 && (
                  <CopyToClipboard variant="inline" textToCopy={zone.name_servers.join("\n")} textToDisplay="Copy all" copyErrorText="Failed to copy" copySuccessText="Name servers copied" />
                )}
              </SpaceBetween>
            ),
          },
          ...(zone.type === "private"
            ? [{ label: "VPCs", value: zone.vpcs.map((v) => `${v.vpc_id} (${v.region})`).join(", ") || "-" }]
            : []),
          { label: "Created", value: formatDate(zone.created_at) },
        ]}
      />
    </ExpandableSection>
  );
}

function RecordsTable({
  zone,
  selected,
  setSelected,
}: {
  zone: HostedZone;
  selected: RecordSet[];
  setSelected: (r: RecordSet[]) => void;
}) {
  const router = useRouter();
  const [filterQuery, setFilterQuery] = useState(EMPTY_QUERY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [visible, setVisible] = useState<string[]>(DEFAULT_VISIBLE);
  const [wrapLines, setWrapLines] = useState(false);
  const [sorting, setSorting] = useState<{ field?: string; desc: boolean }>({ desc: false });
  const [deleting, setDeleting] = useState<RecordSet[] | null>(null);
  const q = tokenValue(filterQuery);
  const type = tokenValue(filterQuery, "type");
  const routing = tokenValue(filterQuery, "routing").toLowerCase(); // the API takes "simple" / "weighted"
  const alias = tokenValue(filterQuery, "alias");

  useEffect(() => {
    setPageSize(readPref("r53.records.pageSize", 50));
    setVisible(readPref("r53.records.columns", DEFAULT_VISIBLE));
    setWrapLines(readPref("r53.records.wrap", false));
  }, []);
  useEffect(() => setPage(1), [q, type, routing, alias, pageSize, sorting]);

  const query = useQuery({
    queryKey: ["records", zone.id, { q, type, routing, page, pageSize, sorting }],
    queryFn: () =>
      api.listRecords(zone.id, {
        q,
        type,
        routing_policy: routing,
        page,
        page_size: pageSize,
        sort: sorting.field,
        order: sorting.desc ? "desc" : "asc",
      }),
    placeholderData: keepPreviousData,
  });

  // Alias is a cheap client-side filter on the current page (the server already filtered the rest).
  const items = (query.data?.items ?? []).filter((r) =>
    alias === "Yes" ? !!r.alias_target : alias === "No" ? !r.alias_target : true,
  );
  const total = query.data?.total ?? 0;
  const filtered = filterQuery.tokens.length > 0;

  const columns: TableProps.ColumnDefinition<RecordSet>[] = [
    { id: "name", header: "Record name", sortingField: "name", cell: (r) => displayName(r.name), isRowHeader: true },
    { id: "type", header: "Type", sortingField: "type", cell: (r) => r.type },
    { id: "routing", header: "Routing policy", sortingField: "routing_policy", cell: (r) => routingLabel(r.routing_policy) },
    { id: "differentiator", header: "Differentiator", cell: (r) => (r.routing_policy === "weighted" ? r.weight : "-") },
    { id: "alias", header: "Alias", cell: (r) => (r.alias_target ? "Yes" : "No") },
    {
      id: "value",
      header: "Value/Route traffic to",
      cell: (r) => <span className="value-lines">{r.alias_target ? r.alias_target.dns_name : r.values.join("\n")}</span>,
      maxWidth: 420,
    },
    { id: "ttl", header: "TTL (seconds)", sortingField: "ttl", cell: (r) => r.ttl ?? "-" },
    { id: "health", header: "Health check ID", cell: (r) => r.health_check_id || "-" },
    { id: "evaluate", header: "Evaluate target health", cell: (r) => (r.alias_target ? (r.alias_target.evaluate_target_health ? "Yes" : "No") : "-") },
    { id: "recordId", header: "Record ID", cell: (r) => r.set_identifier || "-" },
  ];

  const one = selected.length === 1 ? selected[0] : null;

  return (
    <>
      <Table
        trackBy="id"
        variant="container"
        items={items}
        columnDefinitions={columns}
        columnDisplay={COLUMN_IDS.map((id) => ({ id, visible: visible.includes(id) }))}
        wrapLines={wrapLines}
        loading={query.isLoading}
        loadingText="Loading records"
        selectionType="multi"
        selectedItems={selected}
        onSelectionChange={(e) => setSelected(e.detail.selectedItems)}
        sortingColumn={{ sortingField: sorting.field }}
        sortingDescending={sorting.desc}
        onSortingChange={(e) => setSorting({ field: e.detail.sortingColumn.sortingField, desc: e.detail.isDescending ?? false })}
        ariaLabels={{
          selectionGroupLabel: "Record selection",
          allItemsSelectionLabel: () => "Select all records",
          itemSelectionLabel: (_, r) => `${r.name} ${r.type}`,
        }}
        header={
          <Header
            counter={query.data ? (selected.length ? `(${selected.length}/${total})` : `(${total})`) : undefined}
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh records" loading={query.isFetching} onClick={() => query.refetch()} />
                <Button disabled={!one} onClick={() => one && router.push(`/route53/v2/hostedzones/${zone.id}/records/${one.id}/edit`)}>
                  Edit record
                </Button>
                <Button disabled={selected.length === 0} onClick={() => setDeleting(selected)}>
                  Delete record{selected.length > 1 ? "s" : ""}
                </Button>
                <Button onClick={() => router.push(`/route53/v2/hostedzones/${zone.id}/import`)}>Import zone file</Button>
                <Button variant="primary" data-shortcut="create" onClick={() => router.push(`/route53/v2/hostedzones/${zone.id}/records/create`)}>
                  Create record
                </Button>
              </SpaceBetween>
            }
          >
            Records
          </Header>
        }
        filter={
          <div data-shortcut="search">
            <PropertyFilter
              query={filterQuery}
              onChange={(e) => setFilterQuery(cleanQuery(e.detail, FILTERING_OPTIONS))}
              filteringProperties={FILTERING_PROPERTIES}
              filteringOptions={FILTERING_OPTIONS}
              filteringPlaceholder="Filter records by property or value"
              filteringAriaLabel="Filter records"
              countText={filtered && !query.isError ? `${alias ? items.length : total} match${(alias ? items.length : total) === 1 ? "" : "es"}` : undefined}
              hideOperations
              expandToViewport
              i18nStrings={PROPERTY_FILTER_I18N}
            />
          </div>
        }
        pagination={
          <Pagination
            currentPageIndex={page}
            pagesCount={Math.max(1, Math.ceil(total / pageSize))}
            onChange={(e) => setPage(e.detail.currentPageIndex)}
            ariaLabels={{ nextPageLabel: "Next page", previousPageLabel: "Previous page", pageLabel: (n) => `Page ${n}` }}
          />
        }
        preferences={
          <CollectionPreferences
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={{ pageSize, wrapLines, contentDisplay: COLUMN_IDS.map((id) => ({ id, visible: visible.includes(id) })) }}
            pageSizePreference={{ title: "Page size", options: [10, 50, 100, 300].map((n) => ({ value: n, label: `${n} records` })) }}
            wrapLinesPreference={{ label: "Wrap lines", description: "Show long values on multiple lines" }}
            contentDisplayPreference={{
              title: "Column preferences",
              options: columns.map((c) => ({ id: c.id!, label: String(c.header), alwaysVisible: c.id === "name" })),
            }}
            onConfirm={(e) => {
              const size = e.detail.pageSize ?? 50;
              const cols = (e.detail.contentDisplay ?? []).filter((c) => c.visible).map((c) => c.id);
              setPageSize(size);
              setVisible(cols);
              setWrapLines(!!e.detail.wrapLines);
              writePref("r53.records.pageSize", size);
              writePref("r53.records.columns", cols);
              writePref("r53.records.wrap", !!e.detail.wrapLines);
            }}
          />
        }
        empty={
          <Box textAlign="center" color="inherit" padding="l">
            {query.isError ? (
              <SpaceBetween size="xs">
                <b>Couldn&apos;t load records</b>
                <Box color="inherit">{errorMessage(query.error)}</Box>
                <Button onClick={() => query.refetch()}>Retry</Button>
              </SpaceBetween>
            ) : (
              <SpaceBetween size="xs">
                <b>{filtered ? "No matches" : "No records"}</b>
                <Box color="inherit">{filtered ? "No records match the filter." : "This hosted zone has no records."}</Box>
                {filtered && <Button onClick={() => setFilterQuery(EMPTY_QUERY)}>Clear filters</Button>}
              </SpaceBetween>
            )}
          </Box>
        }
      />
      {deleting && (
        <DeleteRecordsModal
          zoneId={zone.id}
          records={deleting}
          onDismiss={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setSelected([]);
          }}
        />
      )}
    </>
  );
}

export default function HostedZoneDetailPage({ params }: { params: { zoneId: string } }) {
  const { zoneId } = params;
  const router = useRouter();
  const { notify } = useNotifications();
  const zone = useQuery({ queryKey: ["zone", zoneId], queryFn: () => api.getZone(zoneId) });
  const [selected, setSelected] = useState<RecordSet[]>([]);
  const [splitOpen, setSplitOpen] = useState(false);
  const [deletingZone, setDeletingZone] = useState(false);
  const [tab, setTab] = useState("records");

  // Open the details panel when exactly one record gets selected (the user can still collapse it).
  const selectedId = selected.length === 1 ? selected[0].id : null;
  useEffect(() => {
    if (selectedId !== null) setSplitOpen(true);
  }, [selectedId]);

  const crumbName = zone.data ? displayName(zone.data.name) : zoneId;
  const one = selected.length === 1 ? selected[0] : null;

  const splitPanel = zone.data ? (
    <SplitPanel
      header={one ? displayName(one.name) : selected.length > 1 ? `${selected.length} records selected` : "Record details"}
      closeBehavior="collapse"
      i18nStrings={{
        closeButtonAriaLabel: "Close panel",
        openButtonAriaLabel: "Open panel",
        preferencesTitle: "Preferences",
        preferencesPositionLabel: "Position",
        preferencesPositionDescription: "Choose the default panel position",
        preferencesPositionSide: "Side",
        preferencesPositionBottom: "Bottom",
        preferencesConfirm: "Confirm",
        preferencesCancel: "Cancel",
        resizeHandleAriaLabel: "Resize panel",
      }}
    >
      {one ? (
        <RecordDetails record={one} onEdit={() => router.push(`/route53/v2/hostedzones/${zoneId}/records/${one.id}/edit`)} />
      ) : (
        <Box color="text-body-secondary">
          {selected.length > 1 ? "Select a single record to see its details." : "Select a record to see its details."}
        </Box>
      )}
    </SplitPanel>
  ) : undefined;

  function notAvailable(feature: string) {
    notify({ type: "info", content: `${feature} is outside the scope of this clone.` });
  }

  return (
    <ConsoleLayout
      breadcrumbs={[route53Crumb, zonesCrumb, { text: crumbName, href: `/route53/v2/hostedzones/${zoneId}` }]}
      splitPanel={tab === "records" ? splitPanel : undefined}
      splitPanelOpen={splitOpen}
      onSplitPanelToggle={setSplitOpen}
    >
      {zone.isLoading ? (
        <Box textAlign="center" padding="xxl">
          <Spinner size="large" />
        </Box>
      ) : zone.isError || !zone.data ? (
        <ContentLayout header={<Header variant="h1">Hosted zone</Header>}>
          <Alert type="error" header="Couldn't load hosted zone" action={<Button onClick={() => router.push("/route53/v2/hostedzones")}>Back to hosted zones</Button>}>
            {errorMessage(zone.error)}
          </Alert>
        </ContentLayout>
      ) : (
        <ContentLayout
          header={
            <Header
              variant="h1"
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <Button onClick={() => setDeletingZone(true)}>Delete zone</Button>
                  <Button onClick={() => notAvailable("Test record")}>Test record</Button>
                  <Button onClick={() => notAvailable("Query logging")}>Configure query logging</Button>
                  <ButtonDropdown
                    items={[
                      { id: "bind", text: "BIND zone file (.zone)" },
                      { id: "json", text: "JSON (Route 53 format)" },
                    ]}
                    onItemClick={(e) => {
                      window.location.href = api.exportUrl(zoneId, e.detail.id as "bind" | "json");
                    }}
                  >
                    Export
                  </ButtonDropdown>
                </SpaceBetween>
              }
            >
              {displayName(zone.data.name)}
            </Header>
          }
        >
          <SpaceBetween size="l">
            <ZoneDetails zone={zone.data} onEdit={() => router.push(`/route53/v2/hostedzones/${zoneId}/edit`)} />
            <Tabs
              activeTabId={tab}
              onChange={(e) => setTab(e.detail.activeTabId)}
              tabs={[
                {
                  id: "records",
                  label: `Records (${zone.data.record_count})`,
                  content: <RecordsTable zone={zone.data} selected={selected} setSelected={setSelected} />,
                },
                {
                  id: "dnssec",
                  label: "DNSSEC signing",
                  content: (
                    <Container header={<Header variant="h2">DNSSEC signing</Header>}>
                      <Box color="text-body-secondary">DNSSEC signing: Not signing. DNSSEC is outside the scope of this clone.</Box>
                    </Container>
                  ),
                },
                {
                  id: "tags",
                  label: `Hosted zone tags (${zone.data.tags.length})`,
                  content: (
                    <Table
                      variant="container"
                      items={zone.data.tags}
                      header={
                        <Header
                          counter={`(${zone.data.tags.length})`}
                          actions={<Button onClick={() => router.push(`/route53/v2/hostedzones/${zoneId}/edit`)}>Manage tags</Button>}
                        >
                          Tags
                        </Header>
                      }
                      columnDefinitions={[
                        { id: "key", header: "Key", cell: (t) => t.key },
                        { id: "value", header: "Value", cell: (t) => t.value || "-" },
                      ]}
                      empty={<Box textAlign="center" color="inherit">No tags associated with the resource.</Box>}
                    />
                  ),
                },
              ]}
            />
          </SpaceBetween>
        </ContentLayout>
      )}
      {deletingZone && zone.data && (
        <DeleteZoneModal zone={zone.data} onDismiss={() => setDeletingZone(false)} onDeleted={() => router.push("/route53/v2/hostedzones")} />
      )}
    </ConsoleLayout>
  );
}
