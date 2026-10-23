#!/usr/bin/env python3

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "content" / "geography"


def load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def normalize_text(value: str) -> str:
    return "".join(str(value or "").strip().lower().split())


def split_location_path(value: str) -> list[str]:
    normalized_parts: list[str] = []
    current: list[str] = []
    separators = set("-－—>＞/／,，、;；\n")
    for char in str(value or ""):
        if char in separators:
            part = normalize_text("".join(current))
            if part:
                normalized_parts.append(part)
            current = []
        else:
            current.append(char)
    part = normalize_text("".join(current))
    if part:
        normalized_parts.append(part)
    return normalized_parts


def place_text_candidates(place: dict) -> list[str]:
    values = [place.get("name", "")]
    values.extend(place.get("keywords") or [])
    return [str(v) for v in values if str(v or "").strip()]


def parent_chain(place: dict, place_by_id: dict[str, dict]) -> list[dict]:
    chain: list[dict] = []
    seen: set[str] = set()
    current = place
    while True:
        parent_id = current.get("parent")
        if not parent_id or parent_id in seen or parent_id not in place_by_id:
            break
        seen.add(parent_id)
        current = place_by_id[parent_id]
        chain.append(current)
    return chain


def depth(place: dict, place_by_id: dict[str, dict]) -> int:
    return len(parent_chain(place, place_by_id))


def match_place(query: str, places: list[dict], place_by_id: dict[str, dict]) -> dict | None:
    normalized_query = normalize_text(query)
    if not normalized_query:
        return None
    segments = split_location_path(query)
    candidates: list[tuple[tuple[int, int, int, int, int, int], dict]] = []
    for place in places:
        best: tuple[int, int, int, int, int, int] | None = None
        place_depth = depth(place, place_by_id)
        importance = int(place.get("importance") or 0)
        for token in place_text_candidates(place):
            normalized_token = normalize_text(token)
            if not normalized_token:
                continue
            token_len = len(normalized_token)
            score: tuple[int, int, int, int, int, int] | None = None
            if normalized_query == normalized_token:
                score = (2, place_depth, 4, len(segments), importance, token_len)
            for index, segment in enumerate(segments):
                segment_score = None
                if segment == normalized_token:
                    segment_score = (2, place_depth, 3, index, importance, token_len)
                elif normalized_token in segment:
                    segment_score = (2, place_depth, 2, index, importance, token_len)
                if segment_score is not None and (score is None or segment_score > score):
                    score = segment_score
            if score is None and normalized_token in normalized_query:
                score = (2, place_depth, 1, -1, importance, token_len)
            if score is None:
                for index, segment in enumerate(segments):
                    if len(segment) >= 2 and segment in normalized_token:
                        abbreviation_score = (1, place_depth, 1, index, importance, token_len)
                        if score is None or abbreviation_score > score:
                            score = abbreviation_score
            if score is None:
                continue
            if best is None or score > best:
                best = score
        if best is not None:
            candidates.append((best, place))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def description_text(place: dict) -> str:
    desc = place.get("description") or {}
    detail = str(desc.get("detail") or "").strip()
    if detail:
        return detail
    return str(desc.get("brief") or "").strip()


def top_scope(place: dict, place_by_id: dict[str, dict]) -> dict:
    current = place
    seen: set[str] = set()
    while current.get("parent") and current["id"] not in seen:
        seen.add(current["id"])
        parent_id = current.get("parent")
        if not isinstance(parent_id, str):
            break
        parent = place_by_id.get(parent_id)
        if not parent:
            break
        if parent.get("id") == "continent":
            return current
        current = parent
    return current


def route_sort_key(item: dict) -> tuple[int, int, int, str]:
    days = item["segment"].get("days")
    known_days = 0 if isinstance(days, int) else 1
    day_value = days if isinstance(days, int) else 9999
    target = item.get("target") or item.get("anchor") or item.get("example_target") or {}
    name = str(target.get("name") or "") if isinstance(target, dict) else ""
    return (-int(item["edge"].get("importance") or 0), known_days, day_value, name)


def safe_node_id(prefix: str, raw: str) -> str:
    normalized = []
    for ch in raw:
        normalized.append(ch if ch.isalnum() else "_")
    return f"{prefix}_{''.join(normalized)}"


def place_node_id(place: dict) -> str:
    return safe_node_id("place", place["id"])


def label_text(*parts: object) -> str:
    values = [str(part).strip() for part in parts if str(part).strip()]
    return "<br/>".join(values)


