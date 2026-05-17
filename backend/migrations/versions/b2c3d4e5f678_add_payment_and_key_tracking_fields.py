"""add_payment_and_key_tracking_fields

Revision ID: b2c3d4e5f678
Revises: 94bfa105be00
Create Date: 2026-05-09 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b2c3d4e5f678"
down_revision: Union[str, Sequence[str], None] = "94bfa105be00"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if table_name not in table_names:
        return

    existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
    if column.name not in existing_columns:
        op.add_column(table_name, column)


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    table_names = set(inspector.get_table_names())
    if table_name not in table_names:
        return

    existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
    if column_name in existing_columns:
        op.drop_column(table_name, column_name)


def upgrade() -> None:
    _add_column_if_missing("payment_records", sa.Column("plan_id", sa.Integer(), nullable=True))
    _add_column_if_missing("payment_records", sa.Column("telegram_user_id", sa.String(64), nullable=True))
    _add_column_if_missing("payment_records", sa.Column("payment_ref", sa.String(255), nullable=True))
    _add_column_if_missing("payment_records", sa.Column("upi_id_used", sa.String(255), nullable=True))
    _add_column_if_missing("payment_records", sa.Column("payee_name_used", sa.String(255), nullable=True))
    _add_column_if_missing("payment_records", sa.Column("ocr_extracted_amount", sa.String(64), nullable=True))
    _add_column_if_missing("payment_records", sa.Column("ocr_extracted_date", sa.String(64), nullable=True))
    _add_column_if_missing("payment_records", sa.Column("ocr_extracted_payer", sa.String(255), nullable=True))
    _add_column_if_missing("payment_records", sa.Column("expires_at", sa.DateTime(), nullable=True))

    _add_column_if_missing("user_api_keys", sa.Column("last_used_at", sa.DateTime(), nullable=True))
    _add_column_if_missing(
        "user_api_keys",
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    _drop_column_if_exists("payment_records", "plan_id")
    _drop_column_if_exists("payment_records", "telegram_user_id")
    _drop_column_if_exists("payment_records", "payment_ref")
    _drop_column_if_exists("payment_records", "upi_id_used")
    _drop_column_if_exists("payment_records", "payee_name_used")
    _drop_column_if_exists("payment_records", "ocr_extracted_amount")
    _drop_column_if_exists("payment_records", "ocr_extracted_date")
    _drop_column_if_exists("payment_records", "ocr_extracted_payer")
    _drop_column_if_exists("payment_records", "expires_at")

    _drop_column_if_exists("user_api_keys", "last_used_at")
    _drop_column_if_exists("user_api_keys", "usage_count")
