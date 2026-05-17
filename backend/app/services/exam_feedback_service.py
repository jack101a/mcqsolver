"""Exam feedback learning and offline dataset persistence."""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.core.paths import get_project_root
from app.services.exam_service import ExamService, _b64_to_pil, _djb2_hash, _phash

if TYPE_CHECKING:
    from app.core.container import Container

logger = logging.getLogger(__name__)

_PROJECT_ROOT = get_project_root()


def _write_json_atomic(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f"{path.name}.tmp")
    with tmp_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp_path.replace(path)


def _save_exam_offline_dataset(
    *,
    question_image: Any,
    option_images: list[Any | None],
    question_hash: str,
    question_phash: str,
    question_text: str,
    option_texts: list[str],
    option_hashes: list[str],
    option_phashes: list[str],
    correct_option: int,
    correct_option_hash: str,
    correct_option_phash: str,
    correct_option_text: str,
    domain: str | None,
    method: str | None,
    question_num: int | None,
    learn_result: dict[str, Any],
) -> Path:
    dataset_root = (_PROJECT_ROOT / "data" / "exam_offline").resolve()
    folder_name = re.sub(r"[^A-Za-z0-9._-]+", "_", question_hash).strip("_") or uuid.uuid4().hex
    question_dir = dataset_root / "questions" / folder_name
    question_dir.mkdir(parents=True, exist_ok=True)

    now_iso = datetime.now(UTC).isoformat()
    question_rel = f"questions/{folder_name}/question.png"
    question_image.save(dataset_root / question_rel, format="PNG")

    options: list[dict[str, Any]] = []
    for idx, opt_img in enumerate(option_images, start=1):
        rel_path = ""
        if opt_img is not None:
            rel_path = f"questions/{folder_name}/option_{idx}.png"
            opt_img.save(dataset_root / rel_path, format="PNG")
        options.append({
            "option": idx,
            "image": rel_path,
            "text": option_texts[idx - 1] if idx - 1 < len(option_texts) else "",
            "hash": option_hashes[idx - 1] if idx - 1 < len(option_hashes) else "",
            "phash": option_phashes[idx - 1] if idx - 1 < len(option_phashes) else "",
            "is_correct": idx == correct_option,
        })

    metadata = {
        "schema_version": 1,
        "saved_at": now_iso,
        "question_hash": question_hash,
        "question_phash": question_phash,
        "question_num": question_num,
        "domain": domain,
        "source": "exam_feedback",
        "method": method,
        "question_image": question_rel,
        "question_text": question_text,
        "options": options,
        "answer": {
            "correct_option": correct_option,
            "correct_option_hash": correct_option_hash,
            "correct_option_phash": correct_option_phash,
            "correct_option_text": correct_option_text,
        },
        "learning": {
            "action": learn_result.get("action"),
            "confidence": learn_result.get("confidence"),
            "seen_count": learn_result.get("seen_count"),
            "verified_count": learn_result.get("verified_count"),
            "status": learn_result.get("status"),
        },
    }
    _write_json_atomic(question_dir / "metadata.json", metadata)

    index_path = dataset_root / "index.json"
    try:
        with index_path.open("r", encoding="utf-8") as f:
            index = json.load(f)
    except Exception:
        index = {"schema_version": 1, "created_at": now_iso, "questions": {}}
    if not isinstance(index, dict):
        index = {"schema_version": 1, "created_at": now_iso, "questions": {}}
    questions = index.setdefault("questions", {})
    if not isinstance(questions, dict):
        questions = {}
        index["questions"] = questions

    previous = questions.get(question_hash) if isinstance(questions.get(question_hash), dict) else {}
    questions[question_hash] = {
        **previous,
        "question_hash": question_hash,
        "question_phash": question_phash,
        "folder": f"questions/{folder_name}",
        "metadata": f"questions/{folder_name}/metadata.json",
        "question_image": question_rel,
        "option_images": [opt["image"] for opt in options],
        "correct_option": correct_option,
        "correct_option_hash": correct_option_hash,
        "correct_option_phash": correct_option_phash,
        "domain": domain,
        "question_num": question_num,
        "confidence": learn_result.get("confidence"),
        "seen_count": learn_result.get("seen_count"),
        "verified_count": learn_result.get("verified_count"),
        "status": learn_result.get("status"),
        "last_saved_at": now_iso,
        "created_at": previous.get("created_at", now_iso),
    }
    index["updated_at"] = now_iso
    _write_json_atomic(index_path, index)
    return question_dir


def _save_exam_offline_dataset_safe(**kwargs: Any) -> None:
    try:
        saved_dir = _save_exam_offline_dataset(**kwargs)
        logger.info("exam_feedback_offline_saved", extra={
            "context": {
                "hash": str(kwargs.get("question_hash", ""))[:12],
                "path": str(saved_dir),
            }
        })
    except Exception as e:
        logger.warning("exam_feedback_offline_save_failed", extra={"context": {"error": str(e)}})


