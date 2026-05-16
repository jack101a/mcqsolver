"""Subscription management service — plans, user subscriptions, lifecycle."""

from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.models import SubscriptionPlan, UserSubscription, User


PLAN_DEFAULTS = [
    {
        "code": "basic",
        "name": "Basic",
        "description": "Autofill and captcha.",
        "monthly_limit": 1000,
        "duration_days": 30,
        "price_amount": 10000,
        "services": {"autofill": True, "captcha": True, "stall": False, "solver": False, "custom": False},
    },
    {
        "code": "standard",
        "name": "Standard",
        "description": "Autofill, captcha, stall scripts, and userscripts.",
        "monthly_limit": 5000,
        "duration_days": 30,
        "price_amount": 35000,
        "services": {"autofill": True, "captcha": True, "stall": True, "solver": False, "custom": True},
    },
    {
        "code": "premium",
        "name": "Premium",
        "description": "All services including MCQ solvers.",
        "monthly_limit": 15000,
        "duration_days": 30,
        "price_amount": 50000,
        "services": {"autofill": True, "captcha": True, "stall": True, "solver": True, "custom": True},
    },
]


def _json(data: dict) -> str:
    return json.dumps(data, separators=(",", ":"), sort_keys=True)


def _services_from_plan(plan: SubscriptionPlan) -> dict[str, bool]:
    try:
        raw = json.loads(plan.services_json or "{}")
        if not isinstance(raw, dict):
            raw = {}
    except Exception:
        raw = {}
    return {
        "autofill": bool(raw.get("autofill", True)),
        "captcha": bool(raw.get("captcha", True)),
        "stall": bool(raw.get("stall", False)),
        "solver": bool(raw.get("solver", False)),
        "custom": bool(raw.get("custom", False)),
    }


