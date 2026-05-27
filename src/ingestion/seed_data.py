import csv
import random
import os
from faker import Faker
from datetime import datetime, timedelta

# Usamos español para que los datos parezcan reales de Ecuador/Latam
fake = Faker('es_ES')

# Asegurarnos de que exista la carpeta para guardar los CSV
os.makedirs("data/synthetic", exist_ok=True)

def generar_asegurados(cantidad=50):
    asegurados = []
    for _ in range(cantidad):
        asegurados.append({
            "id_asegurado": fake.uuid4(),
            "segmento": random.choice(["VIP", "Estandar", "Riesgo"]),
            "antiguedad_anos": random.randint(1, 15),
            "ciudad": random.choice(["Portoviejo", "Manta", "Quito", "Guayaquil", "Cuenca"]),
            "numero_polizas": random.randint(1, 4),
            "reclamos_12_meses": random.randint(0, 3)
        })
    
    with open("data/synthetic/asegurados.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=asegurados[0].keys())
        writer.writeheader()
        writer.writerows(asegurados)
    
    print(f"✅ {cantidad} Asegurados generados.")
    return asegurados

def generar_siniestros(asegurados, cantidad=100):
    siniestros = []
    for _ in range(cantidad):
        asegurado = random.choice(asegurados)
        fecha_ocurrencia = fake.date_between(start_date='-1y', end_date='today')
        dias_reporte = random.randint(0, 15)
        
        siniestros.append({
            "id_siniestro": fake.uuid4(),
            "id_poliza": fake.uuid4(), # Simplificado por ahora
            "id_asegurado": asegurado["id_asegurado"],
            "ramo": random.choice(["Vehiculos", "Salud", "Vida", "Generales", "Hogar"]),
            "cobertura": random.choice(["Choque", "Robo", "Incendio", "Daño a terceros"]),
            "fecha_ocurrencia": fecha_ocurrencia,
            "fecha_reporte": fecha_ocurrencia + timedelta(days=dias_reporte),
            "monto_reclamado": round(random.uniform(500, 15000), 2),
            "estado": random.choice(["Reserva", "Liquidado", "Pago Parcial"]),
            "dias_entre_ocurrencia_reporte": dias_reporte,
            "etiqueta_fraude_simulada": 1 if random.random() < 0.08 else 0 # 8% de fraude simulado
        })
        
    with open("data/synthetic/siniestros.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=siniestros[0].keys())
        writer.writeheader()
        writer.writerows(siniestros)
        
    print(f"✅ {cantidad} Siniestros generados.")

if __name__ == "__main__":
    print("Iniciando generación de datos sintéticos...")
    asegurados_creados = generar_asegurados(50)
    generar_siniestros(asegurados_creados, 200)
    print("¡Proceso completado! Revisa la carpeta data/synthetic/")