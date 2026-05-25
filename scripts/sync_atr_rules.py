"""Sync Agent Threat Rules from the upstream ATR repository.

Clones the ATR rules repo (rules/ only), converts YAML rules to JSON
format matching the Rust agent's detection engine, and writes the
output to agent/atr_rules.json.
"""

from __future__ import annotations

import sys
import json
import argparse
from pathlib import Path

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Install with: pip install pyyaml", file=sys.stderr)
    sys.exit(1)


CATEGORY_MAP = {
    "prompt-injection": "injection",
    "agent-manipulation": "social_engineering",
    "context-exfiltration": "code_execution",
    "skill-compromise": "skill_compromise",
    "tool-poisoning": "code_execution",
    "privilege-escalation": "code_execution",
    "model-abuse": "model_abuse",
    "model-security": "model_abuse",
    "excessive-autonomy": "excessive_autonomy",
    "data-poisoning": "data_poisoning",
}


def map_category(atr_category: str) -> str:
    """Map ATR category string to the agent's internal category."""
    return CATEGORY_MAP.get(atr_category, atr_category)


def convert_rule(rule: dict) -> dict | None:
    """Convert a parsed ATR YAML rule into the agent's JSON format."""
    rule_id = rule.get("id")
    if not rule_id:
        return None
    title = rule.get("title", rule_id)
    severity = rule.get("severity", "medium")
    tags = rule.get("tags", {})
    category = map_category(tags.get("category", "injection"))

    detection = rule.get("detection", {})
    conditions_raw = detection.get("conditions", [])

    patterns = []

    if isinstance(conditions_raw, list):
        for cond in conditions_raw:
            if not isinstance(cond, dict):
                continue
            value = cond.get("value", "")
            if value:
                patterns.append({
                    "regex": value,
                    "description": cond.get("description", ""),
                    "field": cond.get("field", "user_input"),
                })
    elif isinstance(conditions_raw, dict):
        for val in conditions_raw.values():
            if isinstance(val, list):
                for cond in val:
                    if not isinstance(cond, dict):
                        continue
                    value = cond.get("value", "")
                    if value:
                        patterns.append({
                            "regex": value,
                            "description": cond.get("description", ""),
                            "field": cond.get("field", "user_input"),
                        })

    if not patterns:
        return None

    return {
        "id": rule_id,
        "title": title,
        "severity": severity,
        "category": category,
        "patterns": patterns,
    }


def main() -> None:
    """Entry point: parse args, convert YAML rules, write JSON output."""
    parser = argparse.ArgumentParser(description="Sync ATR rules from cloned repo")
    parser.add_argument("--atr-dir", required=True, help="Path to cloned ATR rules repo")
    parser.add_argument("--output", required=True, help="Path to output JSON file")
    args = parser.parse_args()

    rules_dir = Path(args.atr_dir) / "rules"
    if not rules_dir.is_dir():
        print(f"Error: rules directory not found at {rules_dir}", file=sys.stderr)
        sys.exit(1)

    all_rules = []

    for category_dir in sorted(rules_dir.iterdir()):
        if not category_dir.is_dir():
            continue
        for yaml_file in sorted(category_dir.glob("*.yaml")):
            try:
                with open(yaml_file, "r", encoding="utf-8") as f:
                    try:
                        data = yaml.safe_load(f)
                    except yaml.YAMLError as e:
                        print(f"Warning: failed to parse {yaml_file}: {e}", file=sys.stderr)
                        continue
            except OSError as e:
                print(f"Warning: skipping {yaml_file}: {e}", file=sys.stderr)
                continue
            if not isinstance(data, dict):
                continue
            rule = convert_rule(data)
            if rule is not None:
                all_rules.append(rule)

    all_rules.sort(key=lambda r: r["id"])

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(all_rules, f, indent=2, ensure_ascii=False)

    print(f"Synced {len(all_rules)} ATR rules to {output_path}")


if __name__ == "__main__":
    main()
