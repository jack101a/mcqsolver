"""Exam solver service — Hash → OCR → LLM pipeline (server-side).

All heavy processing is server-side. The extension only sends base64 images.
Runtime config (LiteLLM endpoint/key/model, OCR lang) is read from the
platform_settings DB table — configurable from the admin dashboard.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import time
from io import BytesIO
from pathlib import Path
from typing import Any, TYPE_CHECKING

import httpx
from PIL import Image

if TYPE_CHECKING:
    from app.core.database import Database

logger = logging.getLogger(__name__)

# Try importing pytesseract; gracefully degrade if Tesseract not installed
try:
    import pytesseract
    
    # Common Windows installation paths for Tesseract
    _TESS_PATHS = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Tesseract-OCR", "tesseract.exe"),
    ]
    
    for path in _TESS_PATHS:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            break
            
    _TESSERACT_AVAILABLE = True
except ImportError:
    _TESSERACT_AVAILABLE = False
    logger.warning("pytesseract not installed — OCR layer disabled")


def _resolve_project_root() -> Path:
    """Resolve project root (where .env and backend/ reside)."""
    return Path(__file__).resolve().parents[3]


def _phash(img: Image.Image, size: int = 32) -> str:
    """Perceptual hash: resize → grayscale → flatten → above-mean bits."""
    gray = img.convert("L").resize((size, size), Image.LANCZOS)
    pixels = list(gray.getdata())
    avg = sum(pixels) / len(pixels)
    bits = "".join("1" if p >= avg else "0" for p in pixels)
    n = int(bits, 2)
    return hex(n)[2:].zfill(size * size // 4)


def _b64_to_pil(b64: str) -> Image.Image:
    """Decode base64 data-URI or raw base64 to PIL Image."""
    raw = b64
    if "," in raw and raw.startswith("data:"):
        raw = raw.split(",", 1)[1]
    binary = base64.b64decode(raw)
    return Image.open(BytesIO(binary)).convert("RGB")


def _hamming(a: str, b: str) -> int:
    """Hamming distance between two same-length hex hash strings."""
    if len(a) != len(b):
        return 9999
    na, nb = int(a, 16), int(b, 16)
    diff = na ^ nb
    return bin(diff).count("1")



class ExamService:
    """
    Three-layer exam question solver:
      1. Perceptual hash match against known sign database
      2. Tesseract OCR → text match against question bank
      3. LiteLLM multimodal fallback

    Runtime config (endpoint, key, model, OCR lang) is read from the
    platform_settings DB table on every solve call — no restart needed.
    """

    HASH_THRESHOLD = 15  # bits — below this is a confident sign match

    def __init__(self, db: "Database", data_dir: Path) -> None:
        self._db       = db
        self._data_dir = data_dir
        self._http     = httpx.AsyncClient(timeout=30.0)

        # Load static data files (these don't change at runtime)
        q_path = data_dir / "questions.json"
        self._questions: list[dict] = []
        if q_path.exists():
            with q_path.open(encoding="utf-8") as f:
                self._questions = json.load(f)
            logger.info("exam_db_loaded", extra={"context": {"count": len(self._questions)}})

        sh_path = data_dir / "sign_hashes.json"
        self._sign_hashes: dict[str, str] = {}  # hash_hex → label
        if sh_path.exists():
            with sh_path.open(encoding="utf-8") as f:
                raw = json.load(f)
            if raw:
                # Heuristic: if values look like hashes (long hex strings), invert
                sample = next(iter(raw.values()))
                self._sign_hashes = {v: k for k, v in raw.items()} if len(sample) > 20 else raw
            logger.info("sign_hashes_loaded", extra={"context": {"count": len(self._sign_hashes)}})

        sl_path = data_dir / "sign_label.json"
        self._sign_labels: dict[str, str] = {}
        if sl_path.exists():
            with sl_path.open(encoding="utf-8") as f:
                self._sign_labels = json.load(f)

    async def close(self) -> None:
        await self._http.aclose()

    # ── Runtime settings (from admin dashboard DB) ────────────────────────────

    def _litellm_endpoint(self) -> str:
        return self._db.get_setting("exam.litellm_endpoint", "")

    def _litellm_api_key(self) -> str:
        return self._db.get_setting("exam.litellm_api_key", "")

    def _litellm_model(self) -> str:
        return self._db.get_setting("exam.litellm_model", "gemma-4-31b-it_gemini")

    def _ocr_lang(self) -> str:
        return self._db.get_setting("exam.ocr_lang", "eng+hin")

    def _tessdata_dir(self) -> str | None:
        """Return absolute path to tessdata dir if it exists, else None."""
        raw = self._db.get_setting("exam.tessdata_path", "backend/tessdata")
        if not raw:
            return None
        p = (_resolve_project_root() / raw).resolve()
        return str(p) if p.exists() else None

    # ── Layer 1: Perceptual Hash ──────────────────────────────────────────────

    def _match_sign_hash(self, img: Image.Image) -> str | None:
        img_hash = _phash(img)
        best_dist = self.HASH_THRESHOLD + 1
        best_label: str | None = None
        for stored_hash, label in self._sign_hashes.items():
            try:
                d = _hamming(img_hash, stored_hash)
                if d < best_dist:
                    best_dist = d
                    best_label = label
            except Exception:
                continue
        return best_label if best_dist <= self.HASH_THRESHOLD else None

    # ── Layer 2: OCR → DB Lookup ──────────────────────────────────────────────

    def _ocr_text(self, img: Image.Image) -> str:
        if not _TESSERACT_AVAILABLE:
            return ""
        try:
            lang      = self._ocr_lang()
            tess_dir  = self._tessdata_dir()
            orig_env  = os.environ.copy()
            if tess_dir:
                os.environ["TESSDATA_PREFIX"] = tess_dir
            try:
                text = pytesseract.image_to_string(img, lang=lang, config="--psm 6")
                return text.strip()
            finally:
                os.environ.clear()
                os.environ.update(orig_env)
        except Exception as e:
            logger.warning("ocr_failed", extra={"context": {"error": str(e)}})
            return ""

    # ─────────────────────────────────────────────────────────────────────
    # DB lookup helpers (mirrors the reference extension search logic)
    # ─────────────────────────────────────────────────────────────────────

    @staticmethod
    def _clean_text(text: str) -> str:
        """Normalise text for fuzzy matching — strip whitespace + punctuation."""
        import re
        t = str(text or "")
        t = re.sub(r'[\s\u200b-\u200d\ufeff\u00a0]+', '', t)
        t = re.sub(r'[\u0964\u0965।॥,.?!:;\'"()\[\]{}<>/\\|@#$%^&*~`\-_=+]', '', t)
        return t.lower()

    @staticmethod
    def _normalize_hindi(text: str) -> str:
        """Extra Hindi normalisation — drop anusvara/visarga and digits."""
        import re
        t = ExamService._clean_text(text)
        t = re.sub(r'[\u0901\u0902\u0903\u093d]', '', t)
        t = re.sub(r'\d+', '', t)
        return t

    def _search_by_question(self, ocr_text: str) -> dict | None:
        """Substring containment search on question_text field."""
        cleaned = self._clean_text(ocr_text)
        if len(cleaned) < 8:
            return None
        best: dict | None = None
        best_score = 0
        for entry in self._questions:
            db_q = self._clean_text(entry.get("question_text", ""))
            if not db_q:
                continue
            shorter = cleaned if len(cleaned) < len(db_q) else db_q
            longer  = db_q   if len(cleaned) < len(db_q) else cleaned
            if shorter in longer and len(shorter) > best_score:
                best_score = len(shorter)
                best = entry
        return best

    def _search_by_sign(self, sign_label: str) -> dict | None:
        """Exact then prefix match on question_sign_label field."""
        for entry in self._questions:
            if entry.get("question_sign_label") == sign_label:
                return entry
        for entry in self._questions:
            db_label = entry.get("question_sign_label", "")
            if db_label and (db_label.startswith(sign_label) or sign_label.startswith(db_label)):
                return entry
        return None

    def _search_by_options(self, ocr_option_texts: list[str]) -> dict | None:
        """Reverse-lookup: match DB entry whose option texts best overlap OCR'd options."""
        MIN_LEN = 4
        NEED    = 2
        cleaned_ocr = [self._clean_text(o) for o in ocr_option_texts]
        best: dict | None = None
        best_count = 0
        for entry in self._questions:
            db_opts = [
                self._clean_text(entry.get(f"option_{i}", "")) for i in range(1, 5)
            ]
            matched = 0
            for ocr_opt in cleaned_ocr:
                if len(ocr_opt) < MIN_LEN:
                    continue
                for db_opt in db_opts:
                    if len(db_opt) < MIN_LEN:
                        continue
                    s = ocr_opt if len(ocr_opt) < len(db_opt) else db_opt
                    l = db_opt  if len(ocr_opt) < len(db_opt) else ocr_opt
                    if s in l:
                        matched += 1
                        break
            if matched >= NEED and matched > best_count:
                best_count = matched
                best = entry
        return best

    def _fuzzy_search(self, ocr_text: str, ocr_options: list[str]) -> dict | None:
        """Hindi-normalised fuzzy search on question text then options."""
        MIN_LEN = 8
        NEED    = 2
        norm_q = self._normalize_hindi(ocr_text)
        if len(norm_q) >= MIN_LEN:
            for entry in self._questions:
                norm_db = self._normalize_hindi(entry.get("question_text", ""))
                if not norm_db:
                    continue
                s = norm_q  if len(norm_q)  < len(norm_db) else norm_db
                l = norm_db if len(norm_q)  < len(norm_db) else norm_q
                if len(s) >= MIN_LEN and s in l:
                    return entry
        # Fallback: normalised option matching
        norm_opts = [self._normalize_hindi(o) for o in ocr_options]
        for entry in self._questions:
            db_opts = [self._normalize_hindi(entry.get(f"option_{i}", "")) for i in range(1, 5)]
            m = 0
            for no in norm_opts:
                if len(no) < 4:
                    continue
                for d in db_opts:
                    if len(d) < 4:
                        continue
                    s = no if len(no) < len(d) else d
                    l = d  if len(no) < len(d) else no
                    if s in l:
                        m += 1
                        break
            if m >= NEED:
                return entry
        return None

    def _db_lookup(self, question_text: str, option_texts: list[str] | None = None) -> dict | None:
        """Combined DB lookup: question-text → option-reverse → Hindi-fuzzy."""
        match = self._search_by_question(question_text)
        if match:
            return match
        if option_texts:
            match = self._search_by_options(option_texts)
            if match:
                return match
            match = self._fuzzy_search(question_text, option_texts)
        return match

    def _sign_to_option(self, sign_label: str, option_images: list[str]) -> int | None:
        description = self._sign_labels.get(sign_label, "").lower()
        if not description:
            return None
        for i, opt_b64 in enumerate(option_images, start=1):
            try:
                img = _b64_to_pil(opt_b64)
                text = self._ocr_text(img).lower()
                if not text:
                    continue
                words = set(description.split())
                opt_words = set(text.split())
                if len(words & opt_words) >= 2:
                    return i
            except Exception:
                continue
        return None

    # ── Layer 3: LLM Fallback ─────────────────────────────────────────────────

    async def _llm_solve(self, question_b64: str, option_b64s: list[str]) -> int | None:
        endpoint = self._litellm_endpoint().rstrip("/")
        if not endpoint:
            return None
        # Auto-append /chat/completions if the endpoint is just a base URL
        if not endpoint.endswith("/chat/completions"):
            endpoint = endpoint + "/chat/completions"
        try:
            content = [
                {"type": "text", "text": (
                    "You are an expert road safety exam assistant. "
                    "Look at the question image and 4 option images below. "
                    "Reply with ONLY the correct option number (1, 2, 3, or 4). No other text."
                )},
                {"type": "image_url", "image_url": {"url": question_b64}},
            ]
            for idx, opt in enumerate(option_b64s, start=1):
                content.append({"type": "text", "text": f"Option {idx}:"})
                content.append({"type": "image_url", "image_url": {"url": opt}})

            resp = await self._http.post(
                endpoint,
                headers={
                    "Authorization": f"Bearer {self._litellm_api_key()}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._litellm_model(),
                    "messages": [{"role": "user", "content": content}],
                    "max_tokens": 5,
                },
            )
            resp.raise_for_status()
            answer = resp.json()["choices"][0]["message"]["content"].strip()
            digit = next((c for c in answer if c in "1234"), None)
            return int(digit) if digit else None
        except Exception as e:
            logger.warning("llm_fallback_failed", extra={"context": {"error": str(e)}})
            return None

    # ── Public Entry Point ────────────────────────────────────────────────────

    async def solve(
        self,
        question_b64: str,
        option_b64s: list[str],
        domain: str | None = None,
    ) -> dict[str, Any]:
        """
        Full pipeline. Returns:
          { option_number: int, answer_text: str, method: str, processing_ms: int }
        """
        started = time.perf_counter()

        try:
            q_img = _b64_to_pil(question_b64)
        except Exception as e:
            return {"error": f"Invalid question image: {e}", "option_number": None, "method": "error", "processing_ms": 0}

        # Layer 1 — Perceptual Hash (sign images → sign label → correct option)
        sign_label = self._match_sign_hash(q_img)
        if sign_label:
            # First try sign label lookup in questions DB
            sign_entry = self._search_by_sign(sign_label)
            if sign_entry and sign_entry.get("correct_option_number"):
                opt_num = int(sign_entry["correct_option_number"])
                answer  = sign_entry.get(f"option_{opt_num}", self._sign_labels.get(sign_label, sign_label))
                ms = int((time.perf_counter() - started) * 1000)
                logger.info("exam_solved_hash_db", extra={"context": {"sign": sign_label, "option": opt_num}})
                return {"option_number": opt_num, "answer_text": answer, "method": "hash_db", "processing_ms": ms}
            # Fallback: match sign description against OCR'd option text
            opt_num = self._sign_to_option(sign_label, option_b64s)
            if opt_num:
                ms = int((time.perf_counter() - started) * 1000)
                logger.info("exam_solved_hash", extra={"context": {"sign": sign_label, "option": opt_num}})
                return {"option_number": opt_num, "answer_text": self._sign_labels.get(sign_label, sign_label), "method": "hash", "processing_ms": ms}

        # Layer 2 — OCR + DB (question text / option text / Hindi fuzzy)
        question_text = self._ocr_text(q_img)
        option_texts  = []
        for opt_b64 in option_b64s:
            try:
                opt_img = _b64_to_pil(opt_b64)
                option_texts.append(self._ocr_text(opt_img))
            except Exception:
                option_texts.append("")

        match = self._db_lookup(question_text, option_texts)
        if match and match.get("correct_option_number"):  # ← correct key name
            ms      = int((time.perf_counter() - started) * 1000)
            opt_num = int(match["correct_option_number"])
            answer  = match.get(f"option_{opt_num}", f"Option {opt_num}")
            logger.info("exam_solved_ocr_db", extra={"context": {"option": opt_num, "ms": ms}})
            return {"option_number": opt_num, "answer_text": answer, "method": "ocr_db", "processing_ms": ms}

        # Layer 3 — LiteLLM multimodal fallback
        opt_num = await self._llm_solve(question_b64, option_b64s)
        ms = int((time.perf_counter() - started) * 1000)
        if opt_num:
            logger.info("exam_solved_llm", extra={"context": {"option": opt_num, "ms": ms}})
            return {"option_number": opt_num, "answer_text": f"Option {opt_num} (AI)", "method": "llm", "processing_ms": ms}

        ms = int((time.perf_counter() - started) * 1000)
        logger.warning("exam_no_match", extra={"context": {"question_text": question_text[:80] if question_text else ""}})
        return {"option_number": None, "answer_text": None, "method": "none", "processing_ms": ms}
