"""Seed airports from a bundled CSV of common European airports.

Usage:
  python manage.py seed_airports [--file path.csv]

Without a file, loads a small built-in set. To seed the full global dataset,
download `airports.csv` from https://ourairports.com/data/ and pass --file.
"""
import csv
from django.core.management.base import BaseCommand

from samferd.events.models import Airport

# IATA, name, city, country, lat, lon
BUILTIN_AIRPORTS = [
    ("CDG", "Paris Charles de Gaulle", "Paris", "France", 49.0097, 2.5479),
    ("ORY", "Paris Orly", "Paris", "France", 48.7262, 2.3652),
    ("LYS", "Lyon-Saint Exupery", "Lyon", "France", 45.7264, 5.0908),
    ("MRS", "Marseille Provence", "Marseille", "France", 43.4367, 5.2150),
    ("NCE", "Nice Cote d'Azur", "Nice", "France", 43.6584, 7.2159),
    ("TRN", "Turin Caselle", "Turin", "Italy", 45.2008, 7.6496),
    ("MXP", "Milan Malpensa", "Milan", "Italy", 45.6306, 8.7281),
    ("BGY", "Milan Bergamo", "Bergamo", "Italy", 45.6739, 9.7042),
    ("VCE", "Venice Marco Polo", "Venice", "Italy", 45.5053, 12.3519),
    ("BLQ", "Bologna Guglielmo Marconi", "Bologna", "Italy", 44.5354, 11.2887),
    ("FCO", "Rome Fiumicino", "Rome", "Italy", 41.8003, 12.2389),
    ("ZRH", "Zurich Airport", "Zurich", "Switzerland", 47.4647, 8.5492),
    ("GVA", "Geneva Airport", "Geneva", "Switzerland", 46.2381, 6.1089),
    ("LHR", "London Heathrow", "London", "UK", 51.4700, -0.4543),
    ("LGW", "London Gatwick", "London", "UK", 51.1537, -0.1821),
    ("AMS", "Amsterdam Schiphol", "Amsterdam", "Netherlands", 52.3105, 4.7683),
    ("BRU", "Brussels Airport", "Brussels", "Belgium", 50.9014, 4.4844),
    ("BER", "Berlin Brandenburg", "Berlin", "Germany", 52.3667, 13.5033),
    ("MUC", "Munich Airport", "Munich", "Germany", 48.3538, 11.7861),
    ("FRA", "Frankfurt Airport", "Frankfurt", "Germany", 50.0379, 8.5622),
]


class Command(BaseCommand):
    help = "Seed airports from builtin list or an OurAirports CSV."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=None, help="Path to airports.csv")

    def handle(self, *args, **options):
        path = options["file"]
        count = 0
        if path:
            with open(path, newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    iata = (row.get("iata_code") or "").strip()
                    if len(iata) != 3:
                        continue
                    if not row.get("latitude_deg") or not row.get("longitude_deg"):
                        continue
                    Airport.objects.update_or_create(
                        iata_code=iata,
                        defaults={
                            "name": row.get("name", ""),
                            "city": row.get("municipality", ""),
                            "country": row.get("iso_country", ""),
                            "lat": float(row["latitude_deg"]),
                            "lon": float(row["longitude_deg"]),
                        },
                    )
                    count += 1
        else:
            for iata, name, city, country, lat, lon in BUILTIN_AIRPORTS:
                Airport.objects.update_or_create(
                    iata_code=iata,
                    defaults={"name": name, "city": city, "country": country, "lat": lat, "lon": lon},
                )
                count += 1
        self.stdout.write(self.style.SUCCESS(f"Seeded {count} airports."))