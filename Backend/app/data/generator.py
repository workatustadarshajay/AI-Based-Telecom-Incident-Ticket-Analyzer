"""Synthetic telecom incident data generation (report 3.3, 5.3).

Template families with controlled randomization, ~20% hard edge cases, and a locked
dev/test split (report 3.7: test set is never used for prompt tuning).
"""
import random
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

from app.data.schemas import (
    NETWORK_TYPES,
    REGIONS,
    SERVICES,
    Severity,
)

TOTAL_TICKETS = 500          # ~300 dev + ~200 test (user decision)
DEV_FRACTION = 0.6
EDGE_CASE_FRACTION = 0.20    # report 5.3: edge cases avoid misleadingly high results
SEED = 42

# Template fragments per category. Each template combines technology, region, service,
# symptom phrase and user impact so similar incidents use different wording (report 1.1).
TEMPLATES: dict[str, list[str]] = {
    "Network Outage": [
        "Multiple customers in {region} report complete loss of {network} data service after a base-station alarm.",
        "Total service outage in {region}: all {service} users ({n} users) offline since site alarm fired.",
        "Broad {network} outage confirmed by alarms; {service} unavailable across multiple sites in {region}.",
        "Emergency: {region} cell site down, {n} users with no service at all.",
    ],
    "Connectivity Issue": [
        "A group of customers in {region} cannot connect to {network}; data service partially available elsewhere.",
        "Single site shows intermittent connectivity and repeated backhaul link alarms in {region}.",
        "Users report their devices fail to attach to the {network} network in {region} during peak hours.",
        "Handover failures between sites in {region} cause dropped connections on {network}.",
    ],
    "Performance Degradation": [
        "Users report increased latency and slow {service} throughput during evening hours in {region}.",
        "High packet loss (up to 8%) and degraded throughput observed on {network} backhaul in {region}.",
        "Throughput on {network} in {region} down 40% versus baseline; latency elevated for {n} users.",
        "Slow browsing and video buffering complaints from {region} with no corresponding outage alarm.",
    ],
    "Voice Service Issue": [
        "A group of customers cannot complete VoLTE calls while data service remains available in {region}.",
        "Voice call drops spike in {region}; call setup failures observed on VoLTE, data unaffected.",
        "Subscribers in {region} report one-way audio on VoLTE calls for the last hour.",
        "Voice service degraded in {region}: 30% call failure rate on {network} voice.",
    ],
    "Infrastructure Issue": [
        "Tower power failure reported at {region} site; site running on backup batteries for 2 hours.",
        "Physical damage to fiber cabinet in {region} affecting {n} users of {service}.",
        "Site in {region} unreachable by NMS; suspected hardware failure of transmission equipment.",
        "Cooling failure at {region} data center rack; equipment shutdown risk.",
    ],
    "Configuration Issue": [
        "Incorrect VLAN configuration applied to {region} aggregation ring causing service reachability issues.",
        "Misconfigured QoS policy in {region} throttles {service} traffic below contracted rates.",
        "Routing table inconsistency after maintenance in {region}; traffic taking suboptimal path.",
        "Wrong scheduler profile pushed to {region} sites; {service} capacity reduced.",
    ],
    "Unknown / Other": [
        "Customer complaint about unexplained service behavior, details unclear.",
        "Ticket description incomplete: region unknown, symptoms vague, no alarm data.",
    ],
}

# Per-category affected-user ranges (drives severity reference labels, report Table 6)
USER_RANGES: dict[str, tuple[int, int]] = {
    "Network Outage": (800, 5000),
    "Connectivity Issue": (150, 900),
    "Performance Degradation": (50, 600),
    "Voice Service Issue": (100, 800),
    "Infrastructure Issue": (100, 1200),
    "Configuration Issue": (80, 700),
    "Unknown / Other": (0, 200),
}

# Reference severity assignment follows report Table 6 illustrative rules
CATEGORY_BASE_SEVERITY: dict[str, str] = {
    "Network Outage": Severity.CRITICAL.value,
    "Connectivity Issue": Severity.HIGH.value,
    "Performance Degradation": Severity.MEDIUM.value,
    "Voice Service Issue": Severity.HIGH.value,
    "Infrastructure Issue": Severity.HIGH.value,
    "Configuration Issue": Severity.MEDIUM.value,
    "Unknown / Other": Severity.LOW.value,
}

ALARM_CODES = [
    ("ALM-CELL-DOWN", "Cell unavailable"),
    ("ALM-BACKHAUL-LOS", "Backhaul link loss of signal"),
    ("ALM-POWER-FAIL", "External power failure"),
    ("ALM-VOLTE-REG", "VoLTE registration failures"),
    ("ALM-PKTLOSS-HIGH", "Packet loss threshold exceeded"),
    ("ALM-CFG-DRIFT", "Configuration drift detected"),
]


