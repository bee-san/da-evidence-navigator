// Which PaddleOCR model set the site serves (see scripts/fetch-ocr-models.mjs).
// On phone-style photos of the 28 test letters:
//   PP-OCRv6_tiny  (6 MB)  0.4% character errors, about 2 s a page in Chrome on a laptop, 8 s with the CPU slowed 4x
//   PP-OCRv6_small (31 MB) 0.08% character errors, about 8 s a page on a laptop, too slow for most phones
//   Tesseract.js, used before: 39% character errors
export const OCR_MODEL = 'PP-OCRv6_tiny';
