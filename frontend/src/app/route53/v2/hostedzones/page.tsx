"use client";
// Hosted zones list: server-side search, type filter, sorting and pagination.
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import CollectionPreferences from "@cloudscape-design/components/collection-preferences";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Pagination from "@cloudscape-design/components/pagination";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Table, { type TableProps } from "@cloudscape-design/components/table";
import TextFilter from "@cloudscape-design/components/text-filter";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ConsoleLayout, { route53Crumb, zonesCrumb } from "@/components/ConsoleLayout";
import DeleteZoneModal from "@/components/DeleteZoneModal";
import { api, errorMessage } from "@/lib/api";
import { displayName } from "@/lib/dns";
import { readPref, writePref } from "@/lib/storage";
import type { HostedZone } from "@/lib/types";
import { useDebounced } from "@/lib/useDebounced";
import { useFollow } from "@/lib/useFollow";

const TYPE_OPTIONS = [
  { value: "", label: "Type" },
  { value: "public", label: "Public" },
  { value: "private", label: "Private" },
];

function HostedZonesTable() {
  const router = useRouter();
  const follow = useFollow();
  const params = useSearchParams();
  const [filter, setFilter] = useState(params.get("q") ?? "");
  const [type, setType] = useState(TYPE_OPTIONS[0]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sorting, setSorting] = useState<{ field?: string; desc: boolean }>({ field: "name", desc: false });
  const [selected, setSelected] = useState<HostedZone[]>([]);
  const [deleting, setDeleting] = useState<HostedZone | null>(null);
  const q = useDebounced(filter);

  useEffect(() => setPageSize(readPref("r53.zones.pageSize", 10)), []);
  useEffect(() => setFilter(params.get("q") ?? ""), [params]);
  useEffect(() => setPage(1), [q, type, pageSize, sorting]);

  const query = useQuery({
    queryKey: ["zones", { q, type: type.value, page, pageSize, sorting }],
    queryFn: () =>
      api.listZones({
        q,
        type: type.value,
        page,
        page_size: pageSize,
        sort: sorting.field,
        order: sorting.desc ? "desc" : "asc",
      }),
    placeholderData: keepPreviousData, // keep showing the old page while the next one loads
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
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
        items={items}
        columnDefinitions={columns}
        loading={query.isLoading}
        loadingText="Loading hosted zones"
        selectionType="single"
        selectedItems={selected}
        onSelectionChange={(e) => setSelected(e.detail.selectedItems)}
        sortingColumn={{ sortingField: sorting.field }}
        sortingDescending={sorting.desc}
        onSortingChange={(e) =>
          setSorting({ field: e.detail.sortingColumn.sortingField, desc: e.detail.isDescending ?? false })
        }
        ariaLabels={{
          selectionGroupLabel: "Hosted zone selection",
          itemSelectionLabel: (_, z) => displayName(z.name),
        }}
        header={
          <Header
            variant="awsui-h1-sticky"
            counter={query.data ? `(${total})` : undefined}
            description="A hosted zone is a container for records, which include information about how you want to route traffic for a domain (such as example.com) and all of its subdomains."
            actions={
              <SpaceBetween direction="horizontal" size="xs">
                <Button iconName="refresh" ariaLabel="Refresh hosted zones" loading={query.isFetching} onClick={() => query.refetch()} />
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
          <SpaceBetween direction="horizontal" size="xs">
            <div data-shortcut="search" style={{ minWidth: 280 }}>
              <TextFilter
                filteringText={filter}
                filteringPlaceholder="Filter hosted zones by name, ID or description"
                filteringAriaLabel="Filter hosted zones"
                countText={q && !query.isError ? `${total} match${total === 1 ? "" : "es"}` : undefined}
                onChange={(e) => setFilter(e.detail.filteringText)}
              />
            </div>
            <Select
              selectedOption={type}
              options={TYPE_OPTIONS}
              onChange={(e) => setType(e.detail.selectedOption as (typeof TYPE_OPTIONS)[number])}
              ariaLabel="Filter by type"
            />
          </SpaceBetween>
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
            {query.isError ? (
              <SpaceBetween size="xs">
                <b>Couldn&apos;t load hosted zones</b>
                <Box color="inherit">{errorMessage(query.error)}</Box>
                <Button onClick={() => query.refetch()}>Retry</Button>
              </SpaceBetween>
            ) : (
              <SpaceBetween size="xs">
                <b>{q || type.value ? "No matches" : "No hosted zones"}</b>
                <Box color="inherit">
                  {q || type.value ? "No hosted zones match the filter." : "You don't have any hosted zones yet."}
                </Box>
                {q || type.value ? (
                  <Button onClick={() => { setFilter(""); setType(TYPE_OPTIONS[0]); }}>Clear filter</Button>
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
