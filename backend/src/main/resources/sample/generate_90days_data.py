import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

# ============================================================
# QUINCAILLERIE DU RWAMAGANA — 90-DAY DATA GENERATOR
# ============================================================

OUTPUT_DIR = Path(__file__).resolve().parent

products = [
    ("PW-001", "Electric Drill 650W", "Power Tools", 45000, 65000, 5),
    ("PW-002", "Angle Grinder 4.5\"", "Power Tools", 38000, 55000, 4),
    ("PW-003", "Circular Saw 7.25\"", "Power Tools", 85000, 120000, 3),
    ("HT-001", "Hammer 2kg", "Hand Tools", 3500, 5500, 20),
    ("HT-002", "Screwdriver Set 6pc", "Hand Tools", 4500, 7500, 15),
    ("HT-003", "Measuring Tape 5m", "Hand Tools", 2000, 3500, 25),
    ("HT-004", "Pliers Set 3pc", "Hand Tools", 5500, 8500, 10),
    ("EL-001", "Electrical Wire 2.5mm² (roll)", "Electrical", 25000, 35000, 10),
    ("EL-002", "LED Bulb 12W", "Electrical", 1500, 2500, 50),
    ("EL-003", "Circuit Breaker 32A", "Electrical", 8000, 12000, 15),
    ("EL-004", "Socket Outlet Double", "Electrical", 3000, 5000, 30),
    ("PL-001", "PVC Pipe 4\" x 3m", "Plumbing", 8500, 12000, 20),
    ("PL-002", "Water Tap Brass", "Plumbing", 6500, 9500, 15),
    ("PL-003", "Toilet Seat Cover", "Plumbing", 12000, 18000, 10),
    ("PL-004", "Shower Head", "Plumbing", 7500, 11000, 10),
    ("PT-001", "Emulsion Paint White 20L", "Paint", 28000, 42000, 15),
    ("PT-002", "Oil Paint Gloss 4L", "Paint", 8500, 13000, 20),
    ("PT-003", "Paint Brush 4\"", "Paint", 1500, 2500, 30),
    ("BM-001", "Cement Cimerwa 50kg", "Building Materials", 11000, 13500, 50),
    ("BM-002", "Iron Sheets G32 3m", "Building Materials", 18000, 25000, 30),
    ("BM-003", "Concrete Blocks 6\"", "Building Materials", 500, 800, 200),
    ("BM-004", "River Sand (ton)", "Building Materials", 15000, 22000, 10),
    ("LB-001", "Timber 2x4 12ft", "Lumber", 4500, 6500, 40),
    ("LB-002", "Plywood 4x8 12mm", "Lumber", 22000, 30000, 15),
    ("LB-003", "Door Frame Set", "Lumber", 15000, 22000, 10),
    ("FT-001", "Wood Screws #8 100pc", "Fasteners", 1200, 2000, 50),
    ("FT-002", "Nails 4\" 1kg", "Fasteners", 2500, 3800, 40),
    ("FT-003", "Bolts M10 50pc", "Fasteners", 3500, 5500, 25),
    ("RF-001", "Roofing Tiles (bundle)", "Roofing", 12000, 18000, 20),
    ("RF-002", "Ridge Cap", "Roofing", 3500, 5000, 30),
    ("RF-003", "Gutter 3m PVC", "Roofing", 6500, 9500, 15),
    ("HD-001", "Door Lock Set", "Hardware", 8500, 12000, 15),
    ("HD-002", "Hinges 4\" (pair)", "Hardware", 1200, 2000, 40),
    ("HD-003", "Padlock 50mm", "Hardware", 2500, 4000, 25),
]

customers = [
    ("Jean de Dieu Habimana", "0788123456", "contractor"),
    ("Consolee Mukamana", "0788234567", "consumer"),
    ("Patrick Nshimiyimana", "0788345678", "contractor"),
    ("Esperance Uwimana", "0788456789", "business"),
    ("Emmanuel Tuyishime", "0788567890", "consumer"),
    ("Marie Rose Uwase", "0788678901", "contractor"),
    ("Jean Baptiste Ndayisaba", "0788789012", "business"),
    ("Aline Ingabire", "0788890123", "consumer"),
    ("David Niyonzima", "0788901234", "contractor"),
    ("Grace Uwimana", "0788012345", "consumer"),
    ("Samuel Habimana", "0787111111", "contractor"),
    ("Diane Mukasine", "0787222222", "business"),
    ("Peter Nshuti", "0787333333", "consumer"),
    ("Alice Uwera", "0787444444", "contractor"),
    ("Robert Ngabo", "0787555555", "consumer"),
    ("Sylvie Mutoni", "0787666666", "business"),
    ("Claude Twagirayezu", "0787777777", "contractor"),
    ("Beatrice Mukamisha", "0787888888", "consumer"),
    ("Innocent Niyibizi", "0787999999", "contractor"),
    ("Chantal Uwimana", "0787000000", "consumer"),
    ("Pacifique Niyonzima", "0788111112", "business"),
    ("Dativa Mukandekezi", "0788222223", "contractor"),
    ("Aimee Uwineza", "0788333334", "consumer"),
    ("Fidele Habiyaremye", "0788444445", "contractor"),
    ("Goretti Mukamusoni", "0788555556", "business"),
    ("Hassan Niyomugabo", "0788666667", "consumer"),
    ("Immaculee Uwimana", "0788777778", "contractor"),
    ("Jacques Nzeyimana", "0788888889", "consumer"),
    ("Kevine Mukarwego", "0788999990", "business"),
    ("Leoncie Uwimana", "0788000001", "contractor"),
]

