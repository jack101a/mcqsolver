from __future__ import annotations

import hashlib as _hashlib
from datetime import UTC, datetime
from typing import Any

from app.core.db import get_session
from app.core.models import AutofillRuleProposalRecord, LocatorRecord

from .base import BaseRepository


class AutofillRepository(BaseRepository):
    def _proposal_to_dict(self, row: AutofillRuleProposalRecord) -> dict[str, Any]:
        return {
            "id": row.id,
            "idempotency_key": row.idempotency_key,
            "device_id": row.device_id,
            "api_key_id": row.api_key_id,
            "status": row.status,
            "reviewed_by": row.reviewed_by,
            "reviewed_at": row.reviewed_at,
            "submitted_at": row.submitted_at,
            "rule_json": row.rule_json,
            "approved_rule_id": row.approved_rule_id,
            "created_at": row.created_at,
        }

    def _locator_to_dict(self, row: LocatorRecord) -> dict[str, Any]:
        return {
            "id": row.id,
            "domain": row.domain,
            "image_selector": row.image_selector,
            "input_selector": row.input_selector,
            "status": row.status,
            "created_at": row.created_at,
        }

    def submit_autofill_proposal(
        self,
        idempotency_key: str,
        device_id: str,
        api_key_id: int,
        rule_json: str,
        submitted_at: str,
    ) -> dict[str, Any]:
        """Insert a new rule proposal (idempotent). Returns the row as dict."""
        now = datetime.now(UTC).isoformat()
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = (
                    session.query(AutofillRuleProposalRecord)
                    .filter(AutofillRuleProposalRecord.idempotency_key == idempotency_key)
                    .first()
                )
                if not row:
                    row = AutofillRuleProposalRecord(
                        idempotency_key=idempotency_key,
                        device_id=device_id,
                        api_key_id=api_key_id,
                        status="pending",
                        submitted_at=submitted_at,
                        rule_json=rule_json,
                        created_at=now,
                    )
                    session.add(row)
                    session.commit()
                    session.refresh(row)
                return self._proposal_to_dict(row)
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO autofill_rule_proposals
                        (idempotency_key, device_id, api_key_id, status,
                         submitted_at, rule_json, created_at)
                    VALUES (?, ?, ?, 'pending', ?, ?, ?)
                    """,
                    (idempotency_key, device_id, api_key_id, submitted_at, rule_json, now),
                )
                conn.commit()
                row = conn.execute(
                    "SELECT * FROM autofill_rule_proposals WHERE idempotency_key = ?",
                    (idempotency_key,),
                ).fetchone()
                return dict(row) if row else {}

    def get_autofill_proposals(self, status: str | None = None, limit: int = 200) -> list[dict]:
        """Return proposals optionally filtered by status."""
        if self._use_sqlalchemy:
            session = get_session()
            try:
                query = session.query(AutofillRuleProposalRecord)
                if status:
                    query = query.filter(AutofillRuleProposalRecord.status == status)
                rows = query.order_by(AutofillRuleProposalRecord.created_at.desc()).limit(limit).all()
                return [self._proposal_to_dict(row) for row in rows]
            finally:
                session.close()
        with self.connect() as conn:
            if status:
                rows = conn.execute(
                    "SELECT * FROM autofill_rule_proposals WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                    (status, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM autofill_rule_proposals ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [dict(r) for r in rows]

    def approve_autofill_proposal(self, proposal_id: int, reviewed_by: str = "admin") -> str:
        """Approve a proposal, generate a server_rule_id, return it."""
        now = datetime.now(UTC).isoformat()
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(AutofillRuleProposalRecord, proposal_id)
                if not row:
                    raise ValueError(f"Proposal {proposal_id} not found")
                server_rule_id = "srv_" + _hashlib.sha1(
                    (str(proposal_id) + row.rule_json).encode()
                ).hexdigest()[:12]
                row.status = "approved"
                row.reviewed_by = reviewed_by
                row.reviewed_at = now
                row.approved_rule_id = server_rule_id
                session.commit()
                return server_rule_id
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                row = conn.execute(
                    "SELECT rule_json FROM autofill_rule_proposals WHERE id = ?",
                    (proposal_id,),
                ).fetchone()
                if not row:
                    raise ValueError(f"Proposal {proposal_id} not found")
                server_rule_id = "srv_" + _hashlib.sha1(
                    (str(proposal_id) + row["rule_json"]).encode()
                ).hexdigest()[:12]
                conn.execute(
                    """
                    UPDATE autofill_rule_proposals
                    SET status = 'approved', reviewed_by = ?, reviewed_at = ?,
                        approved_rule_id = ?
                    WHERE id = ?
                    """,
                    (reviewed_by, now, server_rule_id, proposal_id),
                )
                conn.commit()
                return server_rule_id

    def reject_autofill_proposal(self, proposal_id: int, reviewed_by: str = "admin") -> None:
        """Reject a proposal."""
        now = datetime.now(UTC).isoformat()
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(AutofillRuleProposalRecord, proposal_id)
                if row:
                    row.status = "rejected"
                    row.reviewed_by = reviewed_by
                    row.reviewed_at = now
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
                    """
                    UPDATE autofill_rule_proposals
                    SET status = 'rejected', reviewed_by = ?, reviewed_at = ?
                    WHERE id = ?
                    """,
                    (reviewed_by, now, proposal_id),
                )
                conn.commit()

    def delete_autofill_proposal(self, proposal_id: int) -> bool:
        """Permanently delete a proposal. Returns True if a row was deleted."""
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(AutofillRuleProposalRecord, proposal_id)
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
                    "DELETE FROM autofill_rule_proposals WHERE id = ?", (proposal_id,)
                )
                conn.commit()
                return cur.rowcount > 0

    def update_autofill_proposal(self, proposal_id: int, rule_json: str | None = None, status: str | None = None) -> bool:
        """Patch editable fields on a proposal. Returns True if a row was updated."""
        parts, params = [], []
        if rule_json is not None:
            parts.append("rule_json = ?")
            params.append(rule_json)
        if status is not None:
            allowed = {"pending", "approved", "rejected"}
            if status not in allowed:
                raise ValueError(f"Invalid status: {status!r}")
            parts.append("status = ?")
            params.append(status)
        if not parts:
            return False
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(AutofillRuleProposalRecord, proposal_id)
                if not row:
                    return False
                if rule_json is not None:
                    row.rule_json = rule_json
                if status is not None:
                    row.status = status
                session.commit()
                return True
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        params.append(proposal_id)
        # SAFETY: parts only contains hardcoded column names ("rule_json", "status").
        # status is validated against a whitelist above. Parameters use ? placeholders.
        sql = f"UPDATE autofill_rule_proposals SET {', '.join(parts)} WHERE id = ?"
        with self._lock:
            with self.connect() as conn:
                cur = conn.execute(sql, params)
                conn.commit()
                return cur.rowcount > 0

    def get_approved_autofill_rules(self) -> list[dict]:
        """Return all approved proposals for extension sync download."""
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(AutofillRuleProposalRecord)
                    .filter(AutofillRuleProposalRecord.status == "approved")
                    .order_by(AutofillRuleProposalRecord.reviewed_at.desc())
                    .all()
                )
                return [
                    {
                        "id": row.id,
                        "approved_rule_id": row.approved_rule_id,
                        "rule_json": row.rule_json,
                        "reviewed_at": row.reviewed_at,
                    }
                    for row in rows
                ]
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT id, approved_rule_id, rule_json, reviewed_at
                FROM autofill_rule_proposals
                WHERE status = 'approved'
                ORDER BY reviewed_at DESC
                """
            ).fetchall()
            return [dict(r) for r in rows]

    def propose_locator(self, domain: str, img: str, inp: str) -> None:
        clean_domain = self._normalize_domain(domain)
        if not clean_domain:
            return
        if self._use_sqlalchemy:
            session = get_session()
            try:
                exists = (
                    session.query(LocatorRecord)
                    .filter(
                        LocatorRecord.domain == clean_domain,
                        LocatorRecord.image_selector == img,
                        LocatorRecord.input_selector == inp,
                        LocatorRecord.status == "pending",
                    )
                    .first()
                )
                if not exists:
                    session.add(LocatorRecord(
                        domain=clean_domain,
                        image_selector=img,
                        input_selector=inp,
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
        with self._lock, self.connect() as conn:
            now = datetime.now(UTC).isoformat()
            # If the exact proposal already exists and is pending, ignore
            exists = conn.execute("SELECT id FROM locators WHERE domain=? AND image_selector=? AND input_selector=? AND status='pending'", (clean_domain, img, inp)).fetchone()
            if not exists:
                conn.execute("INSERT INTO locators (domain, image_selector, input_selector, created_at) VALUES (?, ?, ?, ?)", (clean_domain, img, inp, now))
                conn.commit()

    def get_pending_locators(self) -> list[dict[str, Any]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = (
                    session.query(LocatorRecord)
                    .filter(LocatorRecord.status == "pending")
                    .order_by(LocatorRecord.id.desc())
                    .all()
                )
                return [self._locator_to_dict(row) for row in rows]
            finally:
                session.close()
        with self.connect() as conn:
            return [dict(row) for row in conn.execute("SELECT * FROM locators WHERE status='pending' ORDER BY id DESC")]

    def get_approved_locators(self) -> dict[str, dict[str, str]]:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                rows = session.query(LocatorRecord).filter(LocatorRecord.status == "approved").all()
                return {row.domain: {"img": row.image_selector, "input": row.input_selector} for row in rows}
            finally:
                session.close()
        with self.connect() as conn:
            rows = conn.execute("SELECT domain, image_selector, input_selector FROM locators WHERE status='approved'")
            return {row["domain"]: {"img": row["image_selector"], "input": row["input_selector"]} for row in rows}

    def approve_locator(self, locator_id: int) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(LocatorRecord, locator_id)
                if row:
                    (
                        session.query(LocatorRecord)
                        .filter(LocatorRecord.domain == row.domain, LocatorRecord.status == "approved")
                        .update({LocatorRecord.status: "rejected"}, synchronize_session=False)
                    )
                    row.status = "approved"
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock, self.connect() as conn:
            # First get the domain of this locator
            row = conn.execute("SELECT domain FROM locators WHERE id=?", (locator_id,)).fetchone()
            if row:
                domain = row["domain"]
                # Reject any currently approved locators for this domain
                conn.execute("UPDATE locators SET status='rejected' WHERE domain=? AND status='approved'", (domain,))
                # Approve the new one
                conn.execute("UPDATE locators SET status='approved' WHERE id=?", (locator_id,))
                conn.commit()

    def reject_locator(self, locator_id: int) -> None:
        if self._use_sqlalchemy:
            session = get_session()
            try:
                row = session.get(LocatorRecord, locator_id)
                if row:
                    row.status = "rejected"
                session.commit()
                return
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock, self.connect() as conn:
            conn.execute("UPDATE locators SET status='rejected' WHERE id=?", (locator_id,))
            conn.commit()

    def bulk_import_approved_rules(self, rules: list[dict]) -> int:
        """Import rules (metadata only). Returns count of newly inserted rules."""
        now = datetime.now(UTC).isoformat()
        count = 0
        if self._use_sqlalchemy:
            session = get_session()
            try:
                for rule in rules:
                    rule_json = rule.get("rule_json")
                    approved_id = rule.get("approved_rule_id")
                    if not (rule_json and approved_id):
                        continue
                    idem = "imported_" + str(approved_id)
                    exists = (
                        session.query(AutofillRuleProposalRecord)
                        .filter(AutofillRuleProposalRecord.idempotency_key == idem)
                        .first()
                    )
                    if exists:
                        continue
                    session.add(AutofillRuleProposalRecord(
                        idempotency_key=idem,
                        device_id="imported",
                        api_key_id=0,
                        status="approved",
                        submitted_at=now,
                        rule_json=rule_json,
                        approved_rule_id=str(approved_id),
                        reviewed_at=now,
                        created_at=now,
                    ))
                    count += 1
                session.commit()
                return count
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                for rule in rules:
                    rule_json = rule.get("rule_json")
                    approved_id = rule.get("approved_rule_id")
                    if not (rule_json and approved_id):
                        continue
                    cur = conn.execute(
                        """
                        INSERT INTO autofill_rule_proposals 
                            (idempotency_key, device_id, api_key_id, status, submitted_at, rule_json, approved_rule_id, reviewed_at, created_at)
                        VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?)
                        """,
                        ("imported_" + approved_id, "imported", 0, now, rule_json, approved_id, now, now),
                    )
                    if cur.rowcount > 0:
                        count += 1
                conn.commit()
        return count

    def bulk_replace_approved_locators(self, locators: dict[str, dict[str, str]]) -> int:
        """Replace approved locators with the provided domain map."""
        now = datetime.now(UTC).isoformat()
        count = 0
        if self._use_sqlalchemy:
            session = get_session()
            try:
                session.query(LocatorRecord).delete()
                for domain, row in (locators or {}).items():
                    clean_domain = self._normalize_domain(domain)
                    img = str((row or {}).get("img") or "").strip()
                    inp = str((row or {}).get("input") or "").strip()
                    if clean_domain and img and inp:
                        session.add(LocatorRecord(
                            domain=clean_domain,
                            image_selector=img,
                            input_selector=inp,
                            status="approved",
                            created_at=now,
                        ))
                        count += 1
                session.commit()
                return count
            except Exception:
                session.rollback()
                raise
            finally:
                session.close()
        with self._lock:
            with self.connect() as conn:
                conn.execute("DELETE FROM locators")
                for domain, row in (locators or {}).items():
                    clean_domain = self._normalize_domain(domain)
                    img = str((row or {}).get("img") or "").strip()
                    inp = str((row or {}).get("input") or "").strip()
                    if clean_domain and img and inp:
                        conn.execute(
                            "INSERT INTO locators (domain, image_selector, input_selector, status, created_at) VALUES (?, ?, ?, 'approved', ?)",
                            (clean_domain, img, inp, now),
                        )
                        count += 1
                conn.commit()
        return count
