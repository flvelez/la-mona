# Desplegar La Mona

El juego es un **proceso Node de siempre**, no una función sin estado. Las
salas viven en memoria, así que hay una regla que no se puede romper:

> **UNA SOLA INSTANCIA.** Si la plataforma levanta dos, dos jugadores con el
> mismo código pueden caer en instancias distintas y no verse. El fallo es
> intermitente y desconcertante.

Para comprobarlo en cualquier momento, que dos jugadores abran `/salud`:

```bash
curl https://TU-APP/salud
# {"ok":true,"activo":123,"maquina":"...","salas":2}
```

Si el campo `maquina` no coincide entre ellos, hay más de una instancia.

---

# Opción A: Render (plan gratuito, sin tarjeta)

Render **no escala más allá de una instancia** en el plan gratuito, que es
justo lo que este juego necesita. Y cuenta los mensajes WebSocket como
tráfico, así que el latido del servidor (cada 25 s) **evita que se duerma
mientras alguien esté jugando**.

Pegas honestas:
- Se duerme a los 15 minutos sin nadie conectado, y despertar tarda **~1
  minuto**. El primer jugador espera.
- Render avisa de que puede reiniciar un servicio gratuito en cualquier
  momento: eso cortaría una partida en curso (los jugadores vuelven a la
  entrada con un aviso, no se quedan colgados).
- 750 horas de instancia al mes por espacio de trabajo.

### 1. Subir el código a GitHub

El proyecto ya es un repositorio Git con todo confirmado. Falta publicarlo:

1. Crea una cuenta en https://github.com si no la tienes.
2. Crea un repositorio nuevo **vacío** (sin README ni .gitignore), por ejemplo
   `la-mona`.
3. Copia la URL que te da y, en la carpeta del proyecto:

```bash
git remote add origin https://github.com/TU-USUARIO/la-mona.git
git branch -M main
git push -u origin main
```

### 2. Crear el servicio en Render

1. Entra a https://render.com y regístrate (puedes usar tu cuenta de GitHub).
2. **New → Blueprint**.
3. Elige el repositorio `la-mona`. Render lee `render.yaml` y configura todo
   solo: plan gratuito, una instancia, y `/salud` como comprobación.
4. **Apply**. El primer despliegue tarda unos minutos.

Te quedará una URL tipo `https://la-mona.onrender.com`.

### 3. Actualizar después

```bash
git add -A
git commit -m "lo que cambiaste"
git push
```

Render redespliega solo en cada `push`.

### Ajustes

En Render: **Environment → Environment Variables**.

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | lo pone Render | No lo toques |
| `SEGUNDOS_POR_TURNO` | 45 | Tiempo por turno; `0` desactiva el turno automático |
| `MINUTOS_SALA_VACIA` | 10 | Cuánto sobrevive una sala sin nadie conectado |

---

# Opción B: Fly.io (necesita tarjeta)

La app ya estuvo desplegada aquí en `la-mona.fly.dev`. Fly terminó su periodo
de prueba, así que hace falta añadir una tarjeta en https://fly.io/trial para
reactivarla. Con `auto_stop_machines = "stop"` (lo que trae `fly.toml`) la
máquina solo corre mientras alguien juega.

```bash
fly deploy --ha=false
```

**El `--ha=false` siempre**: sin él, Fly levanta dos máquinas y se rompen las
salas. Compruébalo con `fly status`; si algún día aparecen dos,
`fly scale count 1`.

Región: `iad` (Ashburn, EE. UU. este). Bogotá (`bog`) quedó deprecada y Fly ya
no deja crear máquinas ahí. `gru` (São Paulo) es la única opción sudamericana.

---

## Qué pasa al redesplegar

La plataforma reinicia el proceso, y **las partidas en curso se pierden**
porque el estado vive en memoria. Los jugadores no se quedan colgados: vuelven
a la entrada con el aviso *"Esa sala ya no existe"*. Aun así, redespliega
cuando no haya nadie jugando.

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| "Reconectando…" sin parar | El navegador intenta `ws://` sobre `https://`; la plataforma debe servir TLS |
| Dos jugadores no se ven con el mismo código | Hay más de una instancia: compara el campo `maquina` de `/salud` |
| El primer jugador espera un minuto | El servicio estaba dormido. Normal en el plan gratuito de Render |
| "Esa sala ya no existe" a mitad de partida | El servicio se reinició. Creen una sala nueva |