def reverse_direction(direction: str) -> str:
    parts = [part.strip() for part in direction.split("-")]
    if len(parts) == 2 and all(parts):
        return f"{parts[1]}-{parts[0]}"
    return direction


def edge_label(segment: dict, reversed_order: bool = False) -> str:
    parts = []
    transport = str(segment.get("transport") or "")
    if transport:
        parts.append(transport)
    days = segment.get("days")
    if isinstance(days, int):
        parts.append(f"{days}d")
    elif days is None:
        parts.append("days?")
    terrain = "/".join(str(v) for v in (segment.get("terrain") or []) if str(v).strip())
    if terrain:
        parts.append(terrain)
    direction = str(segment.get("direction") or "").strip()
    if direction:
        if reversed_order:
            direction = reverse_direction(direction)
        parts.append(direction)
    return ", ".join(parts)


def short_summary(place: dict) -> str:
    desc = place.get("description") or {}
    return str(desc.get("brief") or desc.get("detail") or "").strip()


def top_edge_sort_key(item: dict) -> tuple[int, int, int, str]:
    days = item["segment"].get("days")
    known_days = 0 if isinstance(days, int) else 1
    day_value = days if isinstance(days, int) else 9999
    return (-int(item["edge"].get("importance") or 0), known_days, day_value, item["to_top"]["name"])