payment_methods = ["cash", "mobile_money", "card", "credit"]
payment_weights = [0.45, 0.35, 0.15, 0.05]


def get_seasonal_multiplier(date):
    month = date.month
    if month in [6, 7, 8, 9]:
        return random.uniform(1.3, 1.8)
    if month in [12, 1, 2]:
        return random.uniform(1.1, 1.5)
    if month in [3, 4, 5, 10, 11]:
        return random.uniform(0.5, 0.9)
    return 1.0


end_date = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
start_date = end_date - timedelta(days=90)

transactions = []
current_stock = {p[0]: random.randint(50, 200) for p in products}

for day in range(91):
    current_date = start_date + timedelta(days=day)
    seasonal_mult = get_seasonal_multiplier(current_date)

    if current_date.weekday() < 5:
        num_transactions = int(random.randint(20, 40) * seasonal_mult)
    else:
        num_transactions = int(random.randint(10, 20) * seasonal_mult * 0.7)

    for _ in range(max(1, num_transactions)):
        if seasonal_mult > 1.2:
            product = random.choice(products[:6] + products[18:28])
        else:
            product = random.choice(products)

        quantity = random.randint(1, 5) if random.random() < 0.7 else random.randint(5, 20)
        unit_price = product[4]
        total = quantity * unit_price
        discount = random.choice([0, 0, 0, 0, 0.05, 0.10]) * total
        total -= discount
        customer = random.choice(customers)

        transactions.append([
            current_date.strftime("%Y-%m-%d"),
            product[0],
            product[1],
            product[2],
            quantity,
            unit_price,
            round(total, 2),
            random.choices(payment_methods, payment_weights)[0],
            customer[0],
            customer[1],
        ])

        current_stock[product[0]] -= quantity
        if current_stock[product[0]] < 0:
            current_stock[product[0]] = random.randint(20, 100)

transactions_path = OUTPUT_DIR / "retailpulse_90days_transactions.csv"
products_path = OUTPUT_DIR / "retailpulse_products.csv"

with open(transactions_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow([
        "transaction_date", "sku_code", "product_name", "category",
        "quantity", "unit_price", "total_amount", "payment_method",
        "customer_name", "customer_phone",
    ])
    writer.writerows(transactions)

with open(products_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["sku_code", "product_name", "category", "unit_cost", "unit_price", "reorder_point"])
    writer.writerows(products)

print(f"Generated {len(transactions)} transaction rows over 90 days")
print(f"Generated {len(products)} products")
print(f"Generated {len(customers)} customers")
print(f"Transactions CSV: {transactions_path}")
print(f"Products CSV: {products_path}")
print(f"Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")

upload_sample_path = OUTPUT_DIR / "pos_upload_sample.csv"
today_label = end_date.strftime("%Y-%m-%d")
upload_rows = [
    ["UPLOAD-001", "Imported Nails 2in", "Hardware", 3500, 10, f"{today_label}T09:15:00", "Test Customer A", "+250788111111", "mobile_money"],
    ["UPLOAD-002", "Imported Wire Mesh", "Construction", 15000, 5, f"{today_label}T09:30:00", "Test Customer A", "+250788111111", "card"],
    ["UPLOAD-003", "Imported Door Hinge", "Hardware", 4500, 8, f"{today_label}T10:00:00", "Test Customer B", "+250788222222", "cash"],
    ["UPLOAD-004", "Imported PVC Elbow", "Plumbing", 6500, 12, f"{today_label}T10:45:00", "Test Customer C", "+250788333333", "mobile_money"],
    ["UPLOAD-005", "Imported LED Bulb Pack", "Electrical", 2500, 20, f"{today_label}T11:00:00", "Test Customer D", "+250788444444", "credit"],
    ["UPLOAD-006", "Imported Paint Roller", "Paint", 3200, 6, f"{today_label}T11:30:00", "Test Customer E", "+250788555555", "cash"],
    ["UPLOAD-007", "Imported Measuring Tape", "Hand Tools", 3500, 4, f"{today_label}T12:00:00", "Test Customer F", "+250788666666", "mobile_money"],
    ["UPLOAD-008", "Imported Roofing Nails", "Fasteners", 3800, 15, f"{today_label}T13:15:00", "Test Customer G", "+250788777777", "bank_transfer"],
    ["UPLOAD-009", "Imported Cement Bag", "Building Materials", 13500, 8, f"{today_label}T14:00:00", "Test Customer H", "+250788888888", "card"],
    ["UPLOAD-010", "Imported Drill Bits Set", "Power Tools", 12000, 3, f"{today_label}T15:30:00", "Test Customer I", "+250788999999", "mobile_money"],
]
with open(upload_sample_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow([
        "sku_code", "product_name", "category", "unit_price", "quantity",
        "transaction_date", "customer_name", "customer_phone", "payment_method",
    ])
    writer.writerows(upload_rows)
print(f"Upload sample CSV: {upload_sample_path} ({today_label})")
