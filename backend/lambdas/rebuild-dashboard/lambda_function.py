import csv
import gzip
import io
import json
import re
import time
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict, namedtuple
from datetime import datetime, timezone

BUCKET = "isa-dashboard"
RAW_PREFIX = "raw/"
SNAPSHOT_KEY = "snapshot/snapshot.json.gz"

# The operational layer is the most recent calendar years of the post data.
OPERATIONAL_YEARS = 3

VISA_CODES = {"F1": 0, "J1": 1}
COUNTRY_TYPE = "country or area"

RawFile = namedtuple("RawFile", "name modified data")


class DataError(ValueError):
    """A raw file is malformed. The message is written for the person who uploaded it."""

MAIN_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PKG_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"


def _column_index(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _first_sheet_path(z):
    workbook = ET.fromstring(z.read("xl/workbook.xml"))
    sheet = workbook.find(f"{MAIN_NS}sheets/{MAIN_NS}sheet")
    rel_id = sheet.get(f"{REL_NS}id")
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    for rel in rels.iter(f"{PKG_REL_NS}Relationship"):
        if rel.get("Id") == rel_id:
            target = rel.get("Target")
            return target.lstrip("/") if target.startswith("/") else f"xl/{target}"
    raise DataError("the workbook has no readable first sheet")


def _shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(f"{MAIN_NS}t")) for si in root.iter(f"{MAIN_NS}si")]


