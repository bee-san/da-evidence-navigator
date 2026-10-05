# PP-OCRv6 models

The text reading models served next to this file (`PP-OCRv6_tiny/`) are
PaddlePaddle's official PP-OCRv6 tiny detection and recognition models in
ONNX format, from https://huggingface.co/PaddlePaddle (PP-OCRv6_tiny_det_onnx
and PP-OCRv6_tiny_rec_onnx), licensed under the Apache License 2.0:
https://www.apache.org/licenses/LICENSE-2.0

They are downloaded at build time by scripts/fetch-ocr-models.mjs, pinned to a
revision and checked against SHA-256 hashes. `dict.txt` is the character list
from the recognition model's inference.yml.
