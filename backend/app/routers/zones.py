"""Hosted zone and record endpoints. Routers only translate HTTP <-> service calls."""
from __future__ import annotations

import re
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response

from ..db import get_db
from ..deps import CurrentUser, current_user
from ..dns.zonefile import ZoneFileError, export_all_bind, export_all_json, export_bind, export_json
from ..errors import ApiError
from ..schemas import (
    BulkDeleteIn,
    Change,
    ChangeBatchIn,
    ChangeInfo,
    ImportIn,
    ImportResult,
    Page,
    RecordSetIn,
    RecordSetOut,
    RecordSetUpdate,
    ZoneCreate,
    ZoneOut,
    ZoneUpdate,
)
from ..services import changes as change_service
from ..services import records as record_service
from ..services import zones as zone_service
from ..services.importer import import_zone_file

router = APIRouter(prefix="/api/hosted-zones", tags=["hosted zones"])

PageNo = Query(1, ge=1)
PageSize = Query(10, ge=1, le=100)
SortOrder = Query("asc", pattern="^(asc|desc)$")


# --------------------------------------------------------------------------- zones

@router.get("", response_model=Page[ZoneOut])
def list_zones(
    q: str | None = Query(None, max_length=255, description="Matches name, id or description"),
    type: Literal["public", "private"] | None = None,
    page: int = PageNo,
    page_size: int = PageSize,
    sort: str | None = Query(None, pattern="^(name|type|record_count|created_at|comment)$"),
    order: str = SortOrder,
    user: CurrentUser = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    items, total = zone_service.list_zones(db, user.account_id, q=q, zone_type=type, page=page,
                                           page_size=page_size, sort=sort, order=order)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ZoneOut, status_code=201)
