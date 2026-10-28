"""Builds the user-study Event Log: the Road Traffic Fine Management log
translated to Spanish, with synthetic case and event attributes.

    python3 user-study/build_rtfm_es.py [input.csv] [output.csv]

The input is an RTFM CSV export in the column layout of
`scripts/seed_log/road_traffic_fine_10k.csv`. The output is deterministic for a
given input: every synthetic value is drawn from a generator seeded with the
case id, so running it on the full log or on a sample gives each case the same
values. Only the standard library is used.

Each synthetic attribute is drawn conditionally on the case's real outcome
(see `outcome`), which plants the patterns the questionnaire asks about. The
planted effects are listed in `user-study/README.md`.
"""

import csv
import random
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT / "scripts/seed_log/road_traffic_fine_10k.csv"
DEFAULT_OUTPUT = ROOT / "scripts/seed_log/rtfm_es.csv"
SEED = "prodiff-user-study"

ACTIVITIES = {
    "Create Fine": "Crear multa",
    "Send Fine": "Enviar multa",
    "Insert Fine Notification": "Registrar notificación",
    "Add penalty": "Aplicar recargo",
    "Payment": "Pago",
    "Send for Credit Collection": "Enviar a cobranza",
    "Insert Date Appeal to Prefecture": "Registrar apelación a Prefectura",
    "Send Appeal to Prefecture": "Enviar apelación a Prefectura",
    "Receive Result Appeal from Prefecture": "Recibir resultado de Prefectura",
    "Notify Result Appeal to Offender": "Notificar resultado al infractor",
    "Appeal to Judge": "Apelar ante juez",
}

# Articles of the Italian Codice della Strada present in the log.
ARTICLES = {
    "157": "Detención y estacionamiento",
    "158": "Estacionamiento prohibido",
    "7": "Circulación en zona restringida",
}

VEHICLES = {"A": "Automóvil", "C": "Vehículo comercial", "M": "Motocicleta"}

APPEALS = {
    "Insert Date Appeal to Prefecture",
    "Send Appeal to Prefecture",
    "Receive Result Appeal from Prefecture",
    "Notify Result Appeal to Offender",
    "Appeal to Judge",
}

# Mean age in years, share of repeat offenders and share detected on site,
# per outcome.
AGE_MEAN = {"apelacion": 45, "cobranza": 35, "pago_directo": 47, "pago_tardio": 43, "abierto": 41}
REPEAT = {"apelacion": 0.30, "cobranza": 0.38, "pago_directo": 0.10, "pago_tardio": 0.18, "abierto": 0.20}
ON_SITE = {"apelacion": 0.08, "cobranza": 0.22, "pago_directo": 0.92, "pago_tardio": 0.22, "abierto": 0.22}
REGIONS = [("Norte", 0.25), ("Centro", 0.45), ("Sur", 0.30)]

HEADER = [
    "ID Caso",
    "Actividad",
    "Fecha",
    "Funcionario",
    "Tipo de infracción",
    "Tipo de vehículo",
    "Monto multa",
    "Puntos descontados",
    "Canal de detección",
    "Región",
    "Edad del infractor",
    "Reincidente",
    "Total pagado",
    "Gastos de envío",
    "Monto con recargo",
    "Monto pago",
    "Medio de pago",
]


def parse_time(value):
    return datetime.strptime(value[:19], "%Y-%m-%d %H:%M:%S")


def number(value):
    return "" if value == "" else f"{float(value):g}"


def outcome(activities):
    """The case's real outcome, from its trace."""
    if APPEALS & set(activities):
        return "apelacion"
    if "Send for Credit Collection" in activities:
        return "cobranza"
    if "Payment" in activities:
        return "pago_directo" if "Send Fine" not in activities else "pago_tardio"
    return "abierto"


def weighted(rng, options):
    pick = rng.random()
    for value, weight in options:
        pick -= weight
        if pick < 0:
            return value
    return options[-1][0]


def payment_method(rng, days_since_previous, age):
    """Online payments come fast and from younger offenders; slow ones go
    through a bank or a municipal office."""
    online = 0.65 if days_since_previous <= 15 else 0.25
    if age < 35:
        online += 0.15
    rest = 1 - online
    return weighted(rng, [("En línea", online), ("Banco", rest * 0.6), ("Oficina municipal", rest * 0.4)])


def case_rows(case_id, events):
    rng = random.Random(f"{SEED}:{case_id}")
    events.sort(key=lambda e: parse_time(e["Complete Timestamp"]))
    kind = outcome([e["Activity"] for e in events])
    create = next(e for e in events if e["Activity"] == "Create Fine")

    age = min(85, max(18, round(rng.gauss(AGE_MEAN[kind], 12))))
    case = {
        "Tipo de infracción": ARTICLES.get(create["article"], "Otra"),
        "Tipo de vehículo": VEHICLES.get(create["vehicleClass"], create["vehicleClass"]),
        "Monto multa": number(create["amount"]),
        "Puntos descontados": create["points"],
        "Canal de detección": "Control en terreno" if rng.random() < ON_SITE[kind] else "Cámara de tránsito",
        "Región": weighted(rng, REGIONS),
        "Edad del infractor": str(age),
        "Reincidente": "Sí" if rng.random() < REPEAT[kind] else "No",
        "Total pagado": number(
            max((e["totalPaymentAmount"] for e in events if e["totalPaymentAmount"]), key=float, default="0")
        ),
    }

    previous = None
    for event in events:
        time = parse_time(event["Complete Timestamp"])
        activity = event["Activity"]
        row = {
            "ID Caso": case_id,
            "Actividad": ACTIVITIES[activity],
            "Fecha": time.strftime("%Y-%m-%d %H:%M:%S"),
            "Funcionario": f"F-{event['Resource']}" if activity == "Create Fine" and event["Resource"] else "",
            **case,
            "Gastos de envío": number(event["expense"]) if activity == "Send Fine" else "",
            "Monto con recargo": number(event["amount"]) if activity == "Add penalty" else "",
            "Monto pago": number(event["paymentAmount"]) if activity == "Payment" else "",
            "Medio de pago": "",
        }
        if activity == "Payment":
            days = (time - previous).days if previous else 0
            row["Medio de pago"] = payment_method(rng, days, age)
        previous = time
        yield row


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_INPUT
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUTPUT

    cases = {}
    with source.open(newline="", encoding="utf-8") as file:
        for event in csv.DictReader(file):
            cases.setdefault(event["Case ID"], []).append(event)

    with target.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=HEADER)
        writer.writeheader()
        for case_id in sorted(cases, key=lambda c: (len(c), c)):
            writer.writerows(case_rows(case_id, cases[case_id]))

    print(f"{len(cases)} cases written to {target}")


if __name__ == "__main__":
    main()
