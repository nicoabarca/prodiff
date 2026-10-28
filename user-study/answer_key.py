"""Prints the figures behind each questionnaire answer, computed from the
user-study Event Log with pandas, in the order of `clave-respuestas.md`.

    python3 user-study/answer_key.py [rtfm_es.csv]

Comparisons drop the cases two Groups share, as ProDiff does.
"""

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "scripts/seed_log/rtfm_es.csv"

log = pd.read_csv(source)
log["Fecha"] = pd.to_datetime(log["Fecha"])
traces = log.groupby("ID Caso", sort=False)["Actividad"].apply(list)
cases = log.groupby("ID Caso", sort=False).first()
total = len(traces)


def holding(column, values):
    return set(log.loc[log[column].isin(values), "ID Caso"])


def reduced(a, b):
    shared = a & b
    return cases.loc[sorted(a - shared)], cases.loc[sorted(b - shared)], len(shared)


def share(frame, column):
    return frame[column].value_counts(normalize=True).round(3).to_dict()


print("P1 variantes más frecuentes")
for variant, n in traces.apply(" → ".join).value_counts().head(3).items():
    print(f"   {n / total:.1%}  {variant}")

log["Siguiente"] = log.groupby("ID Caso")["Actividad"].shift(-1)
print("P2 después de Aplicar recargo:", log.loc[log["Actividad"] == "Aplicar recargo", "Siguiente"].value_counts().head(3).to_dict())
print("P3 bucles:", log.loc[log["Actividad"] == log["Siguiente"], "Actividad"].value_counts().to_dict())

collection = holding("Actividad", ["Enviar a cobranza"])
paid = holding("Actividad", ["Pago"])
print(f"P4 Cobranza: {len(collection)} casos ({len(collection) / total:.1%})")
a, b, shared = reduced(collection, paid)
print(f"P5 casos compartidos Cobranza/Pagadas: {shared}")
pay_then_collect = traces.apply(lambda t: "Pago" in t and "Enviar a cobranza" in t[t.index("Pago"):]).sum()
print(f"P6 Pago seguido eventualmente de Enviar a cobranza: {pay_then_collect}")
for column in ["Región", "Canal de detección", "Reincidente", "Tipo de infracción"]:
    print(f"P7/P10 {column}: Cobranza {share(a, column)} | Pagadas {share(b, column)}")
print(f"P8 mediana edad: Cobranza {a['Edad del infractor'].median()} | Pagadas {b['Edad del infractor'].median()}")
print(f"P9 reincidentes: Cobranza {(a['Reincidente'] == 'Sí').mean():.1%} | Pagadas {(b['Reincidente'] == 'Sí').mean():.1%} | Event Log {(cases['Reincidente'] == 'Sí').mean():.1%}")

on_site, camera, _ = reduced(holding("Canal de detección", ["Control en terreno"]), holding("Canal de detección", ["Cámara de tránsito"]))
second = traces.apply(lambda t: t[1] if len(t) > 1 else "(fin)")
for name, group in [("Control en terreno", on_site), ("Cámara de tránsito", camera)]:
    print(f"P11 {name}, después de Crear multa: {second[group.index].value_counts(normalize=True).round(3).head(2).to_dict()}")
appeals = holding("Actividad", ["Registrar apelación a Prefectura", "Enviar apelación a Prefectura"])
print(f"P12 casos con apelación por canal: {share(cases.loc[sorted(appeals)], 'Canal de detección')}")

log["Anterior"] = log.groupby("ID Caso")["Fecha"].shift()
payments = log[log["Actividad"] == "Pago"].assign(dias=lambda p: (p["Fecha"] - p["Anterior"]).dt.total_seconds() / 86400)
online, offline, shared = reduced(holding("Medio de pago", ["En línea"]), holding("Medio de pago", ["Banco", "Oficina municipal"]))
for name, group in [("En línea", online), ("Banco u oficina", offline)]:
    days = payments.loc[payments["ID Caso"].isin(group.index), "dias"]
    print(f"P13 {name}: mediana {days.median():.1f} días hasta Pago (compartidos removidos: {shared})")

paid_cases = cases.loc[sorted(paid)]
ratio = paid_cases["Total pagado"] / paid_cases["Monto multa"]
print(f"P14 Pagadas con Proporción pagada >= 2: {(ratio >= 2).mean():.1%} ({(ratio >= 2).sum()} de {len(ratio)})")

durations = log.groupby("ID Caso")["Fecha"].agg(lambda s: (s.max() - s.min()).days)
print(f"P15 mediana de duración: Cobranza {durations[a.index].median()} días | Pagadas {durations[b.index].median()} días")
