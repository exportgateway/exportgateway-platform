"""Print known EU CN nomenclature download URLs (Finnish Customs official texts)."""

FINNISH_CN_2025_XLSX = (
    "https://tilastot.tulli.fi/documents/179508185/203434223/"
    "CN%202025%20official%20texts.xlsx/3fd063d3-48f0-b279-9d2d-63917e91658a?version=1.1"
)
FINNISH_CN_PAGE = (
    "https://tilastot.tulli.fi/en/nomenclatures-and-classifications/combined-nomenclature-cn"
)

if __name__ == "__main__":
    print("CN 2025 official texts (English XLSX):")
    print(FINNISH_CN_2025_XLSX)
    print("\nIndex page:")
    print(FINNISH_CN_PAGE)
    print("\nImport command:")
    print("  python scripts/import_full_cn_nomenclature.py --download")
