# Cuestionario: estudio de usuarios de ProDiff

## Contexto del Event Log

El Event Log registra la gestión de multas de tránsito de una policía municipal. Cada caso es una multa: se crea, puede pagarse en el acto o enviarse al infractor por correo, se notifica, recibe un recargo si no se paga a tiempo y, si sigue impaga, se envía a cobranza. El infractor puede apelar ante la Prefectura y luego ante un juez.

Además de las actividades, cada caso trae atributos del infractor y de la multa (`Edad del infractor`, `Reincidente`, `Canal de detección`, `Región`, `Tipo de infracción`, `Monto multa`, `Total pagado`, entre otros), y cada Pago registra su `Medio de pago`.

Para cada tarea marque una sola alternativa. Si no logra encontrar la respuesta, marque "No lo sé" en lugar de adivinar. Después de cada tarea indique qué tan seguro está de su respuesta (1 = nada seguro, 5 = totalmente seguro).

## Parte 1: Datos demográficos

**D1.** ¿Cuál es su posición actual?

- Estudiante de pregrado
- Estudiante de magíster
- Estudiante de doctorado
- Investigador(a) postdoctoral o académico(a)
- Profesional en la industria

**D2.** ¿Cuántos años de experiencia tiene en process mining?

- Menos de 1 año
- Entre 1 y 2 años
- Entre 3 y 5 años
- Más de 5 años

**D3.** ¿Qué herramientas de process mining ha usado? (puede marcar varias)

- Disco (Fluxicon)
- Celonis
- ProM
- PM4Py
- Apromore
- bupaR
- Otra: ____
- Ninguna

## Parte 2: Tareas

### Exploración del proceso

**T1.** ¿Cuál es la variante más frecuente del Event Log?

- a) Crear multa → Enviar multa
- b) Crear multa → Pago
- c) Crear multa → Enviar multa → Registrar notificación → Aplicar recargo → Enviar a cobranza
- d) Crear multa → Enviar multa → Registrar notificación → Aplicar recargo → Pago
- e) No lo sé

**T2.** ¿Qué actividad sigue directamente a "Aplicar recargo" con mayor frecuencia?

- a) Pago
- b) Enviar a cobranza
- c) Enviar apelación a Prefectura
- d) Registrar notificación
- e) No lo sé

**T3.** ¿Qué actividad se repite de forma consecutiva dentro de un mismo caso?

- a) Enviar multa
- b) Aplicar recargo
- c) Pago
- d) Ninguna actividad se repite de forma consecutiva
- e) No lo sé

### Grupos de casos

**T4.** Cree un Grupo llamado "Cobranza" con los casos que contienen la actividad "Enviar a cobranza". ¿Qué porcentaje del Event Log representa?

- a) Cerca del 10%
- b) Cerca del 20%
- c) Cerca del 34%
- d) Cerca del 50%
- e) No lo sé

**T5.** Cree un Grupo llamado "Pagadas" con los casos que contienen al menos un "Pago" y compárelo con "Cobranza". ¿Cuántos casos pertenecen a ambos Grupos?

- a) Ninguno
- b) 86
- c) 264
- d) 1.117
- e) No lo sé

**T6.** ¿Qué describe mejor a los casos que pertenecen a ambos Grupos?

- a) Pagaron y después fueron enviados a cobranza
- b) Fueron enviados a cobranza y después pagaron
- c) Apelaron ante la Prefectura y después pagaron
- d) Pagaron en el acto, sin que se enviara la multa
- e) No lo sé

### Comparación multi-perspectiva

Para T7 a T10 compare los Grupos "Cobranza" y "Pagadas".

**T7.** ¿Cuál de estos atributos NO presenta una diferencia estadísticamente significativa entre ambos Grupos?

- a) Edad del infractor
- b) Reincidente
- c) Región
- d) Canal de detección
- e) No lo sé

**T8.** ¿Qué afirmación sobre la edad de los infractores es correcta?

- a) Los infractores de "Cobranza" son mayores que los de "Pagadas"
- b) Los infractores de "Cobranza" son menores que los de "Pagadas"
- c) No hay diferencia de edad entre ambos Grupos
- d) La edad no puede compararse porque es un atributo del caso
- e) No lo sé