def _weighted_categories(rng: random.Random) -> dict[str, float]:
    """Realistic, mildly imbalanced distribution (report 6.1 discusses imbalance)."""
    return {
        "Network Outage": 0.14,
        "Connectivity Issue": 0.18,
        "Performance Degradation": 0.20,
        "Voice Service Issue": 0.14,
        "Infrastructure Issue": 0.12,
        "Configuration Issue": 0.12,
        "Unknown / Other": 0.10,
    }


def generate_tickets(n: int = TOTAL_TICKETS, seed: int = SEED) -> pd.DataFrame:
    rng = random.Random(seed)
    weights = _weighted_categories(rng)
    categories = list(weights.keys())
    rows: list[dict] = []
    base_time = datetime(2026, 9, 1, 8, 0, 0)

    for i in range(1, n + 1):
        is_edge = rng.random() < EDGE_CASE_FRACTION
        if is_edge:
            # Edge cases: ambiguous phrasing, vague fields, wrong-ish clues
            category = rng.choice(categories)
            desc = TEMPLATES[category][rng.randrange(len(TEMPLATES[category]))]
            if rng.random() < 0.5:
                desc = desc + " (Details unconfirmed by monitoring.)"
        else:
            category = rng.choices(categories, weights=list(weights.values()))[0]
            desc = TEMPLATES[category][rng.randrange(len(TEMPLATES[category]))]

        network = rng.choice(NETWORK_TYPES)
        region = rng.choice(REGIONS)
        service = rng.choice(SERVICES)
        lo, hi = USER_RANGES[category]
        affected = rng.randint(lo, hi)
        ts = base_time + timedelta(minutes=rng.randint(0, 60 * 24 * 28))

        rows.append(
            {
                "ticket_id": f"TKT-{i:04d}",
                "timestamp": ts.strftime("%Y-%m-%d %H:%M"),
                "network_type": network,
                "region": region,
                "service": service,
                "description": desc.format(
                    region=region, network=network, service=service, n=affected
                ),
                "category": category,
                "severity": CATEGORY_BASE_SEVERITY[category],
                "affected_users": affected,
                "status": "Open",
                "split": "dev" if rng.random() < DEV_FRACTION else "test",
            }
        )

    df = pd.DataFrame(rows)
    return df


def generate_outage_logs(tickets: pd.DataFrame, seed: int = SEED) -> pd.DataFrame:
    """Structured outage logs joinable by ticket (report 3.2 second data source)."""
    rng = random.Random(seed + 1)
    rows = []
    for _, t in tickets.iterrows():
        if rng.random() < 0.45:  # not every ticket has a log
            continue
        code, message = rng.choice(ALARM_CODES)
        start = datetime.strptime(t["timestamp"], "%Y-%m-%d %H:%M")
        ongoing = rng.random() < 0.3
        end = None if ongoing else (start + timedelta(minutes=rng.randint(15, 480)))
        rows.append(
            {
                "log_id": f"LOG-{rng.randint(100000, 999999)}",
                "ticket_id": t["ticket_id"],
                "site_id": f"SITE-{t['region'][-1]}{rng.randint(100, 999)}",
                "region": t["region"],
                "network_type": t["network_type"],
                "alarm_code": code,
                "alarm_message": message,
                "start_time": start.strftime("%Y-%m-%d %H:%M"),
                "end_time": end.strftime("%Y-%m-%d %H:%M") if end else "ongoing",
                "affected_cells": rng.randint(1, 12),
            }
        )
    return pd.DataFrame(rows)


def save_datasets(out_dir: Path) -> dict[str, Path]:
    """Generate + persist datasets and the separately-stored reference labels (3.7 rule 12)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    labels_dir = out_dir / "labels"
    labels_dir.mkdir(exist_ok=True)

    tickets = generate_tickets()
    logs = generate_outage_logs(tickets)

    tickets_path = out_dir / "tickets.csv"
    logs_path = out_dir / "outage_logs.csv"
    tickets.to_csv(tickets_path, index=False)
    logs.to_csv(logs_path, index=False)

    # Reference labels stored separately from prompt-visible data
    tickets[["ticket_id", "category", "severity"]].to_csv(
        labels_dir / "reference_labels.csv", index=False
    )

    dev = tickets[tickets["split"] == "dev"]
    test = tickets[tickets["split"] == "test"]
    dev.to_csv(out_dir / "tickets_dev.csv", index=False)
    test.to_csv(out_dir / "tickets_test.csv", index=False)

    return {
        "tickets": tickets_path,
        "logs": logs_path,
        "dev": out_dir / "tickets_dev.csv",
        "test": out_dir / "tickets_test.csv",
        "labels": labels_dir / "reference_labels.csv",
    }


if __name__ == "__main__":
    paths = save_datasets(Path(__file__).resolve().parents[2] / "data")
    t = pd.read_csv(paths["tickets"])
    print(f"tickets: {len(t)}  (dev={len(t[t.split == 'dev'])}, test={len(t[t.split == 'test'])})")
    print(t.groupby(['category', 'split']).size().unstack(fill_value=0))
    print("severity:", t['severity'].value_counts().to_dict())
