"use client";
// Hosted zones list: property filter (free text + Type), sorting and pagination, all done by the API.
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import PropertyFilter from "@cloudscape-design/components/property-filter";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ConsoleLayout, { route53Crumb, zonesCrumb } from "@/components/ConsoleLayout";
import DeleteZoneModal from "@/components/DeleteZoneModal";
import { RefreshStatus, skeletonColumns, skeletonItems } from "@/components/TableSkeleton";
import { api, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/dns";
import { EMPTY_QUERY, PROPERTY_FILTER_I18N, cleanQuery, queryWithText, tokenValue } from "@/lib/propertyFilter";
import { readPref, writePref } from "@/lib/storage";
import type { HostedZone } from "@/lib/types";
import { useFollow } from "@/lib/useFollow";
import { useRefresh } from "@/lib/useRefresh";

// Free text searches the name, ID and description; Type is the one property the API filters on.
const FILTERING_PROPERTIES = [{ key: "type", propertyLabel: "Type", groupValuesLabel: "Type values", operators: ["="] as const }];
const FILTERING_OPTIONS = [
  { propertyKey: "type", value: "Public" },
  { propertyKey: "type", value: "Private" },
];

function HostedZonesTable() {
  const router = useRouter();
  const follow = useFollow();
  const params = useSearchParams();
  const [query, setQuery] = useState(() => queryWithText(params.get("q") ?? ""));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<{ field?: string; desc: boolean }>({ field: "name", desc: false });
  const [selected, setSelected] = useState<HostedZone[]>([]);
  const [deleting, setDeleting] = useState<HostedZone | null>(null);
  const q = tokenValue(query);
  const type = tokenValue(query, "type").toLowerCase(); // the API takes "public" / "private"
  const filtered = !!(q || type);

  useEffect(() => setPageSize(readPref("r53.zones.pageSize", 10)), []);
  useEffect(() => setQuery(queryWithText(params.get("q") ?? "")), [params]); // top-bar search
  useEffect(() => setPage(1), [q, type, pageSize, sorting]);

  const zones = useQuery({
    queryKey: ["zones", { q, type, page, pageSize, sorting }],
    queryFn: () =>
      api.listZones({
        q,
        type,
        page,
        page_size: pageSize,
        sort: sorting.field,
        order: sorting.desc ? "desc" : "asc",
      }),
    placeholderData: keepPreviousData, // keep showing the old page while the next one loads
  });

  const { refreshing, refresh } = useRefresh(zones.refetch);
  // On an error, show the error state (with Retry) instead of the last rows that loaded.
  const items = zones.isError ? [] : zones.data?.items ?? [];
  const total = zones.data?.total ?? 0;
  const one = selected.length === 1 ? selected[0] : null;

  const columns: TableProps.ColumnDefinition<HostedZone>[] = [
    {
      id: "name",
      header: "Hosted zone name",
      sortingField: "name",
      cell: (z) => (
        <Link href={`/route53/v2/hostedzones/${z.id}`} onFollow={follow}>
          {displayName(z.name)}
        </Link>
      ),
      isRowHeader: true,
    },
    { id: "type", header: "Type", sortingField: "type", cell: (z) => (z.type === "private" ? "Private" : "Public") },
    { id: "created_by", header: "Created by", cell: (z) => z.created_by },
    { id: "record_count", header: "Record count", sortingField: "record_count", cell: (z) => z.record_count },
    { id: "comment", header: "Description", sortingField: "comment", cell: (z) => z.comment || "-" },
    { id: "id", header: "Hosted zone ID", cell: (z) => z.id },
  ];

  return (
    <>
      <Table
        variant="full-page"
        stickyHeader
        trackBy="id"
        items={refreshing ? skeletonItems<HostedZone>(items.length) : items}
        columnDefinitions={refreshing ? skeletonColumns(columns) : columns}
        loading={zones.isLoading}
        loadingText="Loading hosted zones"
        selectionType="single"
        isItemDisabled={() => refreshing}
        selectedItems={selected}
        onSelectionChange={(e) => setSelected(e.detail.selectedItems)}
        sortingColumn={{ sortingField: sorting.field }}
        sortingDescending={sorting.desc}
        onSortingChange={(e) =>
          setSorting({ field: e.detail.sortingColumn.sortingField, desc: e.detail.isDescending ?? false })
        }
        ariaLabels={{
          selectionGroupLabel: "Hosted zone selection",
          itemSelectionLabel: (_, z) => (refreshing ? "Loading" : displayName(z.name)),
        }}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={zones.data ? `(${total})` : undefined}
            description="A hosted zone is a container for records, which include information about how you want to route traffic for a domain (such as example.com) and all of its subdomains."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh hosted zones" disabled={refreshing} onClick={refresh} />
                <Button disabled={!one} onClick={() => one && router.push(`/route53/v2/hostedzones/${one.id}`)}>
                  View details
                </Button>
                <Button disabled={!one} onClick={() => one && router.push(`/route53/v2/hostedzones/${one.id}/edit`)}>
                  Edit
                </Button>
                <Button disabled={!one} onClick={() => setDeleting(one)}>
                  Delete
                </Button>
                <Button variant="primary" data-shortcut="create" onClick={() => router.push("/route53/v2/hostedzones/create")}>
                  Create hosted zone
                </Button>
              </SpaceBetween>
            }
          >
            Hosted zones
          </Header>
        }
        filter={
          <div data-shortcut="search">
            <RefreshStatus refreshing={refreshing} text="Loading hosted zones" />
            <PropertyFilter
              query={query}
              disabled={refreshing}
              onChange={(e) => setQuery(cleanQuery(e.detail, FILTERING_OPTIONS))}
              filteringProperties={FILTERING_PROPERTIES}
              filteringOptions={FILTERING_OPTIONS}
              filteringPlaceholder="Filter hosted zones by property or value"
              filteringAriaLabel="Filter hosted zones"
              countText={filtered && !zones.isError ? `${total} match${total === 1 ? "" : "es"}` : undefined}
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
            disabled={refreshing}
            onChange={(e) => setPage(e.detail.currentPageIndex)}
            ariaLabels={{ nextPageLabel: "Next page", previousPageLabel: "Previous page", pageLabel: (n) => `Page ${n}` }}
          />
        }
        preferences={
          <CollectionPreferences
            title="Preferences"
            confirmLabel="Confirm"
            cancelLabel="Cancel"
            preferences={{ pageSize }}
            pageSizePreference={{
              title: "Page size",
              options: [10, 25, 50, 100].map((n) => ({ value: n, label: `${n} hosted zones` })),
            }}
            onConfirm={(e) => {
              const size = e.detail.pageSize ?? 10;
              setPageSize(size);
              writePref("r53.zones.pageSize", size);
            }}
          />
        }
        empty={
          <Box textAlign="center" color="inherit" padding="l">
            {zones.isError ? (
              <SpaceBetween size="xs">
                <b>Couldn&apos;t load hosted zones</b>
                <Box color="inherit">{errorMessage(zones.error)}</Box>
                <Button onClick={refresh}>Retry</Button>
              </SpaceBetween>
            ) : (
              <SpaceBetween size="xs">
                <b>{filtered ? "No matches" : "No hosted zones"}</b>
                <Box color="inherit">
                  {filtered ? "No hosted zones match the filter." : "You don't have any hosted zones yet."}
                </Box>
                {filtered ? (
                  <Button onClick={() => setQuery(EMPTY_QUERY)}>Clear filter</Button>
                ) : (
                  <Button onClick={() => router.push("/route53/v2/hostedzones/create")}>Create hosted zone</Button>
                )}
              </SpaceBetween>
            )}
          </Box>
        }
      />
      {deleting && (
        <DeleteZoneModal
          zone={deleting}
          onDismiss={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setSelected([]);
          }}
          onViewRecords={() => router.push(`/route53/v2/hostedzones/${deleting.id}`)}
        />
      )}
    </>
  );
}

export default function HostedZonesPage() {
  return (
    <ConsoleLayout breadcrumbs={[route53Crumb, zonesCrumb]} contentType="table">
      <Suspense>
        <HostedZonesTable />
      </Suspense>
    </ConsoleLayout>
  );
}