class SubscriptionService:
    """Manages subscription plans and user subscription lifecycle."""

    def __init__(self, session_factory):
        self._session_factory = session_factory

    def _session(self) -> Session:
        return self._session_factory()

    def ensure_schema(self) -> None:
        """Idempotently add plan entitlement columns for existing deployments."""
        session = self._session()
        try:
            dialect = session.bind.dialect.name if session.bind is not None else "sqlite"
            plan_columns = {row[1] for row in session.execute(text("PRAGMA table_info(subscription_plans)"))} if dialect == "sqlite" else {
                row[0] for row in session.execute(text(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='subscription_plans'"
                ))
            }
            sub_columns = {row[1] for row in session.execute(text("PRAGMA table_info(user_subscriptions)"))} if dialect == "sqlite" else {
                row[0] for row in session.execute(text(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='user_subscriptions'"
                ))
            }
            text_type = "TEXT"
            if "services_json" not in plan_columns:
                session.execute(text(f"ALTER TABLE subscription_plans ADD COLUMN services_json {text_type} NOT NULL DEFAULT '{{}}'"))
            if "service_limits_json" not in plan_columns:
                session.execute(text(f"ALTER TABLE subscription_plans ADD COLUMN service_limits_json {text_type} NOT NULL DEFAULT '{{}}'"))
            if "services_snapshot_json" not in sub_columns:
                session.execute(text(f"ALTER TABLE user_subscriptions ADD COLUMN services_snapshot_json {text_type} NOT NULL DEFAULT '{{}}'"))
            if "service_limits_snapshot_json" not in sub_columns:
                session.execute(text(f"ALTER TABLE user_subscriptions ADD COLUMN service_limits_snapshot_json {text_type} NOT NULL DEFAULT '{{}}'"))
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def seed_default_plans(self) -> None:
        self.ensure_schema()
        session = self._session()
        try:
            for item in PLAN_DEFAULTS:
                plan = session.query(SubscriptionPlan).filter(SubscriptionPlan.code == item["code"]).first()
                limits = {svc: item["monthly_limit"] for svc, enabled in item["services"].items() if enabled}
                values = {
                    "name": item["name"],
                    "description": item["description"],
                    "monthly_limit": item["monthly_limit"],
                    "duration_days": item["duration_days"],
                    "price_amount": item["price_amount"],
                    "currency": "INR",
                    "services_json": _json(item["services"]),
                    "service_limits_json": _json(limits),
                    "is_active": True,
                    "updated_at": datetime.now(timezone.utc),
                }
                if plan:
                    for key, value in values.items():
                        setattr(plan, key, value)
                else:
                    session.add(SubscriptionPlan(code=item["code"], **values))
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    # ── Plans ──────────────────────────────────────────────────────────────

    def create_plan(
        self,
        code: str,
        name: str,
        monthly_limit: int = 3000,
        duration_days: int = 30,
        price_amount: int = 0,
        currency: str = "INR",
        description: str = "",
        services: dict[str, bool] | None = None,
        service_limits: dict[str, int] | None = None,
    ) -> SubscriptionPlan:
        session = self._session()
        try:
            plan = SubscriptionPlan(
                code=code,
                name=name,
                description=description,
                monthly_limit=monthly_limit,
                duration_days=duration_days,
                price_amount=price_amount,
                currency=currency,
                services_json=_json(services or {"autofill": True, "captcha": True}),
                service_limits_json=_json(service_limits or {}),
            )
            session.add(plan)
            session.commit()
            session.refresh(plan)
            return plan
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_plan(self, plan_id: int) -> SubscriptionPlan | None:
        session = self._session()
        try:
            return session.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        finally:
            session.close()

    def get_plan_by_code(self, code: str) -> SubscriptionPlan | None:
        session = self._session()
        try:
            return session.query(SubscriptionPlan).filter(SubscriptionPlan.code == code).first()
        finally:
            session.close()

    def list_plans(self, active_only: bool = True) -> list[SubscriptionPlan]:
        session = self._session()
        try:
            q = session.query(SubscriptionPlan)
            if active_only:
                q = q.filter(SubscriptionPlan.is_active == True)
            return q.order_by(SubscriptionPlan.price_amount).all()
        finally:
            session.close()

    def update_plan(self, plan_id: int, **kwargs) -> SubscriptionPlan | None:
        session = self._session()
        try:
            plan = session.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
            if not plan:
                return None
            for key, value in kwargs.items():
                if key == "services" and isinstance(value, dict):
                    key, value = "services_json", _json(value)
                elif key == "service_limits" and isinstance(value, dict):
                    key, value = "service_limits_json", _json(value)
                if hasattr(plan, key):
                    setattr(plan, key, value)
            plan.updated_at = datetime.now(timezone.utc)
            session.commit()
            session.refresh(plan)
            return plan
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    # ── User Subscriptions ─────────────────────────────────────────────────

    def create_subscription(
        self,
        user_id: int,
        plan_id: int,
        approved_by_admin_id: int | None = None,
    ) -> UserSubscription:
        session = self._session()
        try:
            plan = session.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
            if not plan:
                raise ValueError(f"Plan {plan_id} not found")

            now = datetime.now(timezone.utc)
            sub = UserSubscription(
                user_id=user_id,
                plan_id=plan_id,
                status="active",
                monthly_limit_snapshot=plan.monthly_limit,
                services_snapshot_json=plan.services_json or "{}",
                service_limits_snapshot_json=plan.service_limits_json or "{}",
                start_at=now,
                end_at=now + timedelta(days=plan.duration_days),
                billing_anchor_day=now.day,
                current_cycle_start_at=now,
                current_cycle_end_at=now + timedelta(days=30),
                approved_by_admin_id=approved_by_admin_id,
                approved_at=now,
            )
            session.add(sub)

            # Activate the user (unless blocked)
            user = session.query(User).filter(User.id == user_id).first()
            if user:
                if user.status != "blocked":
                    user.status = "active"
                user.updated_at = now

            session.commit()
            session.refresh(sub)
            return sub
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def get_active_subscription(self, user_id: int) -> UserSubscription | None:
        session = self._session()
        try:
            return (
                session.query(UserSubscription)
                .filter(
                    UserSubscription.user_id == user_id,
                    UserSubscription.status == "active",
                )
                .order_by(UserSubscription.created_at.desc())
                .first()
            )
        finally:
            session.close()

    def get_user_subscriptions(self, user_id: int) -> list[UserSubscription]:
        session = self._session()
        try:
            return (
                session.query(UserSubscription)
                .filter(UserSubscription.user_id == user_id)
                .order_by(UserSubscription.created_at.desc())
                .all()
            )
        finally:
            session.close()

    def cancel_subscription(self, subscription_id: int) -> UserSubscription | None:
        session = self._session()
        try:
            sub = session.query(UserSubscription).filter(UserSubscription.id == subscription_id).first()
            if not sub:
                return None
            sub.status = "cancelled"
            sub.updated_at = datetime.now(timezone.utc)
            session.commit()
            session.refresh(sub)
            return sub
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def expire_subscription(self, subscription_id: int) -> UserSubscription | None:
        session = self._session()
        try:
            sub = session.query(UserSubscription).filter(UserSubscription.id == subscription_id).first()
            if not sub:
                return None
            sub.status = "expired"
            sub.updated_at = datetime.now(timezone.utc)

            # Also expire the user
            user = session.query(User).filter(User.id == sub.user_id).first()
            if user:
                user.status = "expired"
                user.updated_at = datetime.now(timezone.utc)

            session.commit()
            session.refresh(sub)
            return sub
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()