def create_zone(body: ZoneCreate, user: CurrentUser = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    return zone_service.create_zone(db, user.account_id, user.username, body)


# Declared before "/{zone_id}" so "export" isn't read as a zone ID.
@router.get("/export")
def export_all_zones(format: Literal["bind", "json"] = "json", user: CurrentUser = Depends(current_user),
                     db: sqlite3.Connection = Depends(get_db)):
    """Every hosted zone of the signed-in account: one JSON file, or a .zip of BIND zone files."""
    zones = [
        (zone_service.get_zone(db, user.account_id, row["id"]), record_service.all_records(db, row))
        for row in zone_service.all_zone_rows(db, user.account_id)
    ]
    if format == "json":
        body, media, filename = export_all_json(zones), "application/json", "hosted-zones.json"
    else:
        body, media, filename = export_all_bind(zones), "application/zip", "hosted-zones-bind.zip"
    return Response(content=body, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/{zone_id}", response_model=ZoneOut)
def get_zone(zone_id: str, user: CurrentUser = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    return zone_service.get_zone(db, user.account_id, zone_id)


@router.patch("/{zone_id}", response_model=ZoneOut)
def update_zone(zone_id: str, body: ZoneUpdate, user: CurrentUser = Depends(current_user),
                db: sqlite3.Connection = Depends(get_db)):
    return zone_service.update_zone(db, user.account_id, zone_id, body)


@router.delete("/{zone_id}", status_code=204)
def delete_zone(zone_id: str, user: CurrentUser = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    zone_service.delete_zone(db, user.account_id, zone_id)
    return Response(status_code=204)


# --------------------------------------------------------------------------- records

@router.get("/{zone_id}/records", response_model=Page[RecordSetOut])
def list_records(
    zone_id: str,
    q: str | None = Query(None, max_length=255, description="Matches record name or value"),
    type: str | None = Query(None, pattern="^(A|AAAA|CNAME|TXT|MX|NS|PTR|SRV|CAA|SOA)$"),
    routing_policy: Literal["simple", "weighted"] | None = None,
    page: int = PageNo,
    page_size: int = Query(50, ge=1, le=300),
    sort: str | None = Query(None, pattern="^(name|type|ttl|routing_policy|updated_at)$"),
    order: str = SortOrder,
    user: CurrentUser = Depends(current_user),
    db: sqlite3.Connection = Depends(get_db),
):
    zone = zone_service.get_zone_row(db, user.account_id, zone_id)
    items, total = record_service.list_records(db, zone, q=q, rtype=type, routing_policy=routing_policy, page=page,
                                               page_size=page_size, sort=sort, order=order)
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{zone_id}/records/{record_id}", response_model=RecordSetOut)
def get_record(zone_id: str, record_id: int, user: CurrentUser = Depends(current_user),
               db: sqlite3.Connection = Depends(get_db)):
    zone = zone_service.get_zone_row(db, user.account_id, zone_id)
    return record_service.get_record(db, zone, record_id)


@router.post("/{zone_id}/records", response_model=RecordSetOut, status_code=201)
def create_record(zone_id: str, body: RecordSetIn, user: CurrentUser = Depends(current_user),
                  db: sqlite3.Connection = Depends(get_db)):
    zone = zone_service.get_zone_row(db, user.account_id, zone_id)
    _, ids = change_service.apply_changes(db, zone, [Change(action="CREATE", record_set=body)], submitted_by=user.username)
    return record_service.get_record(db, zone, ids[0])


@router.put("/{zone_id}/records/{record_id}", response_model=RecordSetOut)
def update_record(zone_id: str, record_id: int, body: RecordSetUpdate, user: CurrentUser = Depends(current_user),
                  db: sqlite3.Connection = Depends(get_db)):
    zone = zone_service.get_zone_row(db, user.account_id, zone_id)
    row = record_service.get_record_row(db, zone_id, record_id)
    # Only change the health check if the request includes the field; otherwise keep the stored one.
    health_check_id = body.health_check_id if "health_check_id" in body.model_fields_set else row["health_check_id"]
    rs = RecordSetIn(
        name=row["name"], type=row["type"], ttl=body.ttl, values=body.values,
        routing_policy=row["routing_policy"], set_identifier=row["set_identifier"] or None,
        weight=body.weight, alias_target=body.alias_target, health_check_id=health_check_id,
    )
    change_service.apply_changes(db, zone, [Change(action="UPSERT", record_set=rs)], submitted_by=user.username)
    return record_service.get_record(db, zone, record_id)


def _delete_change(row: sqlite3.Row) -> Change:
    return Change(action="DELETE", record_set=RecordSetIn(
        name=row["name"], type=row["type"], ttl=row["ttl"], values=[],
        routing_policy=row["routing_policy"], set_identifier=row["set_identifier"] or None, weight=row["weight"],
    ))


@router.delete("/{zone_id}/records/{record_id}", status_code=204)
def delete_record(zone_id: str, record_id: int, user: CurrentUser = Depends(current_user),
                  db: sqlite3.Connection = Depends(get_db)):
    zone = zone_service.get_zone_row(db, user.account_id, zone_id)
    row = record_service.get_record_row(db, zone_id, record_id)
    change_service.apply_changes(db, zone, [_delete_change(row)], submitted_by=user.username)
    return Response(status_code=204)


@router.post("/{zone_id}/records/bulk-delete", response_model=ChangeInfo)
def bulk_delete(zone_id: str, body: BulkDeleteIn, user: CurrentUser = Depends(current_user),
                db: sqlite3.Connection = Depends(get_db)):
    """Deletes several records in ONE atomic change batch: either all go, or none do."""
    zone = zone_service.get_zone_row(db, user.account_id, zone_id)
    rows = [record_service.get_record_row(db, zone_id, rid) for rid in dict.fromkeys(body.record_ids)]
    info, _ = change_service.apply_changes(db, zone, [_delete_change(r) for r in rows], submitted_by=user.username,
                                           comment=f"Deleted {len(rows)} record(s)")
    return info


@router.post("/{zone_id}/changes", response_model=ChangeInfo)
def change_record_sets(zone_id: str, body: ChangeBatchIn, user: CurrentUser = Depends(current_user),
                       db: sqlite3.Connection = Depends(get_db)):
    """Route53's ChangeResourceRecordSets: CREATE / UPSERT / DELETE applied atomically."""
    zone = zone_service.get_zone_row(db, user.account_id, zone_id)
    info, _ = change_service.apply_changes(db, zone, body.changes, submitted_by=user.username, comment=body.comment)
    return info


@router.get("/{zone_id}/changes", response_model=list[ChangeInfo])
def list_changes(zone_id: str, user: CurrentUser = Depends(current_user), db: sqlite3.Connection = Depends(get_db)):
    zone_service.get_zone_row(db, user.account_id, zone_id)
    return change_service.list_changes(db, zone_id)


# --------------------------------------------------------------------------- import / export

@router.post("/{zone_id}/import", response_model=ImportResult)
def import_records(zone_id: str, body: ImportIn, user: CurrentUser = Depends(current_user),
                   db: sqlite3.Connection = Depends(get_db)):
    zone = zone_service.get_zone_row(db, user.account_id, zone_id)
    try:
        return import_zone_file(db, zone, body.zone_file, dry_run=body.dry_run, overwrite=body.overwrite,
                                submitted_by=user.username)
    except ZoneFileError as e:
        raise ApiError(400, "InvalidZoneFile", str(e)) from None


@router.get("/{zone_id}/export")
def export_zone(zone_id: str, format: Literal["bind", "json"] = "bind", user: CurrentUser = Depends(current_user),
                db: sqlite3.Connection = Depends(get_db)):
    zone_row = zone_service.get_zone_row(db, user.account_id, zone_id)
    zone = zone_service.get_zone(db, user.account_id, zone_id)
    records = record_service.all_records(db, zone_row)
    safe = re.sub(r"[^a-z0-9.-]", "_", zone.name.rstrip("."))
    if format == "json":
        body, media, ext = export_json(zone, records), "application/json", "json"
    else:
        body, media, ext = export_bind(zone, records), "text/plain", "zone"
    return Response(content=body, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{safe}.{ext}"'})
