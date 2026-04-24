"""Standalone ONNX model test script."""

from __future__ import annotations

import argparse
import base64
import io
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image

VOCAB = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def decode_ctc(raw: np.ndarray, vocab: str) -> str:
    """Decode CTC output tensor."""

    if raw.shape[0] == 1:
        best_path = np.argmax(raw, axis=2)[0]
    else:
        best_path = np.argmax(raw, axis=2)[:, 0]

    prev = None
    chars: list[str] = []
    for idx in best_path:
        if idx != 0 and idx != prev:
            ci = int(idx) - 1
            if 0 <= ci < len(vocab):
                chars.append(vocab[ci])
        prev = idx
    return "".join(chars)


def preprocess_image(img: Image.Image, width: int, height: int) -> np.ndarray:
    """Resize and convert to [1,3,H,W] float32."""

    resized = img.convert("RGB").resize((width, height), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    chw = np.transpose(arr, (2, 0, 1))
    return np.expand_dims(chw, axis=0)


def main() -> None:
    """Run model load + inference test."""

    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="model.onnx")
    parser.add_argument("--image", default="")
    parser.add_argument("--width", type=int, default=250)
    parser.add_argument("--height", type=int, default=54)
    args = parser.parse_args()

    model_path = Path(args.model).resolve()
    load_start = time.perf_counter()
    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    load_ms = int((time.perf_counter() - load_start) * 1000)
    input_name = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    print(f"model_load_ms={load_ms}")
    print(f"input_name={input_name}")
    print(f"output_name={output_name}")

    if args.image:
        image_path = Path(args.image).resolve()
        image = Image.open(image_path)
    else:
        # fallback synthetic image for shape/inference test
        image = Image.new("RGB", (args.width, args.height), color=(255, 255, 255))

    tensor = preprocess_image(image, args.width, args.height)
    infer_start = time.perf_counter()
    raw = session.run([output_name], {input_name: tensor})[0]
    infer_ms = int((time.perf_counter() - infer_start) * 1000)
    pred = decode_ctc(raw, VOCAB)
    print(f"inference_ms={infer_ms}")
    print(f"output_shape={tuple(raw.shape)}")
    print(f"prediction={pred}")

    if args.image:
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="PNG")
        b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
        print(f"sample_base64_prefix={b64[:48]}...")


if __name__ == "__main__":
    main()

