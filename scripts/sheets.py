"""Read workbook metadata, or make local CSV exports for the development preview."""
import csv
import io
import json
import pathlib
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

def listing_tabs(book):
    root = ET.fromstring(book.read("xl/workbook.xml"))
    return [entry for entry in root.find("m:sheets", NS)
            if re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", entry.attrib["name"])]

def export_preview(path, folder):
    folder.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path) as book:
        shared = []
        if "xl/sharedStrings.xml" in book.namelist():
            shared = ["".join(t.text or "" for t in entry.findall(".//m:t", NS))
                      for entry in ET.fromstring(book.read("xl/sharedStrings.xml"))]
        rels = {item.attrib["Id"]: item.attrib["Target"]
                for item in ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))}
        for tab in listing_tabs(book):
            target = rels[tab.attrib[REL]]
            data = ET.fromstring(book.read(target.lstrip("/") if target.startswith("/") else "xl/" + target))
            with (folder / (tab.attrib["name"] + ".csv")).open("w", newline="", encoding="utf-8") as dest:
                writer = csv.writer(dest)
                for row in data.findall(".//m:row", NS):
                    values = []
                    for cell in row.findall("m:c", NS):
                        letters = re.match(r"[A-Z]+", cell.attrib["r"]).group()
                        index = 0
                        for letter in letters:
                            index = index * 26 + ord(letter) - ord("A") + 1
                        values.extend([""] * (index - 1 - len(values)))
                        raw = cell.findtext("m:v", "", NS)
                        if cell.get("t") == "s":
                            raw = shared[int(raw)]
                        if cell.get("t") == "inlineStr":
                            raw = "".join(t.text or "" for t in cell.findall(".//m:t", NS))
                        values.append(raw)
                    if any(values):
                        writer.writerow(values)

if __name__ == "__main__":
    if sys.argv[1] == "preview":
        export_preview(sys.argv[2], pathlib.Path(sys.argv[3]))
    else:
        url = f"https://docs.google.com/spreadsheets/d/{sys.argv[1]}/export?format=xlsx"
        with urllib.request.urlopen(url, timeout=30) as response:
            payload = response.read(20_000_001)
        if len(payload) > 20_000_000:
            raise ValueError("Workbook metadata export exceeds the size limit")
        with zipfile.ZipFile(io.BytesIO(payload)) as workbook:
            print(json.dumps([tab.attrib["name"] for tab in listing_tabs(workbook)]))