def build_output(query: str, places: list[dict], edges: list[dict]) -> str:
    place_by_id = {place["id"]: place for place in places if place.get("id")}

    current = match_place(query, places, place_by_id)
    if not current:
        return "flowchart LR\n  no_match[\"unmatched location\"]"

    adjacency: dict[str, list[dict]] = defaultdict(list)
    for edge in edges:
        from_id = edge.get("from")
        to_id = edge.get("to")
        if not isinstance(from_id, str) or not isinstance(to_id, str):
            continue
        if from_id not in place_by_id or to_id not in place_by_id:
            continue
        for segment in edge.get("segments") or []:
            adjacency[from_id].append({"edge": edge, "segment": segment, "from": from_id, "to": to_id, "reversed": False})
            adjacency[to_id].append({"edge": edge, "segment": segment, "from": to_id, "to": from_id, "reversed": True})

    lines = ["flowchart LR", "  %% 路线标签：交通 天数 地形 左端方位-右端方位；区域边按标签中的地点顺序读方位；路线本身双向。"]
    seen_nodes: set[str] = set()
    seen_edges: set[tuple[str, str, str]] = set()

    def add_node(node_id: str, text: str, shape: str = "[]") -> None:
        if node_id in seen_nodes:
            return
        seen_nodes.add(node_id)
        if shape == "()":
            lines.append(f"  {node_id}(\"{text}\")")
        elif shape == "{}":
            lines.append(f"  {node_id}{{\"{text}\"}}")
        else:
            lines.append(f"  {node_id}[\"{text}\"]")

    def add_edge(from_id: str, to_id: str, label: str, arrow: str = "-->") -> None:
        key = (from_id, to_id, label)
        if key in seen_edges:
            return
        seen_edges.add(key)
        lines.append(f"  {from_id} {arrow}|{label}| {to_id}")

    current_id = place_node_id(current)
    current_top = top_scope(current, place_by_id)
    ancestors = parent_chain(current, place_by_id)[:3]

    one_hop: dict[str, dict] = {}
    one_hop_edges: list[dict] = []
    for item in adjacency.get(current["id"], []):
        target = place_by_id[item["to"]]
        one_hop[target["id"]] = target
        one_hop_edges.append(item)

    two_hop: dict[str, dict] = {}
    two_hop_edges: list[dict] = []
    for neighbor_id in sorted(one_hop):
        candidates = []
        for item in adjacency.get(neighbor_id, []):
            target_id = item["to"]
            if target_id == current["id"] or target_id in one_hop:
                continue
            candidates.append({**item, "via": neighbor_id})
        candidates.sort(key=lambda item: route_sort_key({"edge": item["edge"], "segment": item["segment"], "target": place_by_id[item["to"]]}))
        for item in candidates[:4]:
            target = place_by_id[item["to"]]
            two_hop[target["id"]] = target
            two_hop_edges.append(item)

    visible_places: dict[str, dict] = {current["id"]: current}
    visible_places.update(one_hop)
    visible_places.update(two_hop)
    for ancestor in ancestors:
        visible_places[ancestor["id"]] = ancestor

    region_places: dict[str, dict] = {}
    for place in visible_places.values():
        top = top_scope(place, place_by_id)
        if top["id"] != "continent":
            region_places[top["id"]] = top

    lines.append("  subgraph CURRENT[当前位置]")
    add_node(current_id, label_text(current["name"], short_summary(current)), "()")
    lines.append("  end")

    lines.append("  subgraph HIERARCHY[层级]")
    previous_id = current_id
    for ancestor in ancestors:
        ancestor_id = place_node_id(ancestor)
        add_node(ancestor_id, ancestor["name"])
        add_edge(previous_id, ancestor_id, "parent")
        previous_id = ancestor_id
    lines.append("  end")

    lines.append("  subgraph ONE_HOP[一跳]")
    for place in sorted(one_hop.values(), key=lambda item: item["name"]):
        node_id = place_node_id(place)
        add_node(node_id, label_text(place["name"], top_scope(place, place_by_id)["name"]))
    for item in sorted(one_hop_edges, key=lambda item: route_sort_key({"edge": item["edge"], "segment": item["segment"], "target": place_by_id[item["to"]]})):
        add_edge(current_id, place_node_id(place_by_id[item["to"]]), edge_label(item["segment"], item.get("reversed", False)), "---")
    lines.append("  end")

    lines.append("  subgraph TWO_HOP[二跳]")
    for place in sorted(two_hop.values(), key=lambda item: item["name"]):
        node_id = place_node_id(place)
        add_node(node_id, label_text(place["name"], top_scope(place, place_by_id)["name"]))
    for item in sorted(two_hop_edges, key=lambda item: route_sort_key({"edge": item["edge"], "segment": item["segment"], "target": place_by_id[item["to"]]}))[:30]:
        add_edge(place_node_id(place_by_id[item["from"]]), place_node_id(place_by_id[item["to"]]), edge_label(item["segment"], item.get("reversed", False)), "---")
    lines.append("  end")

    lines.append("  subgraph REGIONS[区域锚点]")
    for region in sorted(region_places.values(), key=lambda place: (-int(place.get("importance") or 0), place["name"])):
        region_id = safe_node_id("region", region["id"])
        add_node(region_id, label_text(region["name"], short_summary(region)), "{}")
    for place in sorted(visible_places.values(), key=lambda item: item["name"]):
        if place["id"] in {ancestor["id"] for ancestor in ancestors}:
            continue
        region = top_scope(place, place_by_id)
        add_edge(place_node_id(place), safe_node_id("region", region["id"]), "belongs_to", "-.-")

    region_edges: dict[tuple[str, str], dict] = {}
    for edge in edges:
        from_id = edge.get("from")
        to_id = edge.get("to")
        if not isinstance(from_id, str) or not isinstance(to_id, str):
            continue
        if from_id not in place_by_id or to_id not in place_by_id:
            continue
        from_top = top_scope(place_by_id[from_id], place_by_id)
        to_top = top_scope(place_by_id[to_id], place_by_id)
        if from_top["id"] == to_top["id"]:
            continue
        if from_top["id"] not in region_places or to_top["id"] not in region_places:
            continue
        for segment in edge.get("segments") or []:
            key = (from_top["id"], to_top["id"])
            candidate = {
                "edge": edge,
                "segment": segment,
                "from_top": from_top,
                "to_top": to_top,
                "from_place": place_by_id[from_id],
                "to_place": place_by_id[to_id],
            }
            previous = region_edges.get(key)
            if previous is None or top_edge_sort_key(candidate) < top_edge_sort_key(previous):
                region_edges[key] = candidate
    for item in sorted(region_edges.values(), key=top_edge_sort_key)[:16]:
        source_id = safe_node_id("region", item["from_top"]["id"])
        target_id = safe_node_id("region", item["to_top"]["id"])
        label = f"{item['from_place']['name']}->{item['to_place']['name']}, {edge_label(item['segment'])}"
        add_edge(source_id, target_id, label, "---")
    lines.append("  end")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render runtime geography as Mermaid flowchart")
    parser.add_argument("query", help="Current location text to match against place names and keywords")
    parser.add_argument("--places", type=Path, default=DATA_DIR / "places.yaml")
    parser.add_argument("--edges", type=Path, default=DATA_DIR / "edges.yaml")
    args = parser.parse_args()

    places = load_yaml(args.places).get("places", [])
    edges = load_yaml(args.edges).get("edges", [])
    print(build_output(args.query, places, edges))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
