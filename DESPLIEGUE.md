# Desplegar La Mona en Fly.io

## La regla que no se puede romper

**Una sola máquina.** Las salas viven en memoria del proceso. Si Fly levanta
dos máquinas, dos jugadores con el mismo código pueden caer en máquinas
distintas y no verse: uno ve la sala vacía y el otro cree que la creó bien.
El fallo es intermitente y desconcertante.

Por eso `fly.toml` trae `max_machines_running = 1`, y todo despliegue va con
`--ha=false`. Para comprobarlo en cualquier momento:

```bash
fly status          # tiene que salir UNA sola máquina
curl https://TU-APP.fly.dev/salud
# {"ok":true,"activo":123,"maquina":"3d8d...","salas":2}
```

Si dos jugadores abren `/salud` y ven **`maquina` distinta**, ahí está el
problema: sobra una máquina. `fly scale count 1`.

## Pasos

### 1. Instalar flyctl (una vez)

```bash
curl -L https://fly.io/install.sh | sh
```

Añade la línea que te indique a tu `~/.zshrc` y abre una terminal nueva.

### 2. Entrar a tu cuenta

```bash
fly auth login
```

### 3. Elegir el nombre de la app

`la-mona` seguramente ya esté tomado: los nombres son globales. Abre
`fly.toml` y cambia la primera línea por algo tuyo:

```toml
app = "la-mona-ec"
```

### 4. Crear la app y desplegar

```bash
fly launch --no-deploy --copy-config --name la-mona-ec --region iad
fly deploy --ha=false
```

- `--copy-config` usa el `fly.toml` que ya está en el proyecto; si te pregunta
  si quiere sobrescribirlo, di que **no**.
- `--ha=false` es lo que evita que levante dos máquinas.
- `iad` es Ashburn (EE. UU. este). Bogotá (`bog`) quedó deprecada y Fly ya no
  deja crear máquinas ahí. Para un juego por turnos la latencia apenas importa;
  `gru` (São Paulo) es la única opción sudamericana si la prefieres.
  `fly platform regions` lista las disponibles.

Fly compila la imagen en sus servidores, así que **no necesitas Docker**.

### 5. Probar

```bash
fly open          # abre la app en el navegador
fly logs          # los registros en vivo
fly status        # confirma que hay UNA máquina
```

Crea una sala desde tu celular y entra con el código desde otro. Ya no hace
falta estar en la misma WiFi.

## Ajustes

Se cambian sin volver a desplegar:

```bash
fly secrets set SEGUNDOS_POR_TURNO=60    # reinicia la máquina al aplicarlo
```

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | 3000 | Lo pone Fly; no lo toques |
| `SEGUNDOS_POR_TURNO` | 45 | Tiempo por turno; `0` desactiva el turno automático |
| `MINUTOS_SALA_VACIA` | 10 | Cuánto sobrevive una sala sin nadie conectado |

## Qué pasa al redesplegar

Fly manda `SIGTERM`. El servidor cierra los WebSockets y suelta el puerto, y
**los jugadores reconectan solos** a la versión nueva gracias al reintento del
cliente. Pero ojo: **las partidas en curso se pierden**, porque el estado está
en memoria. Redespliega cuando no haya nadie jugando, o avisa antes.

## Sobre el arranque en frío

`auto_stop_machines = "stop"` apaga la máquina cuando nadie juega, y la
enciende sola cuando alguien entra. Ahorra, pero **el primer jugador espera
unos segundos**. Si prefieres que esté siempre encendida:

```toml
auto_stop_machines = false
min_machines_running = 1
```

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| La página carga pero dice "Reconectando…" sin parar | Falta `force_https = true`, o el navegador intenta `ws://` sobre `https://` |
| Dos jugadores no se ven con el mismo código | Hay más de una máquina: `fly status` y `fly scale count 1` |
| Se corta la conexión sola cada minuto | El latido del servidor no está llegando: revisa `fly logs` |
| `fly deploy` levanta dos máquinas | Faltó `--ha=false` |
