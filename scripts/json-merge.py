#!/usr/bin/env python3
"""Merge SOURCE into DEST: objects merge recursively; source arrays/scalars win.

Both files must contain standard JSON objects. A missing destination is created.
Keys absent from the source are preserved, including local runtime state.
"""

import argparse
import json
import os
from pathlib import Path
import stat
import tempfile

def merge(local, source):
    result = dict(local)
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = merge(result[key], value)
        else:
            result[key] = value
    return result


def apply(source, destination):
    if destination.is_symlink():
        raise ValueError(f"Refusing to overwrite linked config: {destination}")
    local = json.loads(destination.read_text()) if destination.exists() else {}
    managed = json.loads(source.read_text())
    if not isinstance(local, dict) or not isinstance(managed, dict):
        raise ValueError(f"Config must be a JSON object: {destination}")
    updated = merge(local, managed)
    if destination.exists() and updated == local:
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(destination.stat().st_mode) if destination.exists() else 0o600
    fd, temporary = tempfile.mkstemp(prefix=f".{destination.name}.", dir=destination.parent)
    try:
        with os.fdopen(fd, "w") as file:
            file.write(json.dumps(updated, indent=2, ensure_ascii=False) + "\n")
        os.chmod(temporary, mode)
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", metavar="SOURCE", type=Path)
    parser.add_argument("destination", metavar="DEST", type=Path)
    args = parser.parse_args()
    try:
        changed = apply(args.source, args.destination)
        print(f"{'updated' if changed else 'unchanged'}  {args.destination}")
    except (OSError, ValueError) as error:
        parser.exit(1, f"error: {error}\n")


if __name__ == "__main__":
    main()
