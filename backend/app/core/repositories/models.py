from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import case

from app.core.db import get_session
from app.core.models import (
    FieldMappingProposalRecord,
    FieldMappingRecord,
    ModelLifecycleEventRecord,
    ModelRegistryRecord,
    ModelRouteRecord,
)

from .base import BaseRepository


class ModelRepository(BaseRepository):
    def _model_to_dict(self, row: ModelRegistryRecord) -> dict[str, Any]:
        return {
            "id": row.id,
            "ai_model_name": row.ai_model_name,
            "version": row.version,
            "task_type": row.task_type,
            "ai_runtime": row.ai_runtime,
            "ai_model_filename": row.ai_model_filename,
            "status": row.status,
            "lifecycle_state": row.lifecycle_state,
            "notes": row.notes,
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }

    def _mapping_to_dict(
        self,
        mapping: FieldMappingRecord,
        model: ModelRegistryRecord | None = None,
    ) -> dict[str, Any]:
        data = {
            "id": mapping.id,
            "domain": mapping.domain,
            "field_name": mapping.field_name,
            "task_type": mapping.task_type,
            "source_data_type": mapping.source_data_type,
            "source_selector": mapping.source_selector,
            "target_data_type": mapping.target_data_type,
            "target_selector": mapping.target_selector,
            "ai_model_id": mapping.ai_model_id,
            "created_at": mapping.created_at,
        }
        if model:
            data.update({
                "ai_model_name": model.ai_model_name,
                "version": model.version,
                "ai_runtime": model.ai_runtime,
                "ai_model_filename": model.ai_model_filename,
                "lifecycle_state": model.lifecycle_state,
            })
        return data

    def _proposal_to_dict(self, row: FieldMappingProposalRecord) -> dict[str, Any]:
        return {
            "id": row.id,
            "domain": row.domain,
            "task_type": row.task_type,
            "source_data_type": row.source_data_type,
            "source_selector": row.source_selector,
            "target_data_type": row.target_data_type,
            "target_selector": row.target_selector,
            "proposed_field_name": row.proposed_field_name,
            "reported_by": row.reported_by,
            "status": row.status,
            "created_at": row.created_at,
        }

    def get_model_route(self, domain: str) -> str | None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                for candidate in self._domain_candidates(domain):
                    row = session.get(ModelRouteRecord, candidate)
                    if row:
                        return row.ai_model_filename
                return None
            finally:
                session.close()
        with self.connect() as conn:
            for candidate in self._domain_candidates(domain):
                row = conn.execute(
                    "SELECT ai_model_filename FROM model_routes WHERE domain = ?",
                    (candidate,),
                ).fetchone()
                if row:
                    return row["ai_model_filename"]
            return None

    def set_model_route(self, domain: str, ai_model_filename: str) -> None:
        clean_domain = self._normalize_domain(domain)
        if not clean_domain:
            return
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(ModelRouteRecord, clean_domain)
                if row:
                    row.ai_model_filename = ai_model_filename
                else:
                    session.add(ModelRouteRecord(domain=clean_domain, ai_model_filename=ai_model_filename))
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                conn.execute(
                    "INSERT INTO model_routes (domain, ai_model_filename) VALUES (?, ?) ON CONFLICT(domain) DO UPDATE SET ai_model_filename=excluded.ai_model_filename",
                    (clean_domain, ai_model_filename)
                )
                conn.commit()

    def get_all_model_routes(self) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                return [
                    {"domain": row.domain, "ai_model_filename": row.ai_model_filename}
                    for row in session.query(ModelRouteRecord).order_by(ModelRouteRecord.domain.asc()).all()
                ]
            finally:
                session.close()
        with self.connect() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM model_routes")]

    def add_model_registry_entry(
        self,
        ai_model_name: str,
        version: str,
        task_type: str,
        ai_runtime: str,
        ai_model_filename: str,
        notes: str | None,
        status: str = "active",
        lifecycle_state: str = "candidate",
    ) -> int:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                now = datetime.now(UTC).isoformat()
                row = ModelRegistryRecord(
                    ai_model_name=ai_model_name,
                    version=version,
                    task_type=task_type,
                    ai_runtime=ai_runtime,
                    ai_model_filename=ai_model_filename,
                    status=status,
                    lifecycle_state=lifecycle_state,
                    notes=notes,
                    created_at=now,
                    updated_at=now,
                )
                session.add(row)
                session.commit()
                session.refresh(row)
                return int(row.id)
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                cursor = conn.execute(
                    """
                    INSERT INTO model_registry (ai_model_name, version, task_type, ai_runtime, ai_model_filename, status, lifecycle_state, notes, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        ai_model_name,
                        version,
                        task_type,
                        ai_runtime,
                        ai_model_filename,
                        status,
                        lifecycle_state,
                        notes,
                        now,
                        now,
                    ),
                )
                conn.commit()
                return int(cursor.lastrowid)

    def get_model_registry(self) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(ModelRegistryRecord)
                    .order_by(ModelRegistryRecord.updated_at.desc(), ModelRegistryRecord.id.desc())
                    .all()
                )
                return [self._model_to_dict(row) for row in rows]
            finally:
                session.close()
        with self.connect() as conn:
            return [
                dict(row)
                for row in conn.execute(
                    "SELECT * FROM model_registry ORDER BY updated_at DESC, id DESC"
                )
            ]

    def get_model_registry_entry(self, model_id: int) -> dict[str, Any] | None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(ModelRegistryRecord, model_id)
                return self._model_to_dict(row) if row else None
            finally:
                session.close()
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM model_registry WHERE id = ?",
                (model_id,),
            ).fetchone()
            return dict(row) if row else None

    def delete_model_registry_entry(self, model_id: int) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(ModelRegistryRecord, model_id)
                if row:
                    session.delete(row)
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                conn.execute("DELETE FROM model_registry WHERE id = ?", (model_id,))
                conn.commit()

    def update_model_registry_entry(
        self,
        ai_model_id: int,
        ai_model_name: str,
        version: str,
        task_type: str,
        notes: str | None,
        lifecycle_state: str,
    ) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(ModelRegistryRecord, ai_model_id)
                if row:
                    row.ai_model_name = ai_model_name
                    row.version = version
                    row.task_type = task_type
                    row.notes = notes
                    row.lifecycle_state = lifecycle_state
                    row.updated_at = datetime.now(UTC).isoformat()
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    """
                    UPDATE model_registry
                    SET ai_model_name = ?, version = ?, task_type = ?, notes = ?, lifecycle_state = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (ai_model_name, version, task_type, notes, lifecycle_state, now, ai_model_id),
                )
                conn.commit()

    def set_field_mapping(
        self,
        domain: str,
        field_name: str,
        task_type: str,
        ai_model_id: int,
        source_data_type: str | None = None,
        source_selector: str | None = None,
        target_data_type: str | None = None,
        target_selector: str | None = None,
    ) -> None:
        clean_domain = self._normalize_domain(domain)
        if not clean_domain:
            return
        if self._use_sqlalchemy:
            session = get_session()
            try:
                now = datetime.now(UTC).isoformat()
                row = (
                    session.query(FieldMappingRecord)
                    .filter(
                        FieldMappingRecord.domain == clean_domain,
                        FieldMappingRecord.field_name == field_name,
                        FieldMappingRecord.task_type == task_type,
                    )
                    .first()
                )
                if row:
                    row.source_data_type = source_data_type or task_type
                    row.source_selector = source_selector or ""
                    row.target_data_type = target_data_type or "text"
                    row.target_selector = target_selector or ""
                    row.ai_model_id = ai_model_id
                    row.created_at = now
                else:
                    session.add(FieldMappingRecord(
                        domain=clean_domain,
                        field_name=field_name,
                        task_type=task_type,
                        source_data_type=source_data_type or task_type,
                        source_selector=source_selector or "",
                        target_data_type=target_data_type or "text",
                        target_selector=target_selector or "",
                        ai_model_id=ai_model_id,
                        created_at=now,
                    ))
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    """
                    INSERT INTO field_mappings (
                        domain, field_name, task_type, source_data_type, source_selector, target_data_type, target_selector, ai_model_id, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(domain, field_name, task_type) DO UPDATE SET
                        source_data_type = excluded.source_data_type,
                        source_selector = excluded.source_selector,
                        target_data_type = excluded.target_data_type,
                        target_selector = excluded.target_selector,
                        ai_model_id = excluded.ai_model_id,
                        created_at = excluded.created_at
                    """,
                    (
                        clean_domain,
                        field_name,
                        task_type,
                        source_data_type or task_type,
                        source_selector or "",
                        target_data_type or "text",
                        target_selector or "",
                        ai_model_id,
                        now,
                    ),
                )
                conn.commit()

    def remove_field_mapping(self, mapping_id: int) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(FieldMappingRecord, mapping_id)
                if row:
                    session.delete(row)
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                conn.execute("DELETE FROM field_mappings WHERE id = ?", (mapping_id,))
                conn.commit()

    def update_field_mapping(
        self,
        mapping_id: int,
        domain: str,
        field_name: str,
        task_type: str,
        source_data_type: str,
        source_selector: str,
        target_data_type: str,
        target_selector: str,
        ai_model_id: int,
    ) -> None:
        clean_domain = self._normalize_domain(domain)
        if not clean_domain:
            return
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(FieldMappingRecord, mapping_id)
                if row:
                    row.domain = clean_domain
                    row.field_name = field_name
                    row.task_type = task_type
                    row.source_data_type = source_data_type
                    row.source_selector = source_selector
                    row.target_data_type = target_data_type
                    row.target_selector = target_selector
                    row.ai_model_id = ai_model_id
                    row.created_at = datetime.now(UTC).isoformat()
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    """
                    UPDATE field_mappings
                    SET domain = ?, field_name = ?, task_type = ?,
                        source_data_type = ?, source_selector = ?, target_data_type = ?, target_selector = ?,
                        ai_model_id = ?, created_at = ?
                    WHERE id = ?
                    """,
                    (
                        clean_domain,
                        field_name,
                        task_type,
                        source_data_type,
                        source_selector,
                        target_data_type,
                        target_selector,
                        ai_model_id,
                        now,
                        mapping_id,
                    ),
                )
                conn.commit()

    def rename_domain_mappings(self, old_domain: str, new_domain: str) -> int:
        clean_old = self._normalize_domain(old_domain)
        clean_new = self._normalize_domain(new_domain)
        if not clean_old or not clean_new:
            return 0
        if self._use_sqlalchemy:
            session = get_session()
            try:
                src_rows = session.query(FieldMappingRecord).filter(FieldMappingRecord.domain == clean_old).all()
                for src in src_rows:
                    conflict = (
                        session.query(FieldMappingRecord)
                        .filter(
                            FieldMappingRecord.domain == clean_new,
                            FieldMappingRecord.field_name == src.field_name,
                            FieldMappingRecord.task_type == src.task_type,
                        )
                        .first()
                    )
                    if conflict:
                        raise ValueError("domain rename would create duplicate mapping keys")
                updated = 0
                for src in src_rows:
                    src.domain = clean_new
                    updated += 1
                session.commit()
                return updated
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                conflict = conn.execute(
                    """
                    SELECT 1
                    FROM field_mappings src
                    JOIN field_mappings dst
                      ON dst.domain = ?
                     AND dst.field_name = src.field_name
                     AND dst.task_type = src.task_type
                    WHERE src.domain = ?
                    LIMIT 1
                    """,
                    (clean_new, clean_old),
                ).fetchone()
                if conflict:
                    raise ValueError("domain rename would create duplicate mapping keys")
                result = conn.execute(
                    "UPDATE field_mappings SET domain = ? WHERE domain = ?",
                    (clean_new, clean_old),
                )
                conn.commit()
                return int(result.rowcount or 0)

    def assign_model_to_domain(self, domain: str, ai_model_id: int) -> int:
        clean_domain = self._normalize_domain(domain)
        if not clean_domain:
            return 0
        if self._use_sqlalchemy:
            session = get_session()
            try:
                model_row = session.get(ModelRegistryRecord, ai_model_id)
                if not model_row:
                    return 0
                model_task = str(model_row.task_type)
                rows = (
                    session.query(FieldMappingRecord)
                    .filter(FieldMappingRecord.domain == clean_domain, FieldMappingRecord.task_type == model_task)
                    .all()
                )
                if not rows:
                    rows = (
                        session.query(FieldMappingRecord)
                        .filter(FieldMappingRecord.domain == clean_domain, FieldMappingRecord.source_data_type == model_task)
                        .all()
                    )
                if not rows:
                    rows = session.query(FieldMappingRecord).filter(FieldMappingRecord.domain == clean_domain).all()
                for row in rows:
                    row.ai_model_id = ai_model_id
                session.commit()
                return len(rows)
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                model_row = conn.execute(
                    "SELECT task_type FROM model_registry WHERE id = ?",
                    (ai_model_id,),
                ).fetchone()
                if not model_row:
                    return 0
                model_task = str(model_row["task_type"])
                # Preferred path: only update mappings with matching task type.
                result = conn.execute(
                    """
                    UPDATE field_mappings
                    SET ai_model_id = ?
                    WHERE domain = ? AND task_type = ?
                    """,
                    (ai_model_id, clean_domain, model_task),
                )
                updated = int(result.rowcount or 0)
                if updated > 0:
                    conn.commit()
                    return updated

                # Backward-compat path for older datasets where task_type can be stale.
                # First try source_data_type match.
                result = conn.execute(
                    """
                    UPDATE field_mappings
                    SET ai_model_id = ?
                    WHERE domain = ? AND source_data_type = ?
                    """,
                    (ai_model_id, clean_domain, model_task),
                )
                updated = int(result.rowcount or 0)
                if updated > 0:
                    conn.commit()
                    return updated

                # Final fallback: if domain has mappings, apply model across that domain.
                exists = conn.execute(
                    "SELECT 1 FROM field_mappings WHERE domain = ? LIMIT 1",
                    (clean_domain,),
                ).fetchone()
                if not exists:
                    conn.commit()
                    return 0
                result = conn.execute(
                    """
                    UPDATE field_mappings
                    SET ai_model_id = ?
                    WHERE domain = ?
                    """,
                    (ai_model_id, clean_domain),
                )
                conn.commit()
                return int(result.rowcount or 0)

    def get_all_field_mappings(self) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(FieldMappingRecord, ModelRegistryRecord)
                    .outerjoin(ModelRegistryRecord, ModelRegistryRecord.id == FieldMappingRecord.ai_model_id)
                    .order_by(FieldMappingRecord.created_at.desc(), FieldMappingRecord.id.desc())
                    .all()
                )
                return [self._mapping_to_dict(mapping, model) for mapping, model in rows]
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT fm.id, fm.domain, fm.field_name, fm.task_type,
                       fm.source_data_type, fm.source_selector, fm.target_data_type, fm.target_selector,
                       fm.ai_model_id, fm.created_at,
                       mr.ai_model_name, mr.version, mr.ai_runtime, mr.ai_model_filename, mr.lifecycle_state
                FROM field_mappings fm
                LEFT JOIN model_registry mr ON mr.id = fm.ai_model_id
                ORDER BY fm.created_at DESC, fm.id DESC
                """
            )
            return [dict(row) for row in rows]

    def get_domain_field_mappings(self, domain: str) -> dict[str, dict[str, str]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                result: dict[str, dict[str, str]] = {}
                for candidate in self._domain_candidates(domain):
                    rows = (
                        session.query(FieldMappingRecord, ModelRegistryRecord)
                        .join(ModelRegistryRecord, ModelRegistryRecord.id == FieldMappingRecord.ai_model_id)
                        .filter(FieldMappingRecord.domain == candidate, ModelRegistryRecord.status == "active")
                        .all()
                    )
                    for mapping, model in rows:
                        result[mapping.field_name] = {
                            "task_type": mapping.task_type,
                            "source_data_type": mapping.source_data_type,
                            "source_selector": mapping.source_selector,
                            "target_data_type": mapping.target_data_type,
                            "target_selector": mapping.target_selector,
                            "runtime": model.ai_runtime,
                            "model_filename": model.ai_model_filename,
                            "lifecycle_state": model.lifecycle_state,
                        }
                    if result:
                        return result
                return result
            finally:
                session.close()
        with self.connect() as conn:
            result: dict[str, dict[str, str]] = {}
            for candidate in self._domain_candidates(domain):
                rows = conn.execute(
                    """
                    SELECT fm.field_name, fm.task_type, fm.source_data_type, fm.source_selector, fm.target_data_type, fm.target_selector,
                           mr.ai_runtime, mr.ai_model_filename, mr.lifecycle_state
                    FROM field_mappings fm
                    JOIN model_registry mr ON mr.id = fm.ai_model_id
                    WHERE fm.domain = ? AND mr.status = 'active'
                    """,
                    (candidate,),
                )
                for row in rows:
                    result[row["field_name"]] = {
                        "task_type": row["task_type"],
                        "source_data_type": row["source_data_type"],
                        "source_selector": row["source_selector"],
                        "target_data_type": row["target_data_type"],
                        "target_selector": row["target_selector"],
                        "runtime": row["ai_runtime"],
                        "model_filename": row["ai_model_filename"],
                        "lifecycle_state": row["lifecycle_state"],
                    }
                if result:
                    return result
            return result

    def get_all_domain_field_mappings(self) -> dict[str, list[dict[str, Any]]]:
        """Return approved field mappings for all domains for extension sync."""
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(FieldMappingRecord, ModelRegistryRecord)
                    .join(ModelRegistryRecord, ModelRegistryRecord.id == FieldMappingRecord.ai_model_id)
                    .filter(ModelRegistryRecord.status == "active")
                    .order_by(FieldMappingRecord.domain.asc(), FieldMappingRecord.id.asc())
                    .all()
                )
                grouped: dict[str, list[dict[str, Any]]] = {}
                for mapping, model in rows:
                    grouped.setdefault(mapping.domain, []).append({
                        "field_name": mapping.field_name,
                        "task_type": mapping.task_type,
                        "source_data_type": mapping.source_data_type,
                        "source_selector": mapping.source_selector,
                        "target_data_type": mapping.target_data_type,
                        "target_selector": mapping.target_selector,
                        "ai_model_name": model.ai_model_name,
                        "version": model.version,
                        "ai_runtime": model.ai_runtime,
                        "ai_model_filename": model.ai_model_filename,
                        "lifecycle_state": model.lifecycle_state,
                    })
                return grouped
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT fm.domain, fm.field_name, fm.task_type,
                       fm.source_data_type, fm.source_selector, fm.target_data_type, fm.target_selector,
                       mr.ai_model_name, mr.version, mr.ai_runtime, mr.ai_model_filename, mr.lifecycle_state
                FROM field_mappings fm
                JOIN model_registry mr ON mr.id = fm.ai_model_id
                WHERE mr.status = 'active'
                ORDER BY fm.domain ASC, fm.id ASC
                """
            )
            grouped: dict[str, list[dict[str, Any]]] = {}
            for row in rows:
                domain = row["domain"]
                grouped.setdefault(domain, []).append(
                    {
                        "field_name": row["field_name"],
                        "task_type": row["task_type"],
                        "source_data_type": row["source_data_type"],
                        "source_selector": row["source_selector"],
                        "target_data_type": row["target_data_type"],
                        "target_selector": row["target_selector"],
                        "ai_model_name": row["ai_model_name"],
                        "version": row["version"],
                        "ai_runtime": row["ai_runtime"],
                        "ai_model_filename": row["ai_model_filename"],
                        "lifecycle_state": row["lifecycle_state"],
                    }
                )
            return grouped

    def propose_field_mapping(
        self,
        domain: str,
        task_type: str,
        source_data_type: str,
        source_selector: str,
        target_data_type: str,
        target_selector: str,
        proposed_field_name: str,
        reported_by: int,
    ) -> None:
        clean_domain = self._normalize_domain(domain)
        if not clean_domain:
            return
        if self._use_sqlalchemy:
            session = get_session()
            try:
                exists = (
                    session.query(FieldMappingProposalRecord)
                    .filter(
                        FieldMappingProposalRecord.domain == clean_domain,
                        FieldMappingProposalRecord.task_type == task_type,
                        FieldMappingProposalRecord.source_selector == source_selector,
                        FieldMappingProposalRecord.target_selector == target_selector,
                        FieldMappingProposalRecord.status == "pending",
                    )
                    .first()
                )
                if exists:
                    return
                approved_exists = (
                    session.query(FieldMappingRecord)
                    .filter(
                        FieldMappingRecord.domain == clean_domain,
                        FieldMappingRecord.task_type == task_type,
                        FieldMappingRecord.source_selector == source_selector,
                        FieldMappingRecord.target_selector == target_selector,
                    )
                    .first()
                )
                if approved_exists:
                    return
                session.add(FieldMappingProposalRecord(
                    domain=clean_domain,
                    task_type=task_type,
                    source_data_type=source_data_type,
                    source_selector=source_selector,
                    target_data_type=target_data_type,
                    target_selector=target_selector,
                    proposed_field_name=proposed_field_name,
                    reported_by=reported_by,
                    status="pending",
                    created_at=datetime.now(UTC).isoformat(),
                ))
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                now = datetime.now(UTC).isoformat()
                exists = conn.execute(
                    """
                    SELECT id FROM field_mapping_proposals
                    WHERE domain = ? AND task_type = ? AND source_selector = ? AND target_selector = ? AND status = 'pending'
                    """,
                    (clean_domain, task_type, source_selector, target_selector),
                ).fetchone()
                if exists:
                    return
                approved_exists = conn.execute(
                    """
                    SELECT id FROM field_mappings
                    WHERE domain = ? AND task_type = ? AND source_selector = ? AND target_selector = ?
                    LIMIT 1
                    """,
                    (clean_domain, task_type, source_selector, target_selector),
                ).fetchone()
                if approved_exists:
                    return
                conn.execute(
                    """
                    INSERT INTO field_mapping_proposals (
                        domain, task_type, source_data_type, source_selector, target_data_type, target_selector,
                        proposed_field_name, reported_by, status, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
                    """,
                    (
                        clean_domain,
                        task_type,
                        source_data_type,
                        source_selector,
                        target_data_type,
                        target_selector,
                        proposed_field_name,
                        reported_by,
                        now,
                    ),
                )
                conn.commit()

    def get_pending_field_mapping_proposals(self) -> list[dict[str, Any]]:
        return self.get_field_mapping_proposals(status="pending")

    def get_field_mapping_proposals(self, status: str = "pending", limit: int = 500) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                query = session.query(FieldMappingProposalRecord)
                if status != "all":
                    query = query.filter(FieldMappingProposalRecord.status == status)
                rows = query.order_by(FieldMappingProposalRecord.id.desc()).limit(limit).all()
                return [self._proposal_to_dict(row) for row in rows]
            finally:
                session.close()
        if status == "pending":
            with self.connect() as conn:
                rows = conn.execute(
                    """
                    SELECT * FROM field_mapping_proposals
                    WHERE status = 'pending'
                    ORDER BY id DESC
                    """
                )
                return [dict(row) for row in rows]
        with self.connect() as conn:
            if status == "all":
                rows = conn.execute(
                    "SELECT * FROM field_mapping_proposals ORDER BY id DESC LIMIT ?",
                    (limit,),
                )
            else:
                rows = conn.execute(
                    "SELECT * FROM field_mapping_proposals WHERE status = ? ORDER BY id DESC LIMIT ?",
                    (status, limit),
                )
            return [dict(row) for row in rows]

    def get_field_mapping_proposal(self, proposal_id: int) -> dict[str, Any] | None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(FieldMappingProposalRecord, proposal_id)
                return self._proposal_to_dict(row) if row else None
            finally:
                session.close()
        with self.connect() as conn:
            row = conn.execute(
                "SELECT * FROM field_mapping_proposals WHERE id = ?",
                (proposal_id,),
            ).fetchone()
            return dict(row) if row else None

    def mark_field_mapping_proposal_status(self, proposal_id: int, status: str) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(FieldMappingProposalRecord, proposal_id)
                if row:
                    row.status = status
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                conn.execute(
                    "UPDATE field_mapping_proposals SET status = ? WHERE id = ?",
                    (status, proposal_id),
                )
                conn.commit()

    def delete_field_mapping_proposal(self, proposal_id: int) -> bool:
        """Permanently delete a field-mapping proposal. Returns True if deleted."""
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(FieldMappingProposalRecord, proposal_id)
                if not row:
                    return False
                session.delete(row)
                session.commit()
                return True
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                cur = conn.execute(
                    "DELETE FROM field_mapping_proposals WHERE id = ?", (proposal_id,)
                )
                conn.commit()
                return cur.rowcount > 0

    def update_field_mapping_proposal(self, proposal_id: int, **fields) -> bool:
        """Patch editable columns on a field-mapping proposal.

        Accepted keys: domain, task_type, source_selector, target_selector,
                        proposed_field_name, source_data_type, target_data_type, status
        Returns True if a row was updated.
        """
        allowed = {
            "domain", "task_type", "source_selector", "target_selector",
            "proposed_field_name", "source_data_type", "target_data_type", "status",
        }
        parts, params = [], []
        for k, v in fields.items():
            if k in allowed and v is not None:
                parts.append(f"{k} = ?")
                params.append(v)
        if not parts:
            return False
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(FieldMappingProposalRecord, proposal_id)
                if not row:
                    return False
                for key, value in fields.items():
                    if key in allowed and value is not None:
                        setattr(row, key, value)
                session.commit()
                return True
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        params.append(proposal_id)
        # SAFETY: column names in `parts` are validated against the `allowed` set above.
        # Parameters use ? placeholders.
        sql = f"UPDATE field_mapping_proposals SET {', '.join(parts)} WHERE id = ?"
        with self._lock:
            with self.connect() as conn:
                cur = conn.execute(sql, params)
                conn.commit()
                return cur.rowcount > 0


    def get_field_mapped_model(
        self,
        domain: str | None,
        field_name: str | None,
        task_type: str,
    ) -> dict[str, Any] | None:
        domain_candidates = self._domain_candidates(domain)
        if not domain_candidates:
            return None
        if self._use_sqlalchemy:
            session = get_session()
            try:
                lifecycle_rank = case(
                    (ModelRegistryRecord.lifecycle_state == "production", 0),
                    (ModelRegistryRecord.lifecycle_state == "staging", 1),
                    (ModelRegistryRecord.lifecycle_state == "candidate", 2),
                    else_=3,
                )
                for candidate in domain_candidates:
                    if field_name:
                        row = (
                            session.query(ModelRegistryRecord)
                            .join(FieldMappingRecord, ModelRegistryRecord.id == FieldMappingRecord.ai_model_id)
                            .filter(
                                FieldMappingRecord.domain == candidate,
                                FieldMappingRecord.field_name == field_name,
                                FieldMappingRecord.task_type == task_type,
                            )
                            .order_by(lifecycle_rank)
                            .first()
                        )
                        if row and row.status == "active":
                            return {
                                "ai_runtime": row.ai_runtime,
                                "ai_model_filename": row.ai_model_filename,
                                "status": row.status,
                                "lifecycle_state": row.lifecycle_state,
                            }
                    field_rank = case(
                        (FieldMappingRecord.field_name == f"{task_type}_default", 0),
                        (FieldMappingRecord.field_name == "default", 1),
                        else_=2,
                    )
                    row = (
                        session.query(ModelRegistryRecord)
                        .join(FieldMappingRecord, ModelRegistryRecord.id == FieldMappingRecord.ai_model_id)
                        .filter(FieldMappingRecord.domain == candidate, FieldMappingRecord.task_type == task_type)
                        .order_by(field_rank, lifecycle_rank)
                        .first()
                    )
                    if row and row.status == "active":
                        return {
                            "ai_runtime": row.ai_runtime,
                            "ai_model_filename": row.ai_model_filename,
                            "status": row.status,
                            "lifecycle_state": row.lifecycle_state,
                        }
                return None
            finally:
                session.close()
        with self.connect() as conn:
            for candidate in domain_candidates:
                if field_name:
                    row = conn.execute(
                        """
                        SELECT mr.ai_runtime, mr.ai_model_filename, mr.status, mr.lifecycle_state
                        FROM field_mappings fm
                        JOIN model_registry mr ON mr.id = fm.ai_model_id
                        WHERE fm.domain = ? AND fm.field_name = ? AND fm.task_type = ?
                        ORDER BY CASE mr.lifecycle_state
                            WHEN 'production' THEN 0
                            WHEN 'staging' THEN 1
                            WHEN 'candidate' THEN 2
                            ELSE 3
                        END
                        LIMIT 1
                        """,
                        (candidate, field_name, task_type),
                    ).fetchone()
                    if row:
                        data = dict(row)
                        if data.get("status") == "active":
                            return data
                # Fallback to domain+task default mapping to avoid hard field coupling.
                row = conn.execute(
                    """
                    SELECT mr.ai_runtime, mr.ai_model_filename, mr.status, mr.lifecycle_state
                    FROM field_mappings fm
                    JOIN model_registry mr ON mr.id = fm.ai_model_id
                    WHERE fm.domain = ? AND fm.task_type = ?
                    ORDER BY CASE
                        WHEN fm.field_name = ? THEN 0
                        WHEN fm.field_name = ? THEN 1
                        ELSE 2
                    END,
                    CASE mr.lifecycle_state
                        WHEN 'production' THEN 0
                        WHEN 'staging' THEN 1
                        WHEN 'candidate' THEN 2
                        ELSE 3
                    END
                    LIMIT 1
                    """,
                    (candidate, task_type, f"{task_type}_default", "default"),
                ).fetchone()
                if row:
                    data = dict(row)
                    if data.get("status") == "active":
                        return data
            return None

    def set_lifecycle_state(
        self,
        ai_model_id: int,
        to_state: str,
        changed_by: int | None,
        reason: str | None = None,
    ) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(ModelRegistryRecord, ai_model_id)
                if not row:
                    return
                from_state = row.lifecycle_state
                now = datetime.now(UTC).isoformat()
                row.lifecycle_state = to_state
                row.updated_at = now
                session.add(ModelLifecycleEventRecord(
                    ai_model_id=ai_model_id,
                    from_state=from_state,
                    to_state=to_state,
                    reason=reason,
                    changed_by=changed_by,
                    created_at=now,
                ))
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                row = conn.execute(
                    "SELECT lifecycle_state FROM model_registry WHERE id = ?",
                    (ai_model_id,),
                ).fetchone()
                if not row:
                    return
                from_state = row["lifecycle_state"]
                now = datetime.now(UTC).isoformat()
                conn.execute(
                    "UPDATE model_registry SET lifecycle_state = ?, updated_at = ? WHERE id = ?",
                    (to_state, now, ai_model_id),
                )
                conn.execute(
                    """
                    INSERT INTO model_lifecycle_events (ai_model_id, from_state, to_state, reason, changed_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (ai_model_id, from_state, to_state, reason, changed_by, now),
                )
                conn.commit()

    def get_latest_model_by_state(self, task_type: str, lifecycle_state: str, exclude_id: int | None = None) -> dict[str, Any] | None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                query = session.query(ModelRegistryRecord).filter(
                    ModelRegistryRecord.task_type == task_type,
                    ModelRegistryRecord.lifecycle_state == lifecycle_state,
                    ModelRegistryRecord.status == "active",
                )
                if exclude_id is not None:
                    query = query.filter(ModelRegistryRecord.id != exclude_id)
                row = query.order_by(ModelRegistryRecord.updated_at.desc(), ModelRegistryRecord.id.desc()).first()
                return self._model_to_dict(row) if row else None
            finally:
                session.close()
        with self.connect() as conn:
            query = """
                SELECT * FROM model_registry
                WHERE task_type = ? AND lifecycle_state = ? AND status = 'active'
            """
            params: list[Any] = [task_type, lifecycle_state]
            if exclude_id is not None:
                query += " AND id != ?"
                params.append(exclude_id)
            query += " ORDER BY updated_at DESC, id DESC LIMIT 1"
            row = conn.execute(query, tuple(params)).fetchone()
            return dict(row) if row else None
