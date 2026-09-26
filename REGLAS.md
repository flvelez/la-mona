# La Mona — reglamento implementado

Variante de la costa ecuatoriana tal como la juega el autor del proyecto. Se
aparta del instructivo público en un punto central: **La Mona es el comodín de
la baraja**, no el 2 de tréboles.

## Baraja y reparto

- **53 cartas**: las 52 normales más el comodín (**La Mona**).
- **2, 3 o 4 jugadores**. Con 4, se puede jugar en parejas (compañeros cruzados:
  0-2 y 1-3) o todos contra todos. Con 2 y 3, siempre individual.
- Al iniciar la ronda se ponen boca arriba en la mesa las cartas mínimas para
  que el resto reparta parejo entre los jugadores:

  | Jugadores | A la mesa | Por jugador | Tandas de reparto |
  |---|---|---|---|
  | 2 | 1 | 26 | 4 · 4 · 4 · 4 · 5 · 5 |
  | 3 | **2** | 17 | 4 · 4 · 4 · 5 |
  | 4 | 1 | 13 | 4 · 4 · 5 |

  Nunca sobra una carta ni se reparte una tanda de 1 o 2.
- Se reparte de a 4; el sobrante se suma a las últimas tandas (máximo 5).
  Después del primer reparto **no se ponen más cartas en la mesa**.
- Empieza el jugador a la izquierda del repartidor. Terminada la ronda, reparte
  el siguiente.

## Valor de las cartas

- Del 2 al K: su número (J=11, Q=12, K=13).
- **As: 1 o 14**, a elección de quien lo juega.
- **La Mona: 15.**

## Jugadas

Cada turno se juega **una sola carta**.

### Jugar abierto
Descartar la carta boca arriba en la mesa. **Prohibido si tienes una formación o
fila propia en la mesa** (única excepción: si no te queda ninguna otra jugada
legal, para que la partida no se trabe).

### Capturar (tomar y combinar)
Las cartas elegidas de la mesa se reparten en **grupos que sumen exactamente el
valor de tu carta**. Es la misma regla para "tomar" y para "combinar":

- un 7 se lleva otro 7 → grupo `[7]`
- un 9 se lleva un 3 y un 6 → grupo `[3+6]`
- un 7 se lleva un 3, un 4 y otro 7 → grupos `[3+4]` y `[7]`
- un As jugado como 14 se lleva un K y un As → grupo `[13+1]`

Las formaciones y filas **no se parten**: cada una cuenta como un solo grupo por
su valor declarado.

### Formar
Poner tu carta sobre uno o más montones declarando un total. **Requisito: tener
en la mano otra carta de ese total.** Ejemplo: con un 9 en la mano, pones un 2
sobre un 7 y anuncias *formando 9*.

- Cualquier jugador puede levantar una formación si tiene la carta.
- Cualquiera puede **subirle el valor** (un 8 formado + un As = 9, si tiene el 9).
- Si tienes La Mona, puedes **formar 15** para levantarlo tú mismo.

### Fila (apilar)
Apilar sobre un mismo valor declarado. **Requisito: tener en la mano otra carta
de ese valor.** A diferencia de una formación, **el valor de una fila no se puede
cambiar nunca**.

Ejemplo del reglamento: mesa `2 K 6 5 8`, en mano un 3 y un 8. Juegas el 3 sobre
el 5 (=8) y juntas el 8 y el 6+2 en una sola fila de ochos — cinco cartas que
levantas en tu siguiente turno con tu 8.

**Se puede seguir apilando sobre una formación que ya existe**, sea tuya o de
otro, y sirve para cualquier valor, **el 15 incluido**. Si formaste 15 con un 3
y una Q, y en tu siguiente turno tienes un 6 en la mano con un 9 en la mesa,
apilas ese 6+9 encima: quedan dos grupos de quince en la misma pila.

En el mismo movimiento también entran las sumas que **ya estaban sueltas en la
mesa**. Con una formación de 15, un 7 y un 8 sueltos, y un 9, al jugar tu 6
sobre el 9 se apila todo: `{15}` · `{7+8}` · `{6+9}`. Lo único obligatorio es
que **tu carta entre en alguno de los grupos**.

Jugando en parejas, el compañero también puede apilar sobre la formación — en
su propio turno, porque cada quien juega una carta en el suyo.

### La Mona
Vale 15 y captura cualquier combinación que sume 15. Si no logras armar 15,
**se ahoga**: queda en la mesa y nadie la puede levantar (ninguna carta vale 15).
Se la lleva quien capture las últimas cartas de la ronda.

## Variante de bloqueo: **Variante 2 (flexible)**

Con una formación o fila propia en la mesa:

| Acción | ¿Permitida? |
|---|---|
| Levantar tu formación | ✅ |
| Subirle el valor a tu formación | ✅ |
| Dejarla y formar **otro valor distinto** | ✅ |
| Dejarla y hacer fila de otro valor | ✅ |
| Levantar la formación de un rival | ✅ |
| Capturar cartas sueltas | ✅ |
| Jugar abierto | ❌ |

No puedes tener dos formaciones propias del mismo valor a la vez.

## Cierre de ronda y puntaje

Las cartas que queden en la mesa al terminar se las lleva **el último que
capturó**. Así se gana La Mona ahogada.

| Concepto | Puntos |
|---|---|
| Más cartas | 3 |
| Más espadas ("corazones negros") | 1 |
| La Mona (comodín) | 3 |
| 10♦ — "el 10 bonito" | 2 |
| 2♠ — "el 2 bonito" | 1 |
| Cada As | 1 (4 en total) |
| Cada **chupe** (dejar la mesa vacía) | +1 |

**14 puntos base** más los chupes. Si hay empate en "más cartas" o "más
espadas", nadie se lleva esos puntos. Gana la ronda quien más puntos sume; si
hay empate en puntos, la ronda no se la adjudica nadie.

**Rondas para ganar la partida: configurable de 1 a 10** desde el lobby.

---

Fuente base del reglamento (variante del 2♣):
[instructivo bilingüe de La Mona](https://www.sl-web.site/resources/pdf/instructionsMona.pdf).
