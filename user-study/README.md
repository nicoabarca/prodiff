# Estudio de usuarios: Event Log de multas de tránsito

Material del estudio de usuarios de ProDiff con el laboratorio de process mining.

| Archivo                                  | Contenido                                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `build_rtfm_es.py`                       | Genera el Event Log: RTFM traducido al español más atributos sintéticos. Solo biblioteca estándar.                           |
| `answer_key.py`                          | Recalcula las cifras de cada respuesta (requiere pandas).                                                                    |
| `cuestionario.md`                        | Lo que ve el participante: tareas, TAM y demografía.                                                                         |
| `clave-respuestas.md`                    | Respuestas correctas, la vista de ProDiff que resuelve cada tarea y la cifra que la respalda. No se entrega al participante. |
| `../scripts/seed_log/rtfm_es.{csv,json}` | El Event Log generado y su manifiesto, para `pnpm seed rtfm_es`.                                                             |

```bash
python3 user-study/build_rtfm_es.py
```

```bash
python3 user-study/answer_key.py
```

Por defecto lee la muestra de 10.000 casos de `scripts/seed_log/road_traffic_fine_10k.csv`. Para el log completo (150.370 casos), exportarlo a CSV con las mismas columnas y pasarlo como primer argumento. Cada valor sintético se sortea con una semilla derivada del ID del caso, así que un caso recibe los mismos valores en la muestra y en el log completo, pero las cifras de la clave cambian y hay que volver a correr `answer_key.py`.

## Traducción

| Original                              | Español                          |
| ------------------------------------- | -------------------------------- |
| Create Fine                           | Crear multa                      |
| Send Fine                             | Enviar multa                     |
| Insert Fine Notification              | Registrar notificación           |
| Add penalty                           | Aplicar recargo                  |
| Payment                               | Pago                             |
| Send for Credit Collection            | Enviar a cobranza                |
| Insert Date Appeal to Prefecture      | Registrar apelación a Prefectura |
| Send Appeal to Prefecture             | Enviar apelación a Prefectura    |
| Receive Result Appeal from Prefecture | Recibir resultado de Prefectura  |
| Notify Result Appeal to Offender      | Notificar resultado al infractor |
| Appeal to Judge                       | Apelar ante juez                 |

## Columnas

Reales, traducidas:

| Columna              | Alcance                   | Origen                                                                                                                             |
| -------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `Funcionario`        | evento (solo Crear multa) | `Resource`, con prefijo `F-` para que se lea como categoría                                                                        |
| `Tipo de infracción` | caso                      | `article`: 157 Detención y estacionamiento, 158 Estacionamiento prohibido, 7 Circulación en zona restringida (Codice della Strada) |
| `Tipo de vehículo`   | caso                      | `vehicleClass`: A Automóvil, C Vehículo comercial, M Motocicleta. El log no documenta estas letras; la lectura es nuestra.         |
| `Monto multa`        | caso                      | `amount` de Crear multa                                                                                                            |
| `Puntos descontados` | caso                      | `points`                                                                                                                           |
| `Total pagado`       | caso                      | último `totalPaymentAmount`                                                                                                        |
| `Gastos de envío`    | evento (Enviar multa)     | `expense`                                                                                                                          |
| `Monto con recargo`  | evento (Aplicar recargo)  | `amount` de Add penalty                                                                                                            |
| `Monto pago`         | evento (Pago)             | `paymentAmount`                                                                                                                    |

Descartadas: `Variant`, `Variant index`, `lifecycle:transition` (siempre `complete`), `notificationType` y `lastSent` (siempre `P`), `matricola` (19 eventos), `dismissal` (8 casos no `NIL` en la muestra).

Sintéticas, sorteadas según el desenlace real del caso (apelación, cobranza, pago directo sin Enviar multa, pago tardío, abierto):

| Columna              | Alcance       | Patrón plantado                                                                                                                                                                                       |
| -------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Canal de detección` | caso          | Control en terreno en 92% de los pagos directos y en 8% de las apelaciones; 22% en el resto. Explica la rama Crear multa → Pago.                                                                      |
| `Edad del infractor` | caso          | Normal de desviación 12, media 35 en cobranza, 47 en pago directo, 43 en pago tardío, 45 en apelación, 41 en abiertos.                                                                                |
| `Reincidente`        | caso          | Sí en 38% de cobranza, 30% de apelación, 18% de pago tardío, 10% de pago directo, 20% de abiertos.                                                                                                    |
| `Región`             | caso          | Norte 25%, Centro 45%, Sur 30%, independiente de todo. Es el distractor sin efecto.                                                                                                                   |
| `Medio de pago`      | evento (Pago) | En línea con 65% si el pago llega a 15 días o menos del evento anterior y 25% si no, más 15 puntos si el infractor tiene menos de 35 años; el resto se reparte 60/40 entre Banco y Oficina municipal. |

`Tipo de infracción` también difiere entre Cobranza y Pagadas, pero ese efecto viene del log real y no fue plantado.

## Antes de la sesión

- Correr un piloto con una persona fuera de la muestra y medir el tiempo por tarea.
- Revisar cada respuesta en ProDiff, no solo con `answer_key.py`: la clave se calculó con pandas replicando la eliminación de casos compartidos, pero el test de significancia de la app aplica corrección Benjamini-Hochberg y las cifras pueden redondear distinto.
- Decidir si el participante crea el Project desde el CSV o recibe uno ya creado sin Grupos. `pnpm seed rtfm_es` crea los seis Grupos de la clave, útil para verificar pero no para la sesión.
