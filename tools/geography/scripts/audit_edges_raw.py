#!/usr/bin/env python3
"""Audit raw geography edge data without modifying it."""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "content" / "geography"
COORD_DIRECTIONS = {"东-西", "西-东", "北-南", "南-北"}


def load_yaml(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return yaml.safe_load(file)


def place_position(place: dict[str, Any]) -> tuple[float, float] | None:
    marker = place.get("marker")
    if not isinstance(marker, dict):
        return None
    position = marker.get("position")
    if not isinstance(position, dict):
        return None
    nx = position.get("nx")
    ny = position.get("ny")
    if isinstance(nx, (int, float)) and isinstance(ny, (int, float)):
        return float(nx), float(ny)
    return None


def coord_direction_issue(
    direction: str,
    from_pos: tuple[float, float] | None,
    to_pos: tuple[float, float] | None,
    min_delta: float,
) -> str | None:
    if direction not in COORD_DIRECTIONS or from_pos is None or to_pos is None:
        return None
    dx = to_pos[0] - from_pos[0]
    dy = to_pos[1] - from_pos[1]
    if direction == "西-东" and dx < -min_delta:
        return f"direction says west-east, but coords go east-west (dx={dx:.3f})"
    if direction == "东-西" and dx > min_delta:
        return f"direction says east-west, but coords go west-east (dx={dx:.3f})"
    if direction == "北-南" and dy < -min_delta:
        return f"direction says north-south, but coords go south-north (dy={dy:.3f})"
    if direction == "南-北" and dy > min_delta:
        return f"direction says south-north, but coords go north-south (dy={dy:.3f})"
    return None


def add(findings: list[dict[str, str]], severity: str, code: str, edge_id: str, message: str) -> None:
    findings.append({"severity": severity, "code": code, "edge_id": edge_id, "message": message})


def audit(places: list[dict[str, Any]], edges: list[dict[str, Any]], min_delta: float) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    place_by_id = {place.get("id"): place for place in places if isinstance(place.get("id"), str)}
    parent_by_id = {place_id: place.get("parent") for place_id, place in place_by_id.items()}
    positions = {place_id: place_position(place) for place_id, place in place_by_id.items()}

    id_counts = Counter(edge.get("id") for edge in edges)
    route_ids: dict[str, str] = {}

    for edge in edges:
        edge_id = str(edge.get("id") or "<missing-id>")
        from_id = edge.get("from")
        to_id = edge.get("to")

        if not isinstance(edge.get("id"), str) or not edge.get("id"):
            add(findings, "error", "missing_edge_id", edge_id, "edge id must be a non-empty string")
        elif id_counts[edge.get("id")] > 1:
            add(findings, "error", "duplicate_edge_id", edge_id, "edge id appears more than once")

        if not isinstance(from_id, str) or not from_id:
            add(findings, "error", "missing_from", edge_id, "from must be a non-empty string")
        if not isinstance(to_id, str) or not to_id:
            add(findings, "error", "missing_to", edge_id, "to must be a non-empty string")
        if not isinstance(from_id, str) or not isinstance(to_id, str):
            continue

        if from_id not in place_by_id:
            add(findings, "error", "unknown_from", edge_id, f"from place does not exist: {from_id}")
        if to_id not in place_by_id:
            add(findings, "error", "unknown_to", edge_id, f"to place does not exist: {to_id}")
        if from_id == to_id:
            add(findings, "error", "self_edge", edge_id, "from and to are identical")

        if parent_by_id.get(from_id) == to_id or parent_by_id.get(to_id) == from_id:
            add(findings, "warning", "parent_child_route", edge_id, "edge connects direct parent/child places")

        if not isinstance(edge.get("bidirectional"), bool):
            add(findings, "error", "bad_bidirectional", edge_id, "bidirectional must be a boolean; one-way routes are allowed")

        importance = edge.get("importance")
        if not isinstance(importance, int):
            add(findings, "warning", "bad_importance", edge_id, "importance should be an integer")

        segments = edge.get("segments")
        if not isinstance(segments, list) or not segments:
            add(findings, "error", "missing_segments", edge_id, "segments must be a non-empty list")
            continue

        for index, segment in enumerate(segments):
            segment_id = f"{edge_id}#seg{index}"
            if not isinstance(segment, dict):
                add(findings, "error", "bad_segment", segment_id, "segment must be a mapping")
                continue
            transport = segment.get("transport")
            if not isinstance(transport, str) or not transport.strip():
                add(findings, "error", "missing_transport", segment_id, "transport must be a non-empty string")
            days = segment.get("days")
            if days is not None:
                if isinstance(days, bool) or not isinstance(days, (int, float)) or not math.isfinite(days) or days < 0:
                    add(findings, "error", "bad_days", segment_id, "days must be a finite non-negative number or null")
            terrain = segment.get("terrain")
            if not isinstance(terrain, list) or not all(isinstance(item, str) and item.strip() for item in terrain):
                add(findings, "error", "bad_terrain", segment_id, "terrain must be a list of non-empty strings; an empty list is allowed")
            direction = segment.get("direction")
            if not isinstance(direction, str) or not direction.strip():
                add(findings, "error", "missing_direction", segment_id, "direction must be a non-empty string")
            else:
                issue = coord_direction_issue(direction, positions.get(from_id), positions.get(to_id), min_delta)
                if issue:
                    add(findings, "warning", "coordinate_direction_mismatch", segment_id, issue + "; map-coordinate heuristic only, review manually")

        # Parallel routes with distinct transport or travel time are valid. Compare
        # the fields actually retained in compact data, rather than endpoints alone.
        normalized_segments = []
        reverse = edge.get("bidirectional") is True and from_id > to_id
        for segment in segments:
            if not isinstance(segment, dict):
                continue
            normalized = {key: segment.get(key) for key in ("transport", "days", "terrain", "direction")}
            if reverse and isinstance(normalized["direction"], str):
                parts = normalized["direction"].split("-")
                if len(parts) == 2 and all(part.strip() for part in parts):
                    normalized["direction"] = "-".join(part.strip() for part in reversed(parts))
            normalized_segments.append(normalized)
        signature = json.dumps({
            "from": to_id if reverse else from_id,
            "to": from_id if reverse else to_id,
            "bidirectional": edge.get("bidirectional"),
            "segments": normalized_segments,
        }, ensure_ascii=False, sort_keys=True)
        if signature in route_ids:
            add(findings, "warning", "duplicate_route", edge_id, f"same endpoints and compact route content as {route_ids[signature]}")
        else:
            route_ids[signature] = edge_id

    return findings


def print_report(findings: list[dict[str, str]]) -> None:
    counts = Counter(finding["severity"] for finding in findings)
    print("# Edge Raw Data Audit")
    print()
    print(f"errors: {counts.get('error', 0)}")
    print(f"warnings: {counts.get('warning', 0)}")
    print()
    if not findings:
        print("No findings.")
        return

    by_code: dict[str, list[dict[str, str]]] = defaultdict(list)
    for finding in findings:
        by_code[finding["code"]].append(finding)
    print("## Findings By Code")
    for code, rows in sorted(by_code.items(), key=lambda item: (-len(item[1]), item[0])):
        severities = Counter(row["severity"] for row in rows)
        print(f"- {code}: {len(rows)} ({', '.join(f'{key}={value}' for key, value in sorted(severities.items()))})")
    print()
    groups = [
        ("Structural errors", [row for row in findings if row["severity"] == "error"]),
        ("Data review warnings", [row for row in findings if row["severity"] == "warning" and row["code"] != "coordinate_direction_mismatch"]),
        ("Coordinate heuristics (manual review)", [row for row in findings if row["code"] == "coordinate_direction_mismatch"]),
    ]
    for title, rows in groups:
        if not rows:
            continue
        print(f"## {title}")
        for finding in sorted(rows, key=lambda row: (row["code"], row["edge_id"])):
            print(f"- [{finding['severity']}] {finding['code']} {finding['edge_id']}: {finding['message']}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit raw edge data for structural and semantic issues")
    parser.add_argument("--places", type=Path, default=DATA_DIR / "places.yaml")
    parser.add_argument("--edges", type=Path, default=DATA_DIR / "edges.yaml")
    parser.add_argument("--min-delta", type=float, default=0.02, help="minimum map-coordinate delta for direction mismatch warnings")
    args = parser.parse_args()

    places = load_yaml(args.places).get("places", [])
    edges = load_yaml(args.edges).get("edges", [])
    findings = audit(places, edges, args.min_delta)
    print_report(findings)
    return 1 if any(finding["severity"] == "error" for finding in findings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
