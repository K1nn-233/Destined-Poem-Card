#!/usr/bin/env python3
"""Build compact data used by render_runtime_geo_mermaid_compact.py."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = ROOT / "content" / "geography"
OUTPUT_DIR = ROOT / "dist" / "local" / "geography" / "compact"


def load_yaml(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def compact_description(place: dict[str, Any]) -> dict[str, str] | None:
    description = place.get("description")
    if not isinstance(description, dict):
        return None
    result = {}
    for key in ("brief", "detail"):
        value = description.get(key)
        if isinstance(value, str) and value.strip():
            result[key] = value
    return result or None


def compact_place(place: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": place["id"],
        "name": place["name"],
    }
    if place.get("parent") is not None:
        result["parent"] = place.get("parent")
    keywords = [str(keyword) for keyword in place.get("keywords") or [] if str(keyword).strip()]
    if keywords:
        result["keywords"] = keywords
    description = compact_description(place)
    if description:
        result["description"] = description
    if place.get("importance") is not None:
        result["importance"] = place.get("importance")
    return result


def compact_segment(segment: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key in ("transport", "days", "terrain", "direction"):
        if key in segment:
            result[key] = segment[key]
    return result


def compact_edge(edge: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "from": edge["from"],
        "to": edge["to"],
        "segments": [compact_segment(segment) for segment in edge.get("segments") or []],
    }
    if edge.get("importance") is not None:
        result["importance"] = edge.get("importance")
    return result


def dump_yaml(path: Path, data: dict[str, Any]) -> None:
    path.write_text(
        yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=120, default_flow_style=False),
        encoding="utf-8",
        newline="\n",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build compact/place.yaml and edges.yaml")
    parser.add_argument("--source", type=Path, default=SOURCE_DIR)
    parser.add_argument("--output", type=Path, default=OUTPUT_DIR)
    args = parser.parse_args()

    places = load_yaml(args.source / "places.yaml").get("places") or []
    edges = load_yaml(args.source / "edges.yaml").get("edges") or []
    compact_places = [compact_place(place) for place in places]
    compact_edges = [compact_edge(edge) for edge in edges]

    args.output.mkdir(parents=True, exist_ok=True)
    dump_yaml(args.output / "place.yaml", {"places": compact_places})
    dump_yaml(args.output / "edges.yaml", {"edges": compact_edges})
    print(f"places={len(compact_places)} edges={len(compact_edges)} output={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
