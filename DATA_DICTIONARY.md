# Data dictionary

Field reference for the JSON outputs in `data/processed/`. Coordinate pairs use WGS84 lat/lon.

## business_by_zip.json
- `total_businesses`: total records citywide.
- `top_naics_citywide`: array of `{sector, count}` for top NAICS categories.
- `entries`: array of ZIP summaries:
  - `zip` (string), `business_count` (int), `share_of_city` (0–1)
  - `top_sectors`: up to 3 `{sector, count}`
  - `top_neighborhoods`: up to 3 `{neighborhood, count}` linked to that ZIP
  - `centroid`: optional `{lat, lon}` weighted by neighborhood counts

## business_neighborhoods.json
- `entries`: `{neighborhood, business_count}` for analysis-boundary neighborhoods.

## neighborhood_centroids.json
- `entries`: `{neighborhood, centroid: {lat, lon}}` averages of park points per neighborhood.

## parks.json
- `entries`: park records with `name`, `acres` (float), `category` (size bucket), `type` (park classification), `districts` (array of supervisor district strings), `coordinates`.

## park_acres_by_district.json
- `entries`: `{district, total_acres}` where acreage is divided across multi-district parks.

## facilities.json
- `entries`: city facility points with `name`, `district`, `address`, `coordinates`.

## facility_counts_by_district.json
- `entries`: `{district, facility_count}` totals.

## housing_burden.json
- `total_households`: `{owner, renter, total}` counts.
- `moderate_burden`: households paying 30–50% of income on housing.
- `severe_burden`: households paying >50%.
- `moderate_burden_share` and `severe_burden_share`: per-group ratios (0–1) using the totals above.

## rent_trend.json
- `entries`: citywide timeline of `{date (YYYY-MM-DD), zori}` for Zillow Observed Rent Index.

## rent_by_zip.json
- `latest_month`: most recent month in the file.
- `entries`: ZIP-level rent series:
  - `zip`
  - `latest`: `{date, zori}` last value
  - `history`: last five years of `{date, zori}`
  - `centroid`: optional `{lat, lon}`
  - `yoy_change_pct`/`yoy_change_abs`: 12-month change vs. one year prior
  - `change_since_2020_pct`/`change_since_2020_abs`: change vs. Jan 2020 baseline when available
- `stats`: overall min/max aggregates for latest rent, YoY %, and change-since-2020 %.

## address_points.json
- `entries`: unified geocoded points for quick lookup, with `label`, `address`, `zip`, `type` (`Park`, `City Facility`, or `School`), and `coordinates`.

## schools.json
- `entries`: school locations with `name`, `zip`, `ownership` (SFUSD/Public/Private), `category`, `general_type` (grade band shorthand), `grades` (range text), `address`, `coordinates`.

## school_counts_by_zip.json
- `entries`: ZIP rollups with `zip`, `total`, `public`, `private`, `types` (category counts map), `grades` (grade-band counts map).