**T9.** ¿Aproximadamente qué porcentaje de los casos de "Cobranza" corresponde a infractores reincidentes?

- a) 13%
- b) 23%
- c) 38%
- d) 56%
- e) No lo sé

**T10.** ¿Cuál de estos atributos muestra la diferencia más fuerte (mayor tamaño de efecto) entre ambos Grupos?

- a) Canal de detección
- b) Reincidente
- c) Tipo de infracción
- d) Región
- e) No lo sé

### Flujo de control según atributos

**T11.** Cree los Grupos "Control en terreno" y "Cámara de tránsito" según el `Canal de detección` y compárelos. Después de "Crear multa", ¿qué ocurre con la mayoría de los casos de cada Grupo?

- a) En ambos Grupos la mayoría pasa a "Enviar multa"
- b) En "Control en terreno" la mayoría pasa a "Pago"; en "Cámara de tránsito", a "Enviar multa"
- c) En "Control en terreno" la mayoría pasa a "Enviar multa"; en "Cámara de tránsito", a "Pago"
- d) En ambos Grupos la mayoría pasa a "Pago"
- e) No lo sé

**T12.** Con la misma comparación, ¿en qué Grupo se concentran las apelaciones a la Prefectura?

- a) Casi todas en "Control en terreno"
- b) Casi todas en "Cámara de tránsito"
- c) Repartidas por igual entre ambos Grupos
- d) No hay apelaciones en ninguno de los dos Grupos
- e) No lo sé

### Atributos de evento, atributos calculados y tiempos

**T13.** Cree los Grupos "Pago en línea" (`Medio de pago` En línea) y "Pago en banco u oficina" (`Medio de pago` Banco u Oficina municipal) y compárelos. ¿En cuál de los dos el tiempo hasta el Pago es menor?

- a) Pago en línea
- b) Pago en banco u oficina
- c) Es igual en ambos
- d) No puede determinarse con estos datos
- e) No lo sé

**T14.** Cree el atributo calculado "Proporción pagada" = `Total pagado` / `Monto multa`. En el Grupo "Pagadas", ¿aproximadamente qué porcentaje de los casos pagó al menos el doble del monto original de la multa?

- a) 5%
- b) 20%
- c) 50%
- d) 75%
- e) No lo sé

**T15.** ¿Cuál es aproximadamente la mediana de la duración de los casos de "Cobranza"?

- a) Una semana
- b) Cuatro meses
- c) Un año y nueve meses
- d) Cuatro años
- e) No lo sé

## Parte 3: Percepción de ProDiff (TAM)

Indique su grado de acuerdo con cada afirmación: 1 = Totalmente en desacuerdo, 4 = Ni de acuerdo ni en desacuerdo, 7 = Totalmente de acuerdo.

### Utilidad percibida

- **U1.** Usar ProDiff me permitiría completar más rápido el análisis comparativo de procesos.
- **U2.** Usar ProDiff mejoraría mi desempeño al analizar diferencias entre grupos de casos.
- **U3.** Usar ProDiff aumentaría mi productividad en análisis de process mining.
- **U4.** Usar ProDiff haría más efectivos mis análisis multi-perspectiva.
- **U5.** ProDiff me facilita identificar qué atributos se asocian a diferencias en el comportamiento del proceso.
- **U6.** En general, ProDiff me resultaría útil en mi trabajo o investigación.

### Facilidad de uso percibida

- **F1.** Aprender a usar ProDiff fue fácil para mí.
- **F2.** Me resultó fácil lograr que ProDiff hiciera lo que yo quería.
- **F3.** Mi interacción con ProDiff fue clara y comprensible.
- **F4.** ProDiff es flexible para interactuar con él.
- **F5.** Me sería fácil llegar a ser hábil usando ProDiff.
- **F6.** En general, ProDiff es fácil de usar.

### Intención de uso

- **I1.** Si tuviera acceso a ProDiff, lo usaría para comparar grupos de casos.
- **I2.** Preferiría ProDiff a las herramientas que uso actualmente para este tipo de análisis.

### Preguntas abiertas

- **A1.** ¿Qué fue lo más útil de ProDiff?
- **A2.** ¿Qué fue lo más difícil o confuso?
- **A3.** ¿Qué agregaría o cambiaría?
