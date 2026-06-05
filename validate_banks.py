#!/usr/bin/env python3
"""
validate_banks.py  –  Pre-commit validator for MCQ question bank .txt files.

Mirrors the JavaScript parser in script.js so syntax errors are caught before
deployment instead of silently skipped at runtime.

Usage
-----
  python validate_banks.py                   # staged .txt files (pre-commit mode)
  python validate_banks.py --all             # every file in questionbanks/
  python validate_banks.py path/to/bank.txt  # explicit file(s)
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

# ── Constants (mirror script.js CONSTANTS / MEDIA_EXT) ───────────────────────

MAX_BANK_SIZE = 5000

# Mirrors /\n\s*---\s*\n/g  (the block separator)
SEPARATOR_RE = re.compile(r'\n[ \t]*---[ \t]*\n')

# Mirrors /^[*+]\s+/.test(line)  (correct-answer prefix in legacy format)
CORRECT_PREFIX_RE = re.compile(r'^[*+] +')

# Mirrors /MEDIA:\s*([^\s]+)/gi  (inline media reference)
MEDIA_INLINE_RE = re.compile(r'MEDIA:\s*(\S+)', re.IGNORECASE)

# Mirrors MEDIA_EXT in script.js
MEDIA_EXTENSIONS: frozenset[str] = frozenset({
    # image
    '.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif',
    # audio
    '.mp3', '.wav', '.ogg', '.m4a',
    # video
    '.mp4', '.webm', '.mov',
})


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class _Option:
    text:    str
    correct: bool
    media:   list[str] = field(default_factory=list)


@dataclass
class ValidationError:
    file:        str
    question_no: int            # 1-based sequential number; 0 = file-level error
    line_no:     Optional[int]  # approximate first line of the block (1-based)
    message:     str

    def __str__(self) -> str:
        q   = f"Q{self.question_no}" if self.question_no else "file"
        ln  = f" (line ~{self.line_no})" if self.line_no else ""
        return f"    [{q}]{ln}  {self.message}"


# ── Parser helpers (mirrors extractMediaAndClean / normalizePath) ─────────────

def _normalize_path(p: str) -> str:
    """Mirrors normalizePath(): strip leading './' and whitespace."""
    return p.strip().lstrip('./')


def _extract_media(text: str) -> tuple[str, list[str]]:
    """
    Mirrors extractMediaAndClean().
    Returns (cleaned_text, [media_paths]).
    """
    if not text:
        return '', []
    media: list[str] = []

    def _grab(m: re.Match) -> str:
        media.append(_normalize_path(m.group(1)))
        return ''

    cleaned = MEDIA_INLINE_RE.sub(_grab, text)
    cleaned = re.sub(r':\s*$', '', cleaned).strip()
    return cleaned, media


# ── Block parsers ─────────────────────────────────────────────────────────────

def _parse_legacy(block: str, seq: int) -> tuple[str, list[_Option]] | None:
    """
    Mirrors parseLegacyBlock().
    seq is the 1-based question number used in error messages.
    Returns (question_text, options) or None for an empty block.
    Raises ValueError on any syntax violation.
    """
    lines = [l.strip() for l in block.splitlines() if l.strip()]
    if not lines:
        return None

    q_pos = next(
        (i for i, l in enumerate(lines) if l.startswith('Q:')), -1
    )
    q_parts:   list[str] = []
    opt_lines: list[str] = []

    if q_pos != -1:
        # Q: prefix style – everything else is an option line
        q_parts.append(re.sub(r'^Q:\s*', '', lines[q_pos]).strip())
        opt_lines = [l for i, l in enumerate(lines) if i != q_pos]
    else:
        # No Q: prefix – leading non-option lines form the question
        reading_q = True
        for line in lines:
            is_opt = bool(CORRECT_PREFIX_RE.match(line))
            if reading_q and not is_opt:
                q_parts.append(line)
            else:
                reading_q = False
                opt_lines.append(line)

    question, _ = _extract_media(' '.join(q_parts))

    options: list[_Option] = []
    for raw in opt_lines:
        correct = bool(CORRECT_PREFIX_RE.match(raw))
        text, _ = _extract_media(CORRECT_PREFIX_RE.sub('', raw).strip())
        if text:
            options.append(_Option(text=text, correct=correct))

    # ── Validation rules (mirror JS throw statements) ──────────────────────
    if not question:
        raise ValueError(f'Q{seq}: question text is empty')
    if not options:
        raise ValueError(f'Q{seq}: no answer options found')
    n_correct = sum(o.correct for o in options)
    if n_correct == 0:
        raise ValueError(f'Q{seq}: no correct answer marked (use "* " or "+ " prefix)')
    if n_correct > 1:
        raise ValueError(
            f'Q{seq}: must have exactly 1 correct answer (found {n_correct})'
        )

    return question, options


def _parse_structured(block: str, seq: int) -> tuple[str, list[_Option]]:
    """
    Mirrors parseStructuredBlock().
    seq is the 1-based question number used in error messages.
    Raises ValueError on any syntax violation.
    """
    question = ''
    options:     list[_Option] = []
    current_opt: Optional[_Option] = None
    in_options = False

    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        if line.startswith('Q:'):
            question = re.sub(r'^Q:\s*', '', line).strip()
        elif line == 'OPTION:':
            in_options  = True
            current_opt = _Option(text='', correct=False)
            options.append(current_opt)
        elif line.upper().startswith('MEDIA:'):
            path = _normalize_path(re.sub(r'^MEDIA:\s*', '', line, flags=re.IGNORECASE))
            if current_opt and in_options:
                current_opt.media.append(path)
            # (question-level media is valid but not stored here)
        elif line.upper().startswith('CORRECT:') and current_opt:
            current_opt.correct = (
                re.sub(r'^CORRECT:\s*', '', line, flags=re.IGNORECASE).strip().lower()
                == 'true'
            )
        elif line.upper().startswith('TEXT:') and current_opt:
            current_opt.text = re.sub(r'^TEXT:\s*', '', line, flags=re.IGNORECASE).strip()
        elif not in_options:
            question += ' ' + line

    question = question.strip()

    # ── Validation rules (mirror JS throw statements) ──────────────────────
    if not question:
        raise ValueError(f'Q{seq}: missing question text (no "Q:" line found)')
    options = [o for o in options if o.text or o.media]
    if not options:
        raise ValueError(f'Q{seq}: no answer options found (add OPTION: / TEXT: blocks)')
    n_correct = sum(o.correct for o in options)
    if n_correct == 0:
        raise ValueError(
            f'Q{seq}: no correct answer marked (add "CORRECT: true" to one option)'
        )
    if n_correct > 1:
        raise ValueError(
            f'Q{seq}: must have exactly 1 correct answer (found {n_correct})'
        )

    return question, options


# ── Block-start line numbers ──────────────────────────────────────────────────

def _block_line_numbers(content: str) -> list[int]:
    """
    Return the 1-based line number at which each block (after splitting on
    SEPARATOR_RE) begins.  The first block always starts at line 1.
    """
    positions = [0] + [m.end() for m in SEPARATOR_RE.finditer(content)]
    return [content[:pos].count('\n') + 1 for pos in positions]


# ── File validator ────────────────────────────────────────────────────────────

def validate_file(path: str) -> list[ValidationError]:
    """
    Fully validate one question bank file.
    Returns a (possibly empty) list of ValidationError objects.
    """
    errors: list[ValidationError] = []

    # 1. Read ─────────────────────────────────────────────────────────────────
    try:
        content = Path(path).read_text(encoding='utf-8')
    except UnicodeDecodeError:
        return [ValidationError(path, 0, None,
                'File is not valid UTF-8; save it as UTF-8 and retry')]
    except OSError as exc:
        return [ValidationError(path, 0, None, f'Cannot read file: {exc}')]

    # 2. Split into blocks ────────────────────────────────────────────────────
    raw_parts = SEPARATOR_RE.split(content)
    blocks    = [(i, b.strip()) for i, b in enumerate(raw_parts) if b.strip()]

    if not blocks:
        errors.append(ValidationError(path, 0, None,
            'No questions found — file is empty or missing "---" separators'))
        return errors

    line_nums = _block_line_numbers(content)

    if len(blocks) > MAX_BANK_SIZE:
        errors.append(ValidationError(path, 0, None,
            f'Bank has {len(blocks)} questions; hard maximum is {MAX_BANK_SIZE}'))

    # 3. Parse and validate each block ────────────────────────────────────────
    for seq, (raw_idx, block) in enumerate(blocks, start=1):
        line_no = line_nums[raw_idx] if raw_idx < len(line_nums) else None

        # Detect format (mirrors parseQuestions() structured-detection heuristic)
        is_structured = bool(
            re.search(r'(^|\n)[ \t]*OPTION:',  block, re.MULTILINE) or
            re.search(r'(^|\n)[ \t]*CORRECT:', block, re.MULTILINE)
        )

        try:
            result = (
                _parse_structured(block, seq) if is_structured
                else _parse_legacy(block, seq)
            )
        except ValueError as exc:
            errors.append(ValidationError(path, seq, line_no, str(exc)))
            continue

        if result is None:
            continue

        # 4. Validate media extensions referenced in the block ────────────────
        for media_path in MEDIA_INLINE_RE.findall(block):
            ext = Path(media_path).suffix.lower()
            if ext and ext not in MEDIA_EXTENSIONS:
                errors.append(ValidationError(
                    path, seq, line_no,
                    f'unsupported media extension "{ext}" in path "{media_path}"'
                ))

    return errors


# ── File discovery ────────────────────────────────────────────────────────────

def _staged_bank_files() -> list[str]:
    """Return staged questionbanks/*.txt files using git diff --cached."""
    try:
        out = subprocess.check_output(
            ['git', 'diff', '--cached', '--name-only', '--diff-filter=ACM'],
            stderr=subprocess.DEVNULL, text=True,
        )
        return [
            f for f in out.splitlines()
            if f.startswith('questionbanks/') and f.endswith('.txt')
        ]
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []


def _all_bank_files(root: str = '.') -> list[str]:
    """Return all *.txt files under questionbanks/."""
    bank_dir = Path(root) / 'questionbanks'
    return sorted(str(p) for p in bank_dir.glob('*.txt')) if bank_dir.is_dir() else []


def _question_count(path: str) -> int:
    """Quick count of non-empty blocks in a file (no full parse)."""
    try:
        text = Path(path).read_text(encoding='utf-8', errors='replace')
        return sum(1 for b in SEPARATOR_RE.split(text) if b.strip())
    except OSError:
        return 0


# ── CLI ───────────────────────────────────────────────────────────────────────

def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(
        description='Validate MCQ question bank .txt files against the parser.'
    )
    ap.add_argument('files', nargs='*',
                    help='Explicit .txt file(s) to validate')
    ap.add_argument('--all', action='store_true',
                    help='Validate every file in questionbanks/')
    ap.add_argument('--staged', action='store_true',
                    help='Validate only git-staged files (default in hook mode)')
    args = ap.parse_args(argv)

    # ── Determine file list ───────────────────────────────────────────────────
    if args.files:
        files = args.files
    elif args.all:
        files = _all_bank_files()
        if not files:
            print('No .txt files found in questionbanks/')
            return 0
    else:
        # Pre-commit mode: staged files; fall back to all files when run manually
        files = _staged_bank_files() or _all_bank_files()
        if not files:
            print('Nothing to validate.')
            return 0

    # ── Validate ──────────────────────────────────────────────────────────────
    total_errors = 0
    validated    = 0

    for path in files:
        if not os.path.isfile(path):
            print(f'  SKIP  {path}  (file not found)')
            continue

        errs      = validate_file(path)
        q_count   = _question_count(path)
        validated += 1

        if errs:
            print(f'  FAIL  {path}  ({q_count} questions, {len(errs)} error(s))')
            for e in errs:
                print(e)
            total_errors += len(errs)
        else:
            print(f'  OK    {path}  ({q_count} questions)')

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    if total_errors:
        print(f'✗  {total_errors} error(s) in {validated} file(s). '
              'Fix them and commit again.')
        return 1

    print(f'✓  All {validated} file(s) passed validation.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
