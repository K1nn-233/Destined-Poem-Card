#!/usr/bin/env python3
"""Check data embedded place markers against marker0502_wsrv.txt.

Embedded ``place.marker`` data is the source of truth. With ``--write``, this
script rewrites the standalone marker file from embedded place markers.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "content" / "geography"


def load_marker_text(path: Path) -> list[dict[str, Any]]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return []
    return json.loads(f"[{text.rstrip(',')}]")


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def marker_text(markers: list[dict[str, Any]]) -> str:
    text = ",\n".join(json.dumps(marker, ensure_ascii=False, indent=2) for marker in markers)
    return text + ("\n" if text else "")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check/update standalone markers from places.yaml")
    parser.add_argument("--places", type=Path, default=DATA_DIR / "places.yaml")
    parser.add_argument("--markers", type=Path, default=DATA_DIR / "marker0502_wsrv.txt")
    parser.add_argument("--write", action="store_true", help="rewrite marker file from embedded place.marker data")
    args = parser.parse_args()

    places = yaml.safe_load(args.places.read_text(encoding="utf-8")).get("places") or []
    marker_file_items = load_marker_text(args.markers)
    marker_file_by_id = {str(marker.get("id")): marker for marker in marker_file_items if marker.get("id")}

    place_markers: list[dict[str, Any]] = []
    place_marker_by_id: dict[str, dict[str, Any]] = {}
    duplicate_place_marker_ids: set[str] = set()
    marker_id_mismatches: list[str] = []

    for place in places:
        marker = place.get("marker")
        if not isinstance(marker, dict):
            continue
        marker_id = str(marker.get("id") or place.get("marker_id") or "")
        if not marker_id:
            continue
        if place.get("marker_id") and place.get("marker_id") != marker_id:
            marker_id_mismatches.append(str(place.get("id")))
        marker = dict(marker)
        marker["id"] = marker_id
        place_markers.append(marker)
        if marker_id in place_marker_by_id:
            duplicate_place_marker_ids.add(marker_id)
        else:
            place_marker_by_id[marker_id] = marker

    missing_in_marker_file = sorted(set(place_marker_by_id) - set(marker_file_by_id))
    extra_in_marker_file = sorted(set(marker_file_by_id) - set(place_marker_by_id))
    conflicts = sorted(
        marker_id
        for marker_id, place_marker in place_marker_by_id.items()
        if marker_id in marker_file_by_id and canonical(place_marker) != canonical(marker_file_by_id[marker_id])
    )

    print(f"place_markers={len(place_marker_by_id)} marker_file_markers={len(marker_file_by_id)}")
    print(f"conflicts={len(conflicts)} missing_in_marker_file={len(missing_in_marker_file)} extra_in_marker_file={len(extra_in_marker_file)}")
    print(f"duplicate_place_marker_ids={len(duplicate_place_marker_ids)} marker_id_mismatches={len(marker_id_mismatches)}")
    if conflicts:
        print("conflict_ids=" + ",".join(conflicts))
    if missing_in_marker_file:
        print("missing_ids=" + ",".join(missing_in_marker_file))
    if extra_in_marker_file:
        print("extra_ids=" + ",".join(extra_in_marker_file))
    if duplicate_place_marker_ids:
        print("duplicate_ids=" + ",".join(sorted(duplicate_place_marker_ids)))
    if marker_id_mismatches:
        print("marker_id_mismatch_places=" + ",".join(sorted(marker_id_mismatches)))

    if args.write:
        args.markers.write_text(marker_text(place_markers), encoding="utf-8")
        print(f"updated={args.markers}")

    hard_error = bool(duplicate_place_marker_ids or marker_id_mismatches)
    return 1 if hard_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
