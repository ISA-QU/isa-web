"""Optional: downloads a month's two reports from the State Department's public statistics page.

Off by default (intake.py --download YYYY-MM). The site may refuse scripted downloads; then this
says so, and the two PDFs can be saved by hand from the page and passed with --pdf.
"""

import os
import urllib.error
import urllib.parse
import urllib.request

from files import IntakeError

SOURCE_PAGE = (
    "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics/"
    "nonimmigrant-visa-statistics/monthly-nonimmigrant-visa-issuances.html"
)
# The file names the page has used (e.g. "FEBRUARY 2026 - NIV Issuances by Nationality and Visa
# Class.pdf"). Not confirmed against the live page, which refuses scripted access.
FILE_BASE = "https://travel.state.gov/content/dam/visas/Statistics/Non-Immigrant-Statistics/MonthlyNIVIssuances/"
FILE_NAMES = ("{MONTH} {YEAR} - NIV Issuances by Nationality and Visa Class.pdf",
              "{MONTH} {YEAR} - NIV Issuances by Post and Visa Class.pdf")
MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER",
          "OCTOBER", "NOVEMBER", "DECEMBER"]


def download_month(month, folder):
    """Saves the month's two PDFs into `folder` and returns their paths."""
    try:
        year, number = (int(x) for x in month.split("-"))
        label = MONTHS[number - 1]
    except (ValueError, IndexError):
        raise IntakeError(f"--download needs a month like 2026-02, not {month!r}") from None
    os.makedirs(folder, exist_ok=True)
    paths = []
    for pattern in FILE_NAMES:
        name = pattern.format(MONTH=label, YEAR=year)
        url = FILE_BASE + urllib.parse.quote(name)
        request = urllib.request.Request(url, headers={"User-Agent": "isa-web-intake (Quinnipiac dashboard monthly update)"})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read()
        except urllib.error.HTTPError as error:
            raise IntakeError(
                f"The State Department site refused the download (HTTP {error.code}) for {name}. "
                f"Save the month's two PDFs by hand from {SOURCE_PAGE} and pass them with --pdf."
            ) from None
        except urllib.error.URLError as error:
            raise IntakeError(f"Couldn't reach the State Department site ({error.reason}). Download the PDFs by hand from {SOURCE_PAGE}.") from None
        if not data.startswith(b"%PDF"):
            raise IntakeError(f"{name}: the site didn't return a PDF. Download it by hand from {SOURCE_PAGE}.")
        path = os.path.join(folder, name)
        with open(path, "wb") as fh:
            fh.write(data)
        paths.append(path)
    return paths