def read_xlsx(data):
    """First worksheet as a list of string rows. Stdlib only, so no Lambda layer is needed."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise DataError("this is not a valid .xlsx file")
    with z:
        strings = _shared_strings(z)
        rows = []
        with z.open(_first_sheet_path(z)) as fh:
            for _, el in ET.iterparse(fh):
                if el.tag != f"{MAIN_NS}row":
                    continue
                cells = {}
                position = -1
                for c in el.iter(f"{MAIN_NS}c"):
                    ref = c.get("r")
                    position = _column_index(ref) if ref else position + 1
                    kind = c.get("t")
                    if kind == "inlineStr":
                        value = "".join(t.text or "" for t in c.iter(f"{MAIN_NS}t"))
                    else:
                        v = c.find(f"{MAIN_NS}v")
                        value = (v.text or "") if v is not None else ""
                        if kind == "s" and value:
                            value = strings[int(value)]
                    cells[position] = value.strip()
                el.clear()
                if cells:
                    rows.append([cells.get(i, "") for i in range(max(cells) + 1)])
        return rows


def read_csv(data):
    return [[cell.strip() for cell in row] for row in csv.reader(io.StringIO(data.decode("utf-8-sig")))]

COLUMN_ALIASES = {
    "calendar_year": ("calendar_year", "year"),
    "calendar_month": ("calendar_month", "month"),
    "fiscal_year": ("fiscal_year", "fy"),
    "visa_class": ("visa_class", "visa_type", "visa"),
    "issuances": ("issuances", "issuance", "count"),
    "post": ("post", "consulate"),
    "nationality": ("nationality", "country"),
    "nationality_type": ("nationality_type",),
    "data_source": ("data_source",),
}


def _normalise_header(h):
    return re.sub(r"[^a-z0-9]+", "_", h.strip().lower()).strip("_")


def _integer(value, what, line):
    try:
        number = float(value)
    except ValueError:
        raise DataError(f"row {line}: {what} {value!r} is not a number")
    if not number.is_integer():
        raise DataError(f"row {line}: {what} {value!r} is not a whole number")
    return int(number)


def _month(value, line):
    match = re.match(r"^\d{4}-(\d{1,2})", value)
    month = int(match.group(1)) if match else _integer(value, "month", line)
    if not 1 <= month <= 12:
        raise DataError(f"row {line}: month {value!r} is outside 1-12")
    return month


def parse_file(raw):
    table = read_xlsx(raw.data) if raw.name.lower().endswith(".xlsx") else read_csv(raw.data)
    if not table:
        raise DataError("the file is empty")

    header = [_normalise_header(h) for h in table[0]]
    col = {}
    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in header:
                col[field] = header.index(alias)
                break

    monthly = "calendar_year" in col and "calendar_month" in col
    if "post" in col and monthly:
        kind, key_field = "post", "post"
    elif "nationality" in col and monthly:
        kind, key_field = "nationality", "nationality"
    elif "nationality" in col and "fiscal_year" in col:
        kind, key_field = "historical", "nationality"
    else:
        raise DataError(
            "could not tell what kind of file this is. Expected calendar_year + calendar_month "
            "with a post or nationality column, or fiscal_year + nationality. "
            f"Found columns: {', '.join(table[0])}"
        )
    for required in ("visa_class", "issuances"):
        if required not in col:
            raise DataError(f"missing a {required} column")

    def cell(row, field):
        index = col.get(field)
        return row[index] if index is not None and index < len(row) else ""

    records = []
    seen = {}
    skipped_visas = Counter()
    for offset, row in enumerate(table[1:]):
        line = offset + 2
        if not any(row):
            continue
        visa = re.sub(r"[^A-Z0-9]", "", cell(row, "visa_class").upper())
        if visa not in VISA_CODES:
            skipped_visas[visa or "(blank)"] += 1
            continue
        name = cell(row, key_field)
        if not name:
            raise DataError(f"row {line}: {key_field} is blank")
        issuances_text = cell(row, "issuances")
        issuances = _integer(issuances_text, "issuances", line) if issuances_text else 0
        if issuances < 0:
            raise DataError(f"row {line}: issuances {issuances} is negative")

        if kind == "historical":
            period = _integer(cell(row, "fiscal_year"), "fiscal_year", line)
        else:
            period = (
                _integer(cell(row, "calendar_year"), "calendar_year", line),
                _month(cell(row, "calendar_month"), line),
            )

        key = (period, name, visa)
        if key in seen:
            raise DataError(f"row {line} repeats row {seen[key]} ({name}, {visa}, {period})")
        seen[key] = line

        records.append({
            "period": period,
            "name": name,
            "visa": visa,
            "issuances": issuances,
            "isCountry": cell(row, "nationality_type").lower() in ("", COUNTRY_TYPE)
            and name not in SPECIAL_REPORTING_NAMES,
            "official": "monthly" not in cell(row, "data_source").lower(),
        })

    if not records:
        raise DataError("no F1 or J1 rows found")
    return kind, records, skipped_visas


class Dim:
    """Dictionary encoder: keeps repeated strings out of the payload."""

    def __init__(self):
        self.values, self._index = [], {}

    def id(self, value):
        if value not in self._index:
            self._index[value] = len(self.values)
            self.values.append(value)
        return self._index[value]


def _month_index(year, month):
    return year * 12 + (month - 1)


def _fiscal_year(year, month):
    return year + 1 if month >= 10 else year


def _canonical(name):
    return NATIONALITY_ALIASES.get(name, name)


def build_snapshot(files):
    """Merges raw files (oldest first) into the snapshot the dashboard reads."""
    by_period = {"post": {}, "nationality": {}, "historical": {}}
    sources, warnings = [], []

    for raw in sorted(files, key=lambda f: (f.modified, f.name)):
        try:
            kind, records, skipped_visas = parse_file(raw)
        except DataError as error:
            raise DataError(f"{raw.name}: {error}") from None
        groups = defaultdict(list)
        for record in records:
            groups[record["period"]].append(record)
        replaced = sorted(p for p in groups if p in by_period[kind])
        by_period[kind].update(groups)
        sources.append({
            "file": raw.name,
            "kind": kind,
            "rows": len(records),
            "periods": len(groups),
            "replacedPeriods": len(replaced),
            "modified": datetime.fromtimestamp(raw.modified, timezone.utc).isoformat(),
        })
        if skipped_visas:
            warnings.append(f"{raw.name}: skipped rows for other visa classes {dict(skipped_visas)}")

    if not by_period["post"]:
        raise DataError("no post file found; the consulate layer is required")

    posts, post_meta = _build_posts(by_period["post"], warnings)
    annual, fiscal_years, annual_meta = _build_annual(
        by_period["historical"], by_period["nationality"], warnings
    )

    end = post_meta["end"]
    end_year = end // 12
    operational_start = max(post_meta["start"], _month_index(end_year - OPERATIONAL_YEARS + 1, 1))

    nat_months = sorted(_month_index(y, m) for (y, m) in by_period["nationality"])
    return {
        "schema": "dashboard-snapshot@1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "coverage": {
            "postsMonthly": {"start": post_meta["start"], "end": end},
            "operational": {"start": operational_start, "end": end},
            "nationalityMonthly": (
                {"start": nat_months[0], "end": nat_months[-1]} if nat_months else None
            ),
            "annual": annual_meta,
        },
        "validation": {"postsMonthly": post_meta["validation"], "annual": annual_meta["validation"]},
        "warnings": warnings,
        "sources": sources,
        "fiscalYears": fiscal_years,
        "postsMonthly": posts,
        "annualCountry": annual,
    }


def _build_posts(months, warnings):
    rows = []
    unmapped = Counter()
    for (year, month), records in months.items():
        for r in records:
            country = POST_COUNTRY.get(r["name"])
            if country is None:
                unmapped[r["name"]] += r["issuances"]
                continue
            rows.append((year, month, country, r["name"], r["visa"], r["issuances"]))

    if unmapped:
        listed = ", ".join(f"{post} ({count:,})" for post, count in unmapped.most_common())
        warnings.append(
            f"{len(unmapped)} post(s) have no country in POST_COUNTRY and were left out: {listed}. "
            "Add them to POST_COUNTRY in the rebuild-dashboard Lambda."
        )

    # Sorted by date, country, post, visa: the order app.py handed its tabs, so
    # first-row-wins tie-breaks match the original dashboard.
    rows.sort(key=lambda r: (r[0], r[1], r[2], r[3], VISA_CODES[r[4]]))

    post_dim, country_dim = Dim(), Dim()
    cols = {"year": [], "month": [], "post": [], "country": [], "visa": [], "issuances": []}
    for year, month, country, post, visa, issuances in rows:
        cols["year"].append(year)
        cols["month"].append(month)
        cols["post"].append(post_dim.id(post))
        cols["country"].append(country_dim.id(country))
        cols["visa"].append(VISA_CODES[visa])
        cols["issuances"].append(issuances)

    indexes = sorted({_month_index(y, m) for (y, m) in months})
    start, end = indexes[0], indexes[-1]
    present = set(indexes)
    missing = [i for i in range(start, end + 1) if i not in present]
    if missing:
        warnings.append(f"post data is missing {len(missing)} month(s) between its first and last month")

    totals = Counter()
    for r in rows:
        totals[r[4]] += r[5]
    return (
        {
            "rowCount": len(rows),
            "dims": {"post": post_dim.values, "country": country_dim.values},
            "cols": cols,
        },
        {
            "start": start,
            "end": end,
            "validation": {
                "rows": len(rows),
                "months": len(indexes),
                "missingMonths": missing,
                "posts": len(post_dim.values),
                "countries": len(country_dim.values),
                "f1": totals["F1"],
                "j1": totals["J1"],
                "unmappedPosts": dict(unmapped),
            },
        },
    )


def _build_annual(historical, nationality_months, warnings):
    """Official annual figures where present, summed monthly nationality reports otherwise."""
    monthly = defaultdict(Counter)
    monthly_months = defaultdict(set)
    special = Counter()
    for (year, month), records in nationality_months.items():
        fy = _fiscal_year(year, month)
        monthly_months[fy].add((year, month))
        for r in records:
            if r["isCountry"]:
                monthly[fy][(_canonical(r["name"]), r["visa"])] += r["issuances"]
            else:
                special[r["name"]] += r["issuances"]

    values_by_fy, fiscal_years = {}, []
    for fy in sorted(set(historical) | set(monthly)):
        hist_rows = historical.get(fy, [])
        if hist_rows and all(r["official"] for r in hist_rows):
            values = Counter()
            for r in hist_rows:
                if r["isCountry"]:
                    values[(_canonical(r["name"]), r["visa"])] += r["issuances"]
            months, source = 12, "annual"
        elif fy in monthly:
            values, months, source = monthly[fy], len(monthly_months[fy]), "monthly"
        else:
            values = Counter()
            for r in hist_rows:
                if r["isCountry"]:
                    values[(_canonical(r["name"]), r["visa"])] += r["issuances"]
            months, source = 12, "historical-file"
        values_by_fy[fy] = values
        fiscal_years.append({"fiscalYear": fy, "monthsIncluded": months, "complete": months == 12, "source": source})

    if not fiscal_years:
        warnings.append("no nationality or historical file found; annual country history is empty")
        empty = {"rowCount": 0, "dims": {"country": []}, "cols": {"fiscalYear": [], "country": [], "visa": [], "issuances": []}}
        return empty, [], {"first": None, "latestComplete": None, "latest": None, "latestMonths": None, "validation": {}}

    country_dim = Dim()
    cols = {"fiscalYear": [], "country": [], "visa": [], "issuances": []}
    for fy in sorted(values_by_fy):
        for (country, visa), issuances in sorted(values_by_fy[fy].items()):
            cols["fiscalYear"].append(fy)
            cols["country"].append(country_dim.id(country))
            cols["visa"].append(VISA_CODES[visa])
            cols["issuances"].append(issuances)

    complete = [f["fiscalYear"] for f in fiscal_years if f["complete"]]
    latest = fiscal_years[-1]
    return (
        {"rowCount": len(cols["visa"]), "dims": {"country": country_dim.values}, "cols": cols},
        fiscal_years,
        {
            "first": fiscal_years[0]["fiscalYear"],
            "latestComplete": complete[-1] if complete else None,
            "latest": latest["fiscalYear"],
            "latestMonths": latest["monthsIncluded"],
            "validation": {
                "rows": len(cols["visa"]),
                "countries": len(country_dim.values),
                "excludedSpecialCategories": dict(special),
            },
        },
    )


def summarise(snapshot, seconds):
    coverage = snapshot["coverage"]
    month = lambda i: f"{i // 12}-{i % 12 + 1:02d}"
    annual = coverage["annual"]
    return {
        "ok": True,
        "seconds": round(seconds, 1),
        "postsMonthly": f"{snapshot['postsMonthly']['rowCount']} rows, "
        f"{month(coverage['postsMonthly']['start'])} to {month(coverage['postsMonthly']['end'])}",
        "operational": f"{month(coverage['operational']['start'])} to {month(coverage['operational']['end'])}",
        "annualCountry": f"{snapshot['annualCountry']['rowCount']} rows, FY{annual['first']} to FY{annual['latest']}"
        f" (latest complete FY{annual['latestComplete']}, FY{annual['latest']} has {annual['latestMonths']} months)",
        "files": [f"{s['kind']}: {s['file']} ({s['rows']} rows, replaced {s['replacedPeriods']} periods)" for s in snapshot["sources"]],
        "warnings": snapshot["warnings"],
    }


def encode(snapshot):
    return json.dumps(snapshot, separators=(",", ":")).encode("utf-8")

def _load_s3_files(s3):
    files = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=RAW_PREFIX):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if not key.lower().endswith((".xlsx", ".csv")):
                continue
            body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
            files.append(RawFile(key, obj["LastModified"].timestamp(), body))
    return files


def lambda_handler(event, _context):
    import boto3

    started = time.time()
    s3 = boto3.client("s3")
    files = _load_s3_files(s3)
    if not files:
        raise DataError(f"no .xlsx or .csv files under s3://{BUCKET}/{RAW_PREFIX}")

    snapshot = build_snapshot(files)
    s3.put_object(
        Bucket=BUCKET,
        Key=SNAPSHOT_KEY,
        Body=gzip.compress(encode(snapshot)),
        ContentType="application/json",
        ContentEncoding="gzip",
    )
    summary = summarise(snapshot, time.time() - started)
    print(json.dumps(summary, indent=2))
    return summary


def _main():
    import argparse
    import os

    parser = argparse.ArgumentParser(description="Build the dashboard snapshot from local files.")
    parser.add_argument("--local", required=True, help="directory holding the raw .xlsx/.csv files")
    parser.add_argument("--out", required=True, help="directory to write snapshot.json into")
    args = parser.parse_args()

    started = time.time()
    files = []
    for name in sorted(os.listdir(args.local)):
        path = os.path.join(args.local, name)
        if name.lower().endswith((".xlsx", ".csv")) and not name.startswith("~$"):
            with open(path, "rb") as fh:
                files.append(RawFile(name, os.path.getmtime(path), fh.read()))

    snapshot = build_snapshot(files)
    os.makedirs(args.out, exist_ok=True)
    body = encode(snapshot)
    with open(os.path.join(args.out, "snapshot.json"), "wb") as fh:
        fh.write(body)
    summary = summarise(snapshot, time.time() - started)
    summary["bytes"] = len(body)
    summary["gzipBytes"] = len(gzip.compress(body))
    print(json.dumps(summary, indent=2))


POST_COUNTRY = {
    "AIT Taipei": "Taiwan",
    "Abidjan": "Cote d'Ivoire",
    "Abu Dhabi": "United Arab Emirates",
    "Abuja": "Nigeria",
    "Accra": "Ghana",
    "Addis Ababa": "Ethiopia",
    "Algiers": "Algeria",
    "Almaty": "Kazakhstan",
    "Amman": "Jordan",
    "Amsterdam": "Netherlands",
    "Ankara": "Turkey",
    "Antananarivo": "Madagascar",
    "Apia": "Samoa",
    "Ashgabat": "Turkmenistan",
    "Asmara": "Eritrea",
    "Astana": "Kazakhstan",
    "Asuncion": "Paraguay",
    "Athens": "Greece",
    "Auckland": "New Zealand",
    "Baghdad": "Iraq",
    "Baku": "Azerbaijan",
    "Bamako": "Mali",
    "Bandar Seri Begawan": "Brunei",
    "Bangkok": "Thailand",
    "Banjul": "Gambia",
    "Beijing": "China",
    "Beirut": "Lebanon",
    "Belfast": "United Kingdom",
    "Belgrade": "Serbia",
    "Belmopan": "Belize",
    "Berlin": "Germany",
    "Bern": "Switzerland",
    "Bishkek": "Kyrgyzstan",
    "Bogota": "Colombia",
    "Brasilia": "Brazil",
    "Bratislava": "Slovakia",
    "Brazzaville": "Republic of the Congo",
    "Bridgetown": "Barbados",
    "Brussels": "Belgium",
    "Bucharest": "Romania",
    "Budapest": "Hungary",
    "Buenos Aires": "Argentina",
    "Bujumbura": "Burundi",
    "Cairo": "Egypt",
    "Calgary": "Canada",
    "Cape Town": "South Africa",
    "Caracas": "Venezuela",
    "Casablanca": "Morocco",
    "Chengdu": "China",
    "Chennai": "India",
    "Chiang Mai": "Thailand",
    "Chisinau": "Moldova",
    "Ciudad Juarez": "Mexico",
    "Colombo": "Sri Lanka",
    "Conakry": "Guinea",
    "Copenhagen": "Denmark",
    "Cotonou": "Benin",
    "Curacao": "Curacao",
    "Dakar": "Senegal",
    "Dar es Salaam": "Tanzania",
    "Dhahran": "Saudi Arabia",
    "Dhaka": "Bangladesh",
    "Dili": "Timor-Leste",
    "Djibouti": "Djibouti",
    "Doha": "Qatar",
    "Dubai": "United Arab Emirates",
    "Dublin": "Ireland",
    "Durban": "South Africa",
    "Dushanbe": "Tajikistan",
    "Erbil": "Iraq",
    "Florence": "Italy",
    "Frankfurt": "Germany",
    "Freetown": "Sierra Leone",
    "Gaborone": "Botswana",
    "Georgetown": "Guyana",
    "Guadalajara": "Mexico",
    "Guangzhou": "China",
    "Guatemala City": "Guatemala",
    "Guayaquil": "Ecuador",
    "Halifax": "Canada",
    "Hamilton": "Bermuda",
    "Hanoi": "Vietnam",
    "Harare": "Zimbabwe",
    "Havana": "Cuba",
    "Helsinki": "Finland",
    "Hermosillo": "Mexico",
    "Ho Chi Minh City": "Vietnam",
    "Hong Kong": "Hong Kong",
    "Hyderabad": "India",
    "Islamabad": "Pakistan",
    "Istanbul": "Turkey",
    "Jakarta": "Indonesia",
    "Jeddah": "Saudi Arabia",
    "Jerusalem": "Israel",
    "Johannesburg": "South Africa",
    "Juba": "South Sudan",
    "Kabul": "Afghanistan",
    "Kampala": "Uganda",
    "Karachi": "Pakistan",
    "Kathmandu": "Nepal",
    "Khartoum": "Sudan",
    "Kigali": "Rwanda",
    "Kingston": "Jamaica",
    "Kinshasa": "Democratic Republic of the Congo",
    "Kolkata": "India",
    "Kolonia": "Micronesia",
    "Koror": "Palau",
    "Krakow": "Poland",
    "Kuala Lumpur": "Malaysia",
    "Kuwait": "Kuwait",
    "Kuwait City": "Kuwait",
    "Kyiv": "Ukraine",
    "La Paz": "Bolivia",
    "Lagos": "Nigeria",
    "Libreville": "Gabon",
    "Lilongwe": "Malawi",
    "Lima": "Peru",
    "Lisbon": "Portugal",
    "Ljubljana": "Slovenia",
    "Lome": "Togo",
    "London": "United Kingdom",
    "Luanda": "Angola",
    "Lusaka": "Zambia",
    "Luxembourg": "Luxembourg",
    "Madrid": "Spain",
    "Majuro": "Marshall Islands",
    "Malabo": "Equatorial Guinea",
    "Managua": "Nicaragua",
    "Manama": "Bahrain",
    "Manila": "Philippines",
    "Maputo": "Mozambique",
    "Maseru": "Lesotho",
    "Matamoros": "Mexico",
    "Mbabane": "Eswatini",
    "Melbourne": "Australia",
    "Merida": "Mexico",
    "Mexico City": "Mexico",
    "Milan": "Italy",
    "Minsk": "Belarus",
    "Monrovia": "Liberia",
    "Monterrey": "Mexico",
    "Montevideo": "Uruguay",
    "Montreal": "Canada",
    "Moscow": "Russia",
    "Mumbai": "India",
    "Munich": "Germany",
    "Muscat": "Oman",
    "N`Djamena": "Chad",
    "Naha": "Japan",
    "Nairobi": "Kenya",
    "Naples": "Italy",
    "Nassau": "Bahamas",
    "New Delhi": "India",
    "Niamey": "Niger",
    "Nicosia": "Cyprus",
    "Nogales": "Mexico",
    "Nouakchott": "Mauritania",
    "Nuevo Laredo": "Mexico",
    "Nur-Sultan": "Kazakhstan",
    "Osaka/Kobe": "Japan",
    "Oslo": "Norway",
    "Ottawa": "Canada",
    "Ouagadougou": "Burkina Faso",
    "Panama City": "Panama",
    "Paramaribo": "Suriname",
    "Paris": "France",
    "Perth": "Australia",
    "Phnom Penh": "Cambodia",
    "Podgorica": "Montenegro",
    "Port Louis": "Mauritius",
    "Port Moresby": "Papua New Guinea",
    "Port of Spain": "Trinidad and Tobago",
    "Port-au-Prince": "Haiti",
    "Porto Alegre": "Brazil",
    "Prague": "Czechia",
    "Praia": "Cape Verde",
    "Pristina": "Kosovo",
    "Quebec": "Canada",
    "Quito": "Ecuador",
    "Rangoon": "Myanmar",
    "Recife": "Brazil",
    "Reykjavik": "Iceland",
    "Riga": "Latvia",
    "Rio de Janeiro": "Brazil",
    "Riyadh": "Saudi Arabia",
    "Rome": "Italy",
    "San Jose": "Costa Rica",
    "San Salvador": "El Salvador",
    "Santiago": "Chile",
    "Santo Domingo": "Dominican Republic",
    "Sao Paulo": "Brazil",
    "Sarajevo": "Bosnia and Herzegovina",
    "Seoul": "South Korea",
    "Shanghai": "China",
    "Shenyang": "China",
    "Singapore": "Singapore",
    "Skopje": "North Macedonia",
    "Sofia": "Bulgaria",
    "St Petersburg": "Russia",
    "Stockholm": "Sweden",
    "Surabaya": "Indonesia",
    "Suva": "Fiji",
    "Sydney": "Australia",
    "Tallinn": "Estonia",
    "Tashkent": "Uzbekistan",
    "Tbilisi": "Georgia",
    "Tegucigalpa": "Honduras",
    "Tel Aviv": "Israel",
    "Tijuana": "Mexico",
    "Tijuana Tpf": "Mexico",
    "Tirana": "Albania",
    "Tokyo": "Japan",
    "Toronto": "Canada",
    "Tunis": "Tunisia",
    "Ulaanbaatar": "Mongolia",
    "Valletta": "Malta",
    "Vancouver": "Canada",
    "Vienna": "Austria",
    "Vientiane": "Laos",
    "Vilnius": "Lithuania",
    "Vladivostok": "Russia",
    "Warsaw": "Poland",
    "Windhoek": "Namibia",
    "Wuhan": "China",
    "Yaounde": "Cameroon",
    "Yekaterinburg": "Russia",
    "Yerevan": "Armenia",
    "Zagreb": "Croatia"
}

# Nationality-file spelling -> the country name the post data uses, so the two
# layers join on one name. Names absent here pass through unchanged.
NATIONALITY_ALIASES = {
    "Bahamas, The": "Bahamas",
    "Burma": "Myanmar",
    "Cabo Verde": "Cape Verde",
    "China - Mainland": "China",
    "Congo, Dem. Rep. of the (Congo Kinshasa)": "Democratic Republic of the Congo",
    "Congo, Rep. of the (Congo Brazzaville)": "Republic of the Congo",
    "Czech Republic": "Czechia",
    "Federated States of Micronesia": "Micronesia",
    "Gambia, The": "Gambia",
    "Great Britain and Northern Ireland": "United Kingdom",
    "Hong Kong S.A.R.": "Hong Kong",
    "Korea, South": "South Korea",
    "Macau S.A.R.": "Macau",
    "Marshall Islands, Republic of the": "Marshall Islands",
    "Micronesia, Federated States of": "Micronesia",
    "Republic of Palau": "Palau",
    "St Lucia": "Saint Lucia",
    "St. Kitts and Nevis": "Saint Kitts and Nevis",
    "St. Lucia": "Saint Lucia",
    "St. Vincent and the Grenadines": "Saint Vincent and the Grenadines",
    "Sudan, South": "South Sudan"
}

# Rows that are not a nationality. The monthly reports label some of these
# "Country or area" where the official annual tables do not, so they are listed
# here to keep every fiscal year classified the same way.
SPECIAL_REPORTING_NAMES = {
    "British National Overseas (Hong Kong) Passport",
    "No Nationality",
    "Non-Nationality Based Issuances",
    "Palestinian Authority Travel Document",
    "Unknown",
}


if __name__ == "__main__":
    _main()
