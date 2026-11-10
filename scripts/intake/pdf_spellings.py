"""PDF spellings → the spelling the dashboard's existing files use (the files were cleaned to one
spelling per name; the monthly PDFs vary). Applied to by-Nationality names before the name check,
and every use is listed in the intake report. Only names with evidence go here; any other
never-seen name still stops the intake.

Evidence for each entry: in February 2026 the PDF row set (visa class and count) under the PDF
spelling is identical to the existing file's rows under the file spelling, and no other name
matches. Confirmed by the dashboard owner (Nov 2026). "Congo, Republic of the" had no F1/J1 rows
in February 2026; the owner confirmed it is the country the files call "Republic of the Congo"
(157 monthly rows), which is not the Democratic Republic of the Congo.
"""

NATIONALITY_SPELLINGS = {
    "*Non-Nationality Based Issuances": "Non-Nationality Based Issuances",  # J1 2
    "Bosnia-Herzegovina": "Bosnia and Herzegovina",  # F1 3, J1 5
    "China - mainland": "China - Mainland",  # F1 488, J1 490
    "Congo, Democratic Republic of the": "Democratic Republic of the Congo",  # F1 7, J1 2
    "Congo, Republic of the": "Republic of the Congo",  # confirmed by the owner; a different country
}

# Consulate names in the by-Post PDF already match the existing file (February 2026: all 166 F1
# and 170 J1 rows), so no post spellings are needed.
POST_SPELLINGS = {}
