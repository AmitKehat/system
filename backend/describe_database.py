#!/usr/bin/env python3
"""
Dump the current directory into a single log file:

1) A tree of the directory structure (paths start with "root/")
2) Then each file's relative path + full content, separated by a unique separator line.

Safety & noise reduction:
- Excludes common environment/cache/build directories and files.
- Excludes ALL hidden directories (starting with ".") by default (e.g., .git, .pytest_cache).
- Excludes environment files like .env and .env.* by default.
- Skips likely-binary files and common binary extensions.

Usage:
  python dump_repo_log.py
  python dump_repo_log.py --out repo_dump.log
  python dump_repo_log.py --max-bytes 2000000
  python dump_repo_log.py --include-hidden   (NOT recommended)
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Iterable, List, Set, Tuple


SEPARATOR = "=" * 63

# Always ignored directory names (exact match)
IGNORE_DIRS: Set[str] = {
    "tmp",
    "venv",
    ".venv",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".tox",
    ".eggs",
    ".git",
    ".idea",
    ".vscode",
}

# Always ignored file names (exact match)
IGNORE_FILES: Set[str] = {
    ".DS_Store",
    ".env",
}

# Ignore environment-like file name patterns (prefix match)
IGNORE_FILE_PREFIXES: Tuple[str, ...] = (
    ".env.",          # .env.local, .env.production, etc.
    ".python-version",
)

# Ignore file extensions that are typically binary / not helpful in context dumps
IGNORE_EXTS: Set[str] = {
    ".pyc", ".pyo", ".pyd",
    ".o", ".a", ".so", ".dll", ".dylib",
    ".class", ".jar",
    ".exe",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".ico",
    ".zip", ".tar", ".gz", ".7z", ".rar",
    ".pdf",
    ".db", ".sqlite", ".sqlite3",
    ".log",
}


def is_hidden_name(name: str) -> bool:
    return name.startswith(".")


def is_ignored_dir(name: str, include_hidden: bool) -> bool:
    if name in IGNORE_DIRS:
        return True
    if (not include_hidden) and is_hidden_name(name):
        return True
    return False


def is_ignored_file(path: Path, include_hidden: bool) -> bool:
    name = path.name

    if name in IGNORE_FILES:
        return True

    if any(name.startswith(prefix) for prefix in IGNORE_FILE_PREFIXES):
        return True

    if path.suffix.lower() in IGNORE_EXTS:
        return True

    if (not include_hidden) and is_hidden_name(name):
        return True

    return False


def safe_relpath(path: Path, root: Path) -> str:
    """Return a stable relative path prefixed by 'root/'."""
    try:
        return "root/" + str(path.relative_to(root)).replace("\\", "/")
    except Exception:
        return "root/" + path.name


def build_tree_lines(root: Path, include_hidden: bool) -> List[str]:
    """
    Build an ASCII tree with a root label of 'root/'.
    Excludes ignored dirs/files.
    """
    lines: List[str] = ["root/"]

    def listdir_sorted(p: Path) -> List[Path]:
        try:
            items = list(p.iterdir())
        except (PermissionError, OSError):
            return []
        # dirs first, then files; alphabetical (case-insensitive)
        items.sort(key=lambda x: (not x.is_dir(), x.name.lower()))
        return items

    def walk(dir_path: Path, prefix: str) -> None:
        children_all = listdir_sorted(dir_path)

        children: List[Path] = []
        for c in children_all:
            if c.is_dir():
                if is_ignored_dir(c.name, include_hidden):
                    continue
                children.append(c)
            else:
                if is_ignored_file(c, include_hidden):
                    continue
                children.append(c)

        for idx, child in enumerate(children):
            last = (idx == len(children) - 1)
            branch = "└── " if last else "├── "
            lines.append(prefix + branch + child.name)

            if child.is_dir():
                extension = "    " if last else "│   "
                walk(child, prefix + extension)

    walk(root, "")
    return lines


def iter_files_recursively(root: Path, include_hidden: bool) -> Iterable[Path]:
    """
    Yield file paths under root, excluding ignored directories/files.
    Deterministic order.
    """
    for dirpath, dirnames, filenames in os.walk(root):
        # prune dirs in-place
        dirnames[:] = sorted(dirnames, key=lambda s: s.lower())
        dirnames[:] = [d for d in dirnames if not is_ignored_dir(d, include_hidden)]

        filenames = sorted(filenames, key=lambda s: s.lower())
        for fn in filenames:
            p = Path(dirpath) / fn
            try:
                if p.is_symlink():
                    continue
            except OSError:
                continue
            if is_ignored_file(p, include_hidden):
                continue
            yield p


def looks_binary(data: bytes) -> bool:
    """Heuristic: presence of NUL byte or very high non-text ratio."""
    if b"\x00" in data:
        return True
    # If >30% bytes are outside common text ranges, treat as binary-ish
    if not data:
        return False
    textish = 0
    for b in data[:4096]:
        if b in (9, 10, 13) or 32 <= b <= 126:
            textish += 1
    return (textish / max(1, min(len(data), 4096))) < 0.70


def read_text_file_best_effort(path: Path, max_bytes: int) -> str:
    """
    Read file as bytes, optionally cap to max_bytes, then decode safely.
    Returns text content, or a placeholder if skipped/errors.
    """
    try:
        data = path.read_bytes()
    except Exception as e:
        return f"[ERROR READING FILE: {e}]\n"

    truncated = False
    if max_bytes > 0 and len(data) > max_bytes:
        data = data[:max_bytes]
        truncated = True

    if looks_binary(data):
        return "[SKIPPED: looks like a binary file]\n"

    # Decode as UTF-8 with replacement to avoid crashes
    text = data.decode("utf-8", errors="replace")

    if truncated:
        if not text.endswith("\n"):
            text += "\n"
        text += "[...TRUNCATED...]\n"

    return text


def main() -> int:
    parser = argparse.ArgumentParser(description="Dump tree + file contents into one log file.")
    parser.add_argument("--out", default="directory_dump.log", help="Output log filename (default: directory_dump.log)")
    parser.add_argument("--max-bytes", type=int, default=5_000_000, help="Max bytes per file (0 = unlimited)")
    parser.add_argument(
        "--include-hidden",
        action="store_true",
        help="Include hidden files/dirs (starting with '.'). NOT recommended.",
    )
    args = parser.parse_args()

    root = Path.cwd()
    out_path = (root / args.out).resolve()

    tree_lines = build_tree_lines(root, include_hidden=args.include_hidden)

    files: List[Path] = []
    for p in iter_files_recursively(root, include_hidden=args.include_hidden):
        # Do not dump the output log into itself
        try:
            if p.resolve() == out_path:
                continue
        except Exception:
            pass
        files.append(p)

    with out_path.open("w", encoding="utf-8", newline="\n") as f:
        # 1) Tree
        f.write("FILE TREE\n")
        f.write(SEPARATOR + "\n")
        for line in tree_lines:
            f.write(line + "\n")

        f.write("\n\nFILES + CONTENT\n")
        f.write(SEPARATOR + "\n\n")

        # 2) Files + content
        for p in files:
            f.write(safe_relpath(p, root) + "\n\n")
            content = read_text_file_best_effort(p, max_bytes=args.max_bytes)
            f.write(content)
            if not content.endswith("\n"):
                f.write("\n")
            f.write(SEPARATOR + "\n")

    print(f"Done. Wrote: {out_path}")
    print(f"Files included: {len(files)}")
    if not args.include_hidden:
        print("Hidden files/dirs were excluded (recommended). Use --include-hidden to include them.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
