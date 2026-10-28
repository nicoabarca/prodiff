# Clave de respuestas

No se entrega al participante. Cifras de `python3 user-study/answer_key.py` sobre la muestra de 10.000 casos; verificarlas en ProDiff antes de la sesión. Las comparaciones excluyen los casos compartidos, como lo hace ProDiff.

| Tarea | Respuesta | Dónde se resuelve en ProDiff                                                  | Respaldo                                                                                             | Función que muestra             |
| ----- | --------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------- |
| T1    | b         | Panel de Variants                                                             | 34,3% contra 32,7% de la variante de cobranza: la diferencia es estrecha a propósito                 | Variantes                       |
| T2    | b         | Directly-Follows Graph                                                        | Enviar a cobranza 3.288, Pago 1.117                                                                  | DFG                             |
| T3    | c         | Directly-Follows Graph                                                        | Pago → Pago, 264 veces; es la única                                                                  | DFG, bucles                     |
| T4    | c         | Group Filters, filtro de atributo sobre Actividad                             | 3.387 casos, 33,9%                                                                                   | Filtros y Grupos                |
| T5    | b         | Campo Compare: nota de casos compartidos                                      | 86 casos                                                                                             | Comparación y casos compartidos |
| T6    | a         | Filtro Follower (Pago eventualmente seguido de Enviar a cobranza), o Variants | Los 86 pagan antes de ir a cobranza (pago parcial)                                                   | Filtro Follower                 |
| T7    | c         | Statistics & data                                                             | Región: Centro 44%/45%, Sur 30%/30%, Norte 25%/24%                                                   | Test de significancia           |
| T8    | b         | Statistics & data, o Directed Rooted Tree                                     | Mediana 35 contra 46 años                                                                            | Atributo numérico de caso       |
| T9    | c         | Statistics & data                                                             | 37,9%; distractores: Pagadas 12,6%, Event Log 23,3%, y 56% es la tasa de cobranza entre reincidentes | Atributo categórico de caso     |
| T10   | a         | Statistics & data, tamaño de efecto                                           | Canal V ≈ 0,51, Reincidente ≈ 0,30, Tipo de infracción ≈ 0,08, Región ≈ 0,01                         | Tamaño de efecto                |
| T11   | b         | Directed Rooted Tree, comparando ambos Grupos                                 | Terreno: 69% Pago; Cámara: 94% Enviar multa                                                          | Árbol comparativo               |
| T12   | b         | Directly-Follows Graph dividido (Split)                                       | 91% de los casos con apelación vienen de Cámara                                                      | DFG Split                       |
| T13   | a         | Directed Rooted Tree, tiempo de transición en el nodo Pago                    | Mediana 4 contra 18 días hasta el Pago; 129 casos compartidos removidos                              | Atributo de evento y tiempos    |
| T14   | b         | Custom attributes, luego filtro numérico en Group Filters                     | 19,7% (910 de 4.626)                                                                                 | Atributos calculados            |
| T15   | c         | Statistics & data, duración de casos                                          | Mediana 632 días; Pagadas: 6 días                                                                    | Duraciones                      |

## Recorte a 12 tareas

Si el piloto excede el tiempo, quitar T3 (la responde el mismo DFG que T2), T6 (comparte cifra con T5) y T9 (la misma vista que T8). Se conservan todas las funciones salvo el filtro Follower.
