"""
Generate lightweight JSON summaries used by the San Francisco resource dashboard.

Run from project root:

    python3 scripts/preprocess_data.py
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, Tuple, List, Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
PROCESSED_DIR.mkdir(exist_ok=True)


def load_neighborhood_centroid_lookup() -> Dict[str, Dict[str, float]]:
    """Return mapping of neighborhood name to centroid coordinates if available."""
    centroid_path = PROCESSED_DIR / "neighborhood_centroids.json"
    if not centroid_path.exists():
        return {}
    try:
        payload = json.loads(centroid_path.read_text())
    except json.JSONDecodeError:
        return {}
    lookup: Dict[str, Dict[str, float]] = {}
    for entry in payload.get("entries", []):
        centroid = entry.get("centroid")
        if centroid and "lat" in centroid and "lon" in centroid:
            lookup[entry.get("neighborhood", "")] = {
                "lat": float(centroid["lat"]),
                "lon": float(centroid["lon"]),
            }
    return lookup


def load_business_centroids() -> Dict[str, Dict[str, float]]:
    """Return mapping of ZIP code to centroid coordinates from processed businesses."""
    biz_path = PROCESSED_DIR / "business_by_zip.json"
    if not biz_path.exists():
        return {}
    try:
        payload = json.loads(biz_path.read_text())
    except json.JSONDecodeError:
        return {}
    lookup: Dict[str, Dict[str, float]] = {}
    for entry in payload.get("entries", []):
        centroid = entry.get("centroid")
        zip_code = entry.get("zip")
        if not centroid or not zip_code:
            continue
        try:
            lookup[zip_code] = {
                "lat": float(centroid["lat"]),
                "lon": float(centroid["lon"]),
            }
        except (TypeError, ValueError, KeyError):
            continue
    return lookup


def load_csv(path: Path) -> Iterable[Dict[str, str]]:
    with path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            yield row


def preprocess_businesses() -> None:
    path = DATA_DIR / "Registered_Business_Locations_-_San_Francisco_20251027.csv"
    if not path.exists():
        return

    business_by_zip: Dict[str, Dict] = {}
    business_by_neighborhood: Dict[str, Dict] = {}
    naics_rollup: Counter[str] = Counter()
    zip_neighborhoods: Dict[str, Counter[str]] = defaultdict(Counter)

    for row in load_csv(path):
        if row.get("City") != "San Francisco":
            continue
        zipcode = (row.get("Source Zipcode") or "").strip()
        neighborhood = (row.get("Neighborhoods - Analysis Boundaries") or "").strip()
        naics_desc = (row.get("NAICS Code Description") or "").strip()

        if zipcode:
            entry = business_by_zip.setdefault(
                zipcode,
                {"count": 0, "sectors": Counter()},
            )
            entry["count"] += 1
            if naics_desc:
                entry["sectors"][naics_desc] += 1
            if neighborhood:
                zip_neighborhoods[zipcode][neighborhood] += 1

        if neighborhood:
            entry = business_by_neighborhood.setdefault(
                neighborhood,
                {"count": 0},
            )
            entry["count"] += 1

        if naics_desc:
            naics_rollup[naics_desc] += 1

    total_businesses = sum(info["count"] for info in business_by_zip.values())
    total_businesses = total_businesses or 1

    neighborhood_centroids = load_neighborhood_centroid_lookup()

    biz_zip_output = []
    for zipcode, info in sorted(business_by_zip.items(), key=lambda x: (-x[1]["count"], x[0])):
        share = info["count"] / total_businesses
        top_sectors = [{"sector": name, "count": count} for name, count in info["sectors"].most_common(3)]
        top_neighborhoods = [
            {"neighborhood": name, "count": count} for name, count in zip_neighborhoods.get(zipcode, Counter()).most_common(3)
        ]

        centroid = None
        weights = zip_neighborhoods.get(zipcode, Counter())
        if weights:
            lat_sum = 0.0
            lon_sum = 0.0
            total_weight = 0
            for neighborhood, weight in weights.items():
                coords = neighborhood_centroids.get(neighborhood)
                if not coords:
                    continue
                lat_sum += coords["lat"] * weight
                lon_sum += coords["lon"] * weight
                total_weight += weight
            if total_weight:
                centroid = {
                    "lat": round(lat_sum / total_weight, 6),
                    "lon": round(lon_sum / total_weight, 6),
                }

        biz_zip_output.append(
            {
                "zip": zipcode,
                "business_count": info["count"],
                "share_of_city": round(share, 5),
                "top_sectors": top_sectors,
                "top_neighborhoods": top_neighborhoods,
                "centroid": centroid,
            }
        )

    (PROCESSED_DIR / "business_by_zip.json").write_text(
        json.dumps(
            {
                "total_businesses": total_businesses,
                "top_naics_citywide": [{"sector": name, "count": count} for name, count in naics_rollup.most_common(10)],
                "entries": biz_zip_output,
            },
            indent=2,
        )
    )

    biz_neighborhood_output = [
        {"neighborhood": name, "business_count": info["count"]}
        for name, info in sorted(business_by_neighborhood.items(), key=lambda x: -x[1]["count"])
    ]

    (PROCESSED_DIR / "business_neighborhoods.json").write_text(
        json.dumps({"entries": biz_neighborhood_output}, indent=2)
    )


def preprocess_parks() -> None:
    path = DATA_DIR / "Recreation_and_Parks_Properties_20251027.csv"
    if not path.exists():
        return

    csv.field_size_limit(15_000_000)
    parks_output = []
    acres_by_district: Dict[str, float] = defaultdict(float)
    centroid_by_neighborhood: Dict[str, Tuple[float, float, int]] = defaultdict(lambda: (0.0, 0.0, 0))
    address_points = []

    def size_category(acres: float) -> str:
        if acres >= 100:
            return "Regional Park (100+ acres)"
        if acres >= 10:
            return "Neighborhood Park (10-99 acres)"
        return "Mini Park (<10 acres)"

    number_pattern = re.compile(r"\d+")

    with path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            try:
                lon = float((row.get("longitude") or "").strip())
                lat = float((row.get("latitude") or "").strip())
            except ValueError:
                continue

            acres_str = (row.get("acres") or "0").replace(",", "")
            try:
                acres = float(acres_str)
            except ValueError:
                acres = 0.0

            neighborhood = (row.get("analysis_neighborhood") or "").strip()
            if neighborhood:
                lon_sum, lat_sum, count = centroid_by_neighborhood[neighborhood]
                centroid_by_neighborhood[neighborhood] = (lon_sum + lon, lat_sum + lat, count + 1)

            districts = number_pattern.findall(row.get("supdist") or "")
            if districts:
                share = acres / len(districts) if districts else 0.0
                for district in districts:
                    acres_by_district[district] += share

            parks_output.append(
                {
                    "name": row.get("property_name"),
                    "acres": round(acres, 2),
                    "category": size_category(acres),
                    "type": row.get("propertytype"),
                    "districts": districts,
                    "coordinates": {"lat": lat, "lon": lon},
                }
            )
            if row.get("address"):
                address_points.append(
                    {
                        "label": row.get("property_name"),
                        "address": row.get("address"),
                        "zip": (row.get("zipcode") or "").strip(),
                        "type": "Park",
                        "coordinates": {"lat": lat, "lon": lon},
                    }
                )

    (PROCESSED_DIR / "parks.json").write_text(
        json.dumps({"entries": parks_output}, indent=2)
    )

    district_summary = [
        {"district": district, "total_acres": round(total, 2)}
        for district, total in sorted(acres_by_district.items(), key=lambda x: int(x[0]))
    ]

    (PROCESSED_DIR / "park_acres_by_district.json").write_text(
        json.dumps({"entries": district_summary}, indent=2)
    )

    centroids = []
    for name, (lon_sum, lat_sum, count) in centroid_by_neighborhood.items():
        if count:
            centroids.append(
                {
                    "neighborhood": name,
                    "centroid": {
                        "lat": round(lat_sum / count, 6),
                        "lon": round(lon_sum / count, 6),
                    },
                }
            )

    (PROCESSED_DIR / "neighborhood_centroids.json").write_text(
        json.dumps({"entries": centroids}, indent=2)
    )

    return address_points

def preprocess_facilities() -> List[Dict[str, Any]]:
    path = DATA_DIR / "City_Facilities_-_Recreation_and_Parks_Jurisdiction_or_Leased_20251027.csv"
    if not path.exists():
        return

    facility_entries = []
    facility_counts: Dict[str, int] = defaultdict(int)
    address_points = []

    for row in load_csv(path):
        try:
            lon = float((row.get("longitude") or "").strip())
            lat = float((row.get("latitude") or "").strip())
        except ValueError:
            continue

        district = (row.get("supervisor_district") or "").strip()
        if district:
            facility_counts[district] += 1

        facility_entries.append(
            {
                "name": row.get("common_name"),
                "district": district,
                "address": row.get("address"),
                "coordinates": {"lat": lat, "lon": lon},
            }
        )
        if row.get("address"):
            address_points.append(
                {
                    "label": row.get("common_name") or row.get("address"),
                    "address": row.get("address"),
                    "zip": (row.get("zip_code") or "").strip(),
                    "type": "City Facility",
                    "coordinates": {"lat": lat, "lon": lon},
                }
            )

    (PROCESSED_DIR / "facilities.json").write_text(json.dumps({"entries": facility_entries}, indent=2))

    summary = [{"district": district, "facility_count": count} for district, count in sorted(facility_counts.items(), key=lambda x: int(x[0]))]
    (PROCESSED_DIR / "facility_counts_by_district.json").write_text(json.dumps({"entries": summary}, indent=2))

    return address_points


def preprocess_schools() -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    path = DATA_DIR / "Schools_20251027.csv"
    if not path.exists():
        return [], {}

    schools = []
    counts_by_zip: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"total": 0, "public": 0, "private": 0, "grades": Counter(), "types": Counter()})
    address_points = []

    location_pattern = re.compile(r"\(([-\d\.]+),\s*([-\d\.]+)\)")
    zip_pattern = re.compile(r"\b94\d{3}\b")

    with path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            location_str = row.get("Location 1") or ""
            location_match = location_pattern.search(location_str)
            if not location_match:
                continue
            lat, lon = map(float, location_match.groups())

            address = row.get("Campus Address") or ""
            zip_match = zip_pattern.search(address)
            zip_code = zip_match.group(0) if zip_match else ""

            ownership = (row.get("CCSF Entity") or "").strip()
            category = (row.get("Category") or "").strip()
            general_type = (row.get("General Type") or "").strip()
            name = row.get("Campus Name") or "School"

            school_entry = {
                "name": name,
                "zip": zip_code,
                "ownership": ownership,
                "category": category,
                "general_type": general_type,
                "grades": row.get("Grade Range"),
                "address": address,
                "coordinates": {"lat": lat, "lon": lon},
            }
            schools.append(school_entry)

            if zip_code:
                stats = counts_by_zip[zip_code]
                stats["total"] += 1
                if ownership.upper().startswith("SFUSD") or ownership.upper() == "PUBLIC":
                    stats["public"] += 1
                else:
                    stats["private"] += 1
                if category:
                    stats["types"][category] += 1
                if general_type:
                    stats["grades"][general_type] += 1

            address_points.append(
                {
                    "label": name,
                    "address": address,
                    "zip": zip_code,
                    "type": "School",
                    "coordinates": {"lat": lat, "lon": lon},
                }
            )

    return school_entry_list_with_sort(schools), counts_by_zip, address_points


def school_entry_list_with_sort(schools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(schools, key=lambda s: (s.get("zip") or "", s.get("name") or ""))


def preprocess_housing() -> None:
    path = DATA_DIR / "chas_440994.csv"
    if not path.exists():
        return

    def to_int(value: str) -> int:
        return int(value.replace(",", "").strip())

    moderate = severe = totals = None
    with path.open() as fh:
        reader = csv.reader(fh)
        in_section = False
        for row in reader:
            if not row or not row[0]:
                continue
            key = row[0].strip()
            if key == "Housing Cost Burden Overview 3":
                in_section = True
                continue
            if not in_section:
                continue
            if key == "Total":
                totals = {"owner": to_int(row[1]), "renter": to_int(row[2]), "total": to_int(row[3])}
                break
            if key == "Cost Burden >30% to <=50%":
                moderate = {"owner": to_int(row[1]), "renter": to_int(row[2]), "total": to_int(row[3])}
            if key == "Cost Burden >50%":
                severe = {"owner": to_int(row[1]), "renter": to_int(row[2]), "total": to_int(row[3])}

    payload = {
        "total_households": totals,
        "moderate_burden": moderate,
        "severe_burden": severe,
    }
    if totals and moderate:
        payload["moderate_burden_share"] = {key: round(moderate[key] / totals[key], 4) for key in totals}
    if totals and severe:
        payload["severe_burden_share"] = {key: round(severe[key] / totals[key], 4) for key in totals}

    (PROCESSED_DIR / "housing_burden.json").write_text(json.dumps(payload, indent=2))


def preprocess_rent_trend() -> None:
    path = DATA_DIR / "City_zori_uc_sfrcondomfr_sm_month.csv"
    if not path.exists():
        return

    csv.field_size_limit(15_000_000)
    entries = []
    matched_row = None
    with path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            if row.get("RegionName") == "San Francisco" and row.get("RegionType") == "city":
                matched_row = row
                for key, value in row.items():
                    if re.match(r"^\d{4}-\d{2}-\d{2}$", key or "") and value:
                        entries.append({"date": key, "zori": float(value)})
                break

    if not entries and matched_row:
        for key, value in matched_row.items():
            key_clean = (key or "").strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}$", key_clean) and value:
                entries.append({"date": key_clean, "zori": float(value)})

    entries.sort(key=lambda x: x["date"])
    (PROCESSED_DIR / "rent_trend.json").write_text(json.dumps({"entries": entries}, indent=2))


def preprocess_zip_rent() -> None:
    path = DATA_DIR / "Zip_zori_uc_sfrcondomfr_sm_month.csv"
    if not path.exists():
        return

    csv.field_size_limit(15_000_000)
    date_pattern = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    centroids = load_business_centroids()
    entries: List[Dict[str, Any]] = []
    latest_values: List[float] = []
    change_values: List[float] = []
    yoy_values: List[float] = []
    latest_month_seen = None

    with path.open(newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            if row.get("City") != "San Francisco" or row.get("RegionType") != "zip":
                continue
            zip_code = (row.get("RegionName") or "").strip()
            if not zip_code:
                continue

            history = []
            for key, value in row.items():
                key_clean = (key or "").strip()
                if not date_pattern.match(key_clean) or not value:
                    continue
                try:
                    val = float(value)
                except ValueError:
                    continue
                history.append({"date": key_clean, "zori": val})

            if not history:
                continue

            history.sort(key=lambda x: x["date"])
            latest_entry = history[-1]
            latest_values.append(latest_entry["zori"])
            latest_month_seen = max(latest_month_seen or latest_entry["date"], latest_entry["date"])

            date_lookup = {item["date"]: item["zori"] for item in history}
            yoy_index = len(history) - 13  # 12 months back relative to latest entry
            yoy_change_abs = yoy_change_pct = None
            if yoy_index >= 0:
                yoy_value = history[yoy_index]["zori"]
                if yoy_value:
                    yoy_change_abs = round(latest_entry["zori"] - yoy_value, 2)
                    yoy_change_pct = round((yoy_change_abs / yoy_value) * 100, 1)
                    yoy_values.append(yoy_change_pct)

            baseline_value = date_lookup.get("2020-01-31")
            change_since_2020_abs = change_since_2020_pct = None
            if baseline_value:
                change_since_2020_abs = round(latest_entry["zori"] - baseline_value, 2)
                if baseline_value:
                    change_since_2020_pct = round((change_since_2020_abs / baseline_value) * 100, 1)
                    change_values.append(change_since_2020_pct)

            entry_payload: Dict[str, Any] = {
                "zip": zip_code,
                "latest": latest_entry,
                "history": history[-60:],  # retain last five years
            }
            centroid = centroids.get(zip_code)
            if centroid:
                entry_payload["centroid"] = centroid
            if yoy_change_pct is not None:
                entry_payload["yoy_change_pct"] = yoy_change_pct
                entry_payload["yoy_change_abs"] = yoy_change_abs
            if change_since_2020_pct is not None:
                entry_payload["change_since_2020_pct"] = change_since_2020_pct
                entry_payload["change_since_2020_abs"] = change_since_2020_abs

            entries.append(entry_payload)

    if not entries:
        return

    entries.sort(key=lambda x: x["zip"])
    payload = {
        "latest_month": latest_month_seen,
        "entries": entries,
        "stats": {
            "latest_min": min(latest_values) if latest_values else None,
            "latest_max": max(latest_values) if latest_values else None,
            "change_pct_min": min(change_values) if change_values else None,
            "change_pct_max": max(change_values) if change_values else None,
            "yoy_pct_min": min(yoy_values) if yoy_values else None,
            "yoy_pct_max": max(yoy_values) if yoy_values else None,
        },
    }
    (PROCESSED_DIR / "rent_by_zip.json").write_text(json.dumps(payload, indent=2))


def main() -> None:
    park_points = preprocess_parks() or []
    preprocess_businesses()
    facility_points = preprocess_facilities() or []
    schools, school_counts, school_points = preprocess_schools()
    if schools:
        (PROCESSED_DIR / "schools.json").write_text(json.dumps({"entries": schools}, indent=2))
    if school_counts:
        school_counts_output = []
        for zip_code, stats in sorted(school_counts.items(), key=lambda x: x[0]):
            school_counts_output.append(
                {
                    "zip": zip_code,
                    "total": stats["total"],
                    "public": stats["public"],
                    "private": stats["private"],
                    "types": dict(stats["types"]),
                    "grades": dict(stats["grades"]),
                }
            )
        (PROCESSED_DIR / "school_counts_by_zip.json").write_text(json.dumps({"entries": school_counts_output}, indent=2))
    preprocess_housing()
    preprocess_rent_trend()
    preprocess_zip_rent()
    combined_points = park_points + facility_points + (school_points or [])
    if combined_points:
        (PROCESSED_DIR / "address_points.json").write_text(json.dumps({"entries": combined_points}, indent=2))
    print("Processed datasets saved to", PROCESSED_DIR)


if __name__ == "__main__":
    main()
