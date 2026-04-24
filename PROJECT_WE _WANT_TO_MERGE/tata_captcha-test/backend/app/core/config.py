"""Configuration loader for YAML + environment values."""

from __future__ import annotations

import os
from functools import lru_cache
from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field


_DEFAULT_CONFIG: dict[str, Any] = {
    "app_name": "ai-task-api",
    "server": {
        "host": "0.0.0.0",
        "port": 8080,
        "debug": False,
        "cors_origins": ["moz-extension://*", "chrome-extension://*"],
        "cors_origin_regex": "^(moz-extension|chrome-extension)://.*$",
    },
    "auth": {
        "key_prefix": "sk-",
        "key_length": 32,
        "default_expiry_days": 30,
        "hash_salt": "",
        "admin_token": "",
        "admin_username": "",
        "admin_password": "",
    },
    "rate_limit": {"requests_per_minute": 60, "burst": 10},
    "queue": {"workers": 2, "max_pending_jobs": 500, "cache_ttl_seconds": 300},
    "logging": {"level": "INFO", "debug": False, "json": True},
    "model": {
        "default": "onnx",
        "fallback": "onnx",
        "allow_future_model": False,
        "onnx_path": "backend/models/model.onnx",
        "onnx_vocab": "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
        "onnx_height": 54,
        "onnx_width": 250,
    },
    "storage": {"sqlite_path": "backend/logs/app.db"},
    "retrain": {"worker_enabled": False},
}


class ServerConfig(BaseModel):
    """HTTP server settings."""

    host: str
    port: int
    debug: bool = False
    cors_origins: list[str] = Field(default_factory=list)
    cors_origin_regex: str | None = None


class AuthConfig(BaseModel):
    """API key and expiration settings."""

    hash_salt: str
    admin_token: str
    admin_username: str = ""
    admin_password: str = ""
    key_prefix: str = "sk-"
    key_length: int = 32
    default_expiry_days: int = 30


class RateLimitConfig(BaseModel):
    """Rate limit controls."""

    requests_per_minute: int = 60
    burst: int = 10


class QueueConfig(BaseModel):
    """Queue and worker settings."""

    workers: int = 2
    max_pending_jobs: int = 500
    cache_ttl_seconds: int = 300


class LoggingConfig(BaseModel):
    """Structured logging settings."""

    level: str = "INFO"
    debug: bool = False
    json_logs: bool = Field(default=True, alias="json")


class ModelConfig(BaseModel):
    """Model selection settings."""

    default: str = "onnx"
    fallback: str = "onnx"
    allow_future_model: bool = False
    onnx_path: str = ""
    onnx_vocab: str = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    onnx_height: int = 54
    onnx_width: int = 250


class StorageConfig(BaseModel):
    """Data storage settings."""

    sqlite_path: str


class RetrainConfig(BaseModel):
    """Local retrain worker controls."""

    worker_enabled: bool = False


class Settings(BaseModel):
    """Full settings object."""

    app_name: str = "ai-task-api"
    server: ServerConfig
    auth: AuthConfig
    rate_limit: RateLimitConfig
    queue: QueueConfig
    logging: LoggingConfig
    model: ModelConfig
    storage: StorageConfig
    retrain: RetrainConfig = Field(default_factory=RetrainConfig)


def _read_yaml_config(config_path: Path) -> dict[str, Any]:
    """Load YAML file into a plain dictionary."""
    if not config_path.exists():
        try:
            config_path.parent.mkdir(parents=True, exist_ok=True)
            config_path.write_text(yaml.safe_dump(_DEFAULT_CONFIG, sort_keys=False), encoding="utf-8")
        except Exception:
            # If path is not writable, continue with in-memory defaults.
            pass
        return deepcopy(_DEFAULT_CONFIG)
    with config_path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file) or {}


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def _get_project_root() -> Path:
    """Get project root: e:/codex/extension (3 levels up from config.py)."""
    return Path(__file__).resolve().parents[3]


def _resolve_path(raw_path: str) -> Path:
    """Resolve path relative to project root (not CWD)."""
    return (_get_project_root() / raw_path).resolve()


@lru_cache
def get_settings() -> Settings:
    """Load and cache runtime settings from config + env."""

    project_root = _get_project_root()
    load_dotenv(project_root / ".env")
    raw_config = os.getenv("CONFIG_PATH", "backend/config/config.yaml")
    config_path = (project_root / raw_config).resolve()
    config_dict = _deep_merge(_DEFAULT_CONFIG, _read_yaml_config(config_path))
    config_dict.setdefault("auth", {})
    config_dict.setdefault("storage", {})
    config_dict.setdefault("retrain", {})
    config_dict.setdefault("server", {})
    config_dict.setdefault("logging", {})

    config_dict["auth"]["hash_salt"] = os.getenv(
        "AUTH_HASH_SALT", config_dict["auth"].get("hash_salt", "")
    )
    config_dict["auth"]["admin_token"] = os.getenv(
        "ADMIN_TOKEN", config_dict["auth"].get("admin_token", "")
    )
    config_dict["auth"]["admin_username"] = os.getenv(
        "ADMIN_USERNAME", config_dict["auth"].get("admin_username", "")
    )
    config_dict["auth"]["admin_password"] = os.getenv(
        "ADMIN_PASSWORD", config_dict["auth"].get("admin_password", "")
    )
    sqlite_raw = os.getenv("SQLITE_PATH", config_dict["storage"].get("sqlite_path", ""))
    config_dict["storage"]["sqlite_path"] = str(_resolve_path(sqlite_raw))
    model_onnx_raw = os.getenv("ONNX_PATH", config_dict.get("model", {}).get("onnx_path", ""))
    if model_onnx_raw:
        config_dict.setdefault("model", {})
        config_dict["model"]["onnx_path"] = str(_resolve_path(model_onnx_raw))
    config_dict.setdefault("model", {})
    if str(config_dict["model"].get("default", "")).strip().lower() == "mock":
        config_dict["model"]["default"] = "onnx"
    if str(config_dict["model"].get("fallback", "")).strip().lower() == "mock":
        config_dict["model"]["fallback"] = "onnx"
    config_dict["server"]["debug"] = os.getenv(
        "DEBUG", str(config_dict["server"].get("debug", False))
    ).lower() in {"1", "true", "yes"}
    config_dict["retrain"]["worker_enabled"] = os.getenv(
        "RETRAIN_WORKER_ENABLED",
        str(config_dict["retrain"].get("worker_enabled", False)),
    ).lower() in {"1", "true", "yes"}
    config_dict["logging"]["debug"] = config_dict["server"]["debug"]
    if config_dict["server"]["debug"]:
        config_dict["logging"]["level"] = "DEBUG"
    return Settings(**config_dict)