def _export_learned_to_json_safe(container: Container) -> None:
    try:
        container.exam_service.export_learned_to_json()
    except Exception as e:
        logger.warning("exam_feedback_export_failed", extra={"context": {"error": str(e)}})


def process_exam_feedback(container: Container, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Record exam feedback and learn from correct answers.

    The function is intentionally framework-free so FastAPI and Celery can share
    exactly the same learning behavior.
    """
    db = container.db
    option_images_b64 = list(payload.get("option_images_b64") or [])
    selected_option = int(payload.get("selected_option") or 0)
    was_correct = bool(payload.get("was_correct"))

    learning_enabled = db.get_setting("exam.learning_enabled", "true").lower() in ("true", "1", "yes", "on")
    if not learning_enabled:
        return {"recorded": False, "learned": False, "message": "Learning is disabled"}

    try:
        q_img = _b64_to_pil(str(payload.get("question_image_b64") or ""))
        question_hash = _djb2_hash(q_img)
        question_phash = _phash(q_img)
    except Exception as e:
        logger.warning("exam_feedback_hash_failed", extra={"context": {"error": str(e)}})
        return {"recorded": False, "learned": False, "message": f"Hash failed: {e}"}

    db.insert_exam_attempt(
        question_hash=question_hash,
        selected_option=selected_option,
        was_correct=was_correct,
        method=payload.get("method"),
        processing_ms=int(payload.get("processing_ms") or 0),
        domain=payload.get("domain"),
        question_num=payload.get("question_num"),
    )

    if not was_correct:
        penalty = None
        try:
            penalty = db.exam_learned.record_wrong(question_hash, selected_option=selected_option)
        except Exception as e:
            logger.warning("exam_feedback_wrong_penalty_failed", extra={"context": {"error": str(e)}})
        msg = "Wrong answer - not learning"
        if penalty and penalty.get("action") == "penalized":
            msg = f"Wrong answer - learned row penalized (confidence: {penalty['confidence']:.1f})"
        return {"recorded": True, "learned": False, "message": msg}

    opt_images: list[Any | None] = []
    try:
        opt_texts: list[str] = []
        opt_hashes: list[str] = []
        opt_phashes: list[str] = []
        for opt_b64 in option_images_b64:
            try:
                opt_img = _b64_to_pil(opt_b64)
                opt_images.append(opt_img)
                opt_hashes.append(_djb2_hash(opt_img))
                opt_phashes.append(_phash(opt_img))
                opt_texts.append(ExamService._ocr_text_static(opt_img))
            except Exception:
                opt_images.append(None)
                opt_hashes.append("")
                opt_phashes.append("")
                opt_texts.append("")
        question_text = ExamService._ocr_text_static(q_img)
    except Exception as e:
        logger.warning("exam_feedback_ocr_failed", extra={"context": {"error": str(e)}})
        question_text = ""
        opt_texts = ["", "", "", ""]
        opt_hashes = ["", "", "", ""]
        opt_phashes = ["", "", "", ""]
        if not opt_images:
            opt_images = [None] * len(option_images_b64)

    correct_index = selected_option - 1
    correct_option_text = opt_texts[correct_index] if 0 <= correct_index < len(opt_texts) else ""
    correct_option_hash = opt_hashes[correct_index] if 0 <= correct_index < len(opt_hashes) else ""
    correct_option_phash = opt_phashes[correct_index] if 0 <= correct_index < len(opt_phashes) else ""

    result = db.upsert_exam_learned(
        question_hash=question_hash,
        question_phash=question_phash,
        question_text=question_text,
        option_1=opt_texts[0] if len(opt_texts) > 0 else "",
        option_2=opt_texts[1] if len(opt_texts) > 1 else "",
        option_3=opt_texts[2] if len(opt_texts) > 2 else "",
        option_4=opt_texts[3] if len(opt_texts) > 3 else "",
        correct_option=selected_option,
        correct_option_hash=correct_option_hash,
        correct_option_phash=correct_option_phash,
        correct_option_text=correct_option_text,
        source="exam_feedback",
        learning_mode="hash_based",
        ocr_quality="unverified_preview",
        ocr_preview_unreliable=True,
    )

    logger.info("exam_feedback_learned", extra={
        "context": {
            "hash": question_hash[:12],
            "phash": question_phash[:12],
            "action": result["action"],
            "confidence": result["confidence"],
            "option": selected_option,
        }
    })

    _save_exam_offline_dataset_safe(
        question_image=q_img,
        option_images=opt_images,
        question_hash=question_hash,
        question_phash=question_phash,
        question_text=question_text,
        option_texts=opt_texts,
        option_hashes=opt_hashes,
        option_phashes=opt_phashes,
        correct_option=selected_option,
        correct_option_hash=correct_option_hash,
        correct_option_phash=correct_option_phash,
        correct_option_text=correct_option_text,
        domain=payload.get("domain"),
        method=payload.get("method"),
        question_num=payload.get("question_num"),
        learn_result=result,
    )
    _export_learned_to_json_safe(container)

    return {
        "recorded": True,
        "learned": True,
        "message": f"{result['action']} (confidence: {result['confidence']:.1f})",
    }
