#!/usr/bin/env python3

from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

import yaml

from render_runtime_geo_mermaid import (
    description_text,
    match_place,
    parent_chain,
    route_sort_key,
    short_summary,
    top_edge_sort_key,
    top_scope,
)


ROOT = Path(__file__).resolve().parents[3]
COMPACT_DIR = ROOT / "dist" / "local" / "geography" / "compact"


def load_yaml(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


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
        parts.append("?d")
    terrain = "/".join(str(v) for v in (segment.get("terrain") or []) if str(v).strip())
    if terrain:
        parts.append(terrain)
    direction = str(segment.get("direction") or "").strip()
    if direction:
        if reversed_order:
            direction = reverse_direction(direction)
        parts.append(direction)
    return " ".join(parts)


def node_label(place: dict, include_summary: bool = False) -> str:
    if include_summary:
        summary = short_summary(place)
        if summary:
            return f"{place['name']}<br/>{summary}"
    return place["name"]


def build_region_fallback(places: list[dict], edges: list[dict], place_by_id: dict[str, dict]) -> str:
    region_places = {
        place["id"]: place
        for place in places
        if place.get("parent") == "continent" and int(place.get("importance") or 0) >= 3
    }
    if not region_places:
        return "flowchart LR\n  n0[\"unmatched\"]"

    node_ids: dict[str, str] = {}

    def nid(key: str) -> str:
        if key not in node_ids:
            node_ids[key] = f"n{len(node_ids)}"
        return node_ids[key]

    lines = [
        "flowchart LR",
        "  %% 路线标签：默认交通方式 所需天数 地形 左端方位-右端方位；区域边按标签中的地点顺序读方位；路线本身双向。",
        "  subgraph R[REGIONS]",
    ]
    emitted_nodes: set[str] = set()
    emitted_edges: set[tuple[str, str, str, str]] = set()

    def add_node(key: str, label: str) -> str:
        node_id = nid(key)
        if node_id in emitted_nodes:
            return node_id
        emitted_nodes.add(node_id)
        lines.append(f"  {node_id}{{\"{label}\"}}")
        return node_id

    def add_edge(src: str, dst: str, label: str, arrow: str = "---") -> None:
        key = (src, dst, label, arrow)
        if key in emitted_edges:
            return
        emitted_edges.add(key)
        lines.append(f"  {src} {arrow}|{label}| {dst}")

    for region in sorted(region_places.values(), key=lambda place: (-int(place.get("importance") or 0), place["name"])):
        add_node(f"region:{region['id']}", node_label(region, include_summary=True))

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
        src = add_node(f"region:{item['from_top']['id']}", item["from_top"]["name"])
        dst = add_node(f"region:{item['to_top']['id']}", item["to_top"]["name"])
        label = f"{item['from_place']['name']}→{item['to_place']['name']} {edge_label(item['segment'])}"
        add_edge(src, dst, label, "---")
    lines.append("  end")
    return "\n".join(lines)


def build_output(query: str, places: list[dict], edges: list[dict]) -> str:
    place_by_id = {place["id"]: place for place in places if place.get("id")}
    current = match_place(query, places, place_by_id)
    if not current:
        return build_region_fallback(places, edges, place_by_id)

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

    node_ids: dict[str, str] = {}

    def nid(key: str) -> str:
        if key not in node_ids:
            node_ids[key] = f"n{len(node_ids)}"
        return node_ids[key]

    lines = ["flowchart LR", "  %% 路线标签：交通 天数 地形 左端方位-右端方位；区域边按标签中的地点顺序读方位；路线本身双向。"]
    emitted_nodes: set[str] = set()
    emitted_edges: set[tuple[str, str, str, str]] = set()

    def add_node(key: str, label: str, shape: str = "[]") -> str:
        node_id = nid(key)
        if node_id in emitted_nodes:
            return node_id
        emitted_nodes.add(node_id)
        if shape == "()":
            lines.append(f"  {node_id}(\"{label}\")")
        elif shape == "{}":
            lines.append(f"  {node_id}{{\"{label}" + "\"}")
        else:
            lines.append(f"  {node_id}[\"{label}\"]")
        return node_id

    def add_edge(src: str, dst: str, label: str, arrow: str = "-->") -> None:
        key = (src, dst, label, arrow)
        if key in emitted_edges:
            return
        emitted_edges.add(key)
        lines.append(f"  {src} {arrow}|{label}| {dst}")

    ancestors = parent_chain(current, place_by_id)[:3]
    one_hop: dict[str, dict] = {}
    one_edges: list[dict] = []
    for item in adjacency[current["id"]]:
        target = place_by_id[item["to"]]
        one_hop[target["id"]] = target
        one_edges.append(item)

    two_hop: dict[str, dict] = {}
    two_edges: list[dict] = []
    for neighbor_id in sorted(one_hop):
        candidates = []
        for item in adjacency[neighbor_id]:
            target_id = item["to"]
            if target_id == current["id"] or target_id in one_hop:
                continue
            candidates.append(item)
        candidates.sort(key=lambda item: route_sort_key({"edge": item["edge"], "segment": item["segment"], "target": place_by_id[item["to"]]}))
        for item in candidates[:4]:
            two_hop[item["to"]] = place_by_id[item["to"]]
            two_edges.append(item)

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
    for place in places:
        if place.get("parent") == "continent" and int(place.get("importance") or 0) >= 3:
            region_places[place["id"]] = place

    lines.append("  subgraph C[CURRENT]")
    current_node = add_node(current["id"], node_label(current, include_summary=True), "()")
    lines.append("  end")

    lines.append("  subgraph H[HIERARCHY]")
    previous = current_node
    for ancestor in ancestors:
        ancestor_node = add_node(ancestor["id"], ancestor["name"])
        add_edge(previous, ancestor_node, "parent")
        previous = ancestor_node
    lines.append("  end")

    lines.append("  subgraph N1[1-HOP]")
    for place in sorted(one_hop.values(), key=lambda item: item["name"]):
        add_node(place["id"], place["name"])
    for item in sorted(one_edges, key=lambda item: route_sort_key({"edge": item["edge"], "segment": item["segment"], "target": place_by_id[item["to"]]})):
        add_edge(current_node, add_node(item["to"], place_by_id[item["to"]]["name"]), edge_label(item["segment"], item.get("reversed", False)), "---")
    lines.append("  end")

    lines.append("  subgraph N2[2-HOP]")
    for place in sorted(two_hop.values(), key=lambda item: item["name"]):
        add_node(place["id"], place["name"])
    for item in sorted(two_edges, key=lambda item: route_sort_key({"edge": item["edge"], "segment": item["segment"], "target": place_by_id[item["to"]]}))[:30]:
        add_edge(add_node(item["from"], place_by_id[item["from"]]["name"]), add_node(item["to"], place_by_id[item["to"]]["name"]), edge_label(item["segment"], item.get("reversed", False)), "---")
    lines.append("  end")

    lines.append("  subgraph R[REGIONS]")
    for region in sorted(region_places.values(), key=lambda place: (-int(place.get("importance") or 0), place["name"])):
        add_node(f"region:{region['id']}", node_label(region, include_summary=True), "{}")
    # current、全部一跳与全部二跳可见地点各自直连其 topScope；祖先仅保留在 HIERARCHY，不输出 belongs_to。
    ancestor_ids = {ancestor["id"] for ancestor in ancestors}
    for place in visible_places.values():
        if place["id"] in ancestor_ids:
            continue
        top = top_scope(place, place_by_id)
        if top["id"] == "continent" or top["id"] not in region_places:
            continue
        add_edge(
            add_node(place["id"], place["name"]),
            add_node(f"region:{top['id']}", region_places[top["id"]]["name"], "{}"),
            "belongs_to",
            "-.-",
        )

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
        src = add_node(f"region:{item['from_top']['id']}", item["from_top"]["name"], "{}")
        dst = add_node(f"region:{item['to_top']['id']}", item["to_top"]["name"], "{}")
        label = f"{item['from_place']['name']}→{item['to_place']['name']} {edge_label(item['segment'])}"
        add_edge(src, dst, label, "---")
    lines.append("  end")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Render compact runtime geography as Mermaid flowchart")
    parser.add_argument("query", help="Current location text to match against place names and keywords")
    parser.add_argument("--places", type=Path, default=COMPACT_DIR / "place.yaml")
    parser.add_argument("--edges", type=Path, default=COMPACT_DIR / "edges.yaml")
    args = parser.parse_args()

    places = load_yaml(args.places).get("places", [])
    edges = load_yaml(args.edges).get("edges", [])
    print(build_output(args.query, places, edges))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
