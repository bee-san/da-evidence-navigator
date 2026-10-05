"""Keeps the JavaScript port of laa-evidence-checker (src/app/checker/) in step with the Python package.

    python3 scripts/checker-golden.py /path/to/laa-evidence-checker

1. Writes src/app/checker/lexicon.js from the package's lexicon.py, so the word lists and patterns are
   copied exactly rather than by hand.
2. Runs the package's pytest suite with check() wrapped, and writes every call and its result to
   test/fixtures/checker-golden.json. test/checker.test.mjs checks the JavaScript port gives the same
   result for each.

Needs pytest installed. All letters in the package's tests are fictional.
"""
import json
import sys
from datetime import date
from pathlib import Path

import pytest

pkg = Path(sys.argv[1]).resolve()
out = Path(__file__).resolve().parent.parent / "test" / "fixtures" / "checker-golden.json"
sys.path.insert(0, str(pkg / "src"))
import evidence_checker  # noqa: E402
from evidence_checker import lexicon  # noqa: E402

root = Path(__file__).resolve().parent.parent
names = [n for n in vars(lexicon) if n.isupper()]
lines = [
    "// Word lists and patterns used by the rules. GENERATED from laa-evidence-checker lexicon.py by",
    "// scripts/checker-golden.py - edit the Python package and regenerate, do not edit by hand.",
    "/* eslint-disable */",
    "",
]
for n in names:
    lines.append(f"export const {n} = {json.dumps(getattr(lexicon, n), ensure_ascii=False)};")
(root / "src" / "app" / "checker" / "lexicon.js").write_text("\n".join(lines) + "\n")
print(f"Wrote {len(names)} patterns to src/app/checker/lexicon.js")

calls = []
seen = set()


class Recorder:
    def pytest_configure(self, config):
        real = evidence_checker.check

        def recording_check(text, category, **kw):
            result = real(text, category, **kw)
            inputs = {k: (v.isoformat() if isinstance(v, date) else v) for k, v in kw.items() if v is not None}
            key = json.dumps([text, category, inputs], sort_keys=True)
            if key not in seen:
                seen.add(key)
                calls.append({"text": text, "category": category, "inputs": inputs, "result": result.to_dict()})
            return result

        evidence_checker.check = recording_check


code = pytest.main([str(pkg / "tests"), "-q", "-p", "no:cacheprovider"], plugins=[Recorder()])
out.write_text(json.dumps({"_source": f"laa-evidence-checker {evidence_checker.__version__}, guidance {evidence_checker.GUIDANCE_VERSION}",
                           "cases": calls}, indent=1, ensure_ascii=False) + "\n")
print(f"Wrote {len(calls)} cases to {out} (pytest exit code {code})")
