# Moji A3 — protocolo de control de luces

Sacado del APK oficial `moji-a3-international.apk` (paquete
`com.silverllt.skincenter`, build `A3_Overseas`), descompilado con jadx el
6-sep-2026. Fabricante real: Shenzhen Zhimei Lihe (bitmoji-tek). Todo lo de
abajo viene del código que la propia app ejecuta; nada es suposición salvo
donde se dice.

## Cómo está armada la máquina

```
┌──────────────────┐    UART /dev/ttyS4     ┌──────────────┐
│  RK board        │◄──── 115200 8N1 ──────►│ driver board │──► LEDs (3 zonas × 5 luces)
│  Android (app)   │                        │              │
│                  │◄──── USB (UVC) ────────│  cámara 36MP │
└──────────────────┘                        └──────────────┘
```

- La cámara es **UVC estándar** (`libuvc`, `libusb100`): cualquier
  computadora la lee sin driver especial.
- Las luces las manda la app por **puerto serial**, en **texto plano**.
- La app corre como app de sistema. La librería serial intenta
  `/system/bin/su` + `chmod 777 /dev/ttyS4` si el puerto no es escribible.

## El puerto

| Parámetro | Valor | De dónde sale |
|---|---|---|
| Dispositivo | `/dev/ttyS4` | `SingleCameraActivity.lambda$getDeviceAtomicReference$0` |
| Velocidad | **115200** | `openSerialPort(file, 115200)` en `SingleCameraActivity` y `HomeActivity` |
| Modo | raw, 8N1, sin control de flujo | `cfmakeraw` en `libSerialPort.so` |
| Terminador | `\n\r` (**así, `\n` primero**) | `p3.a.X + "\n\r"` en todos los envíos |

> Ojo: `CameraActivity` (flujo viejo) abre el mismo puerto a **9600** y manda
> tramas binarias `AA 66 <cmd> <val> 23`. El A3 usa `NewCameraActivity`, que
> hereda de `SingleCameraActivity` — el flujo de texto a 115200. Si algún día
> no responde a texto, ese binario es el plan B.

## Formato de un comando de luz

```
TC{zona}CMD_{luz}{porcentaje}%\n\r
```

| Parte | Valores |
|---|---|
| `zona` | `L` izquierda · `C` centro · `R` derecha |
| `luz` | `W` blanca · `P` polarizada positiva · `N` polarizada negativa · `UV` ultravioleta · `WS` (no confirmado: ¿Wood / blanca lateral?) |
| `porcentaje` | entero 0–100 seguido de `%` |

Ejemplo — UV al 80% en el centro, protocolo v1 (manda las tres zonas):

```
TCLCMD_UV0%\n\rTCCCMD_UV80%\n\rTCRCMD_UV0%\n\r
```

En el A3 la app **solo enciende el centro**; izquierda y derecha siempre van
en `0%`. Los tres comandos se concatenan en un solo envío.

## Todos los comandos (`p3/a.java`, "ConfigCmd")

| Comando | Qué hace | Cuándo lo usa la app |
|---|---|---|
| `VER_QUERY` | Pide la versión del driver board | 3 veces al abrir (0.5 s, 1 s, 2 s) |
| `TC_HEART` | Latido | **Una sola vez** al abrir el puerto. No hace falta mantenerlo |
| `TCCMD_PWM_SETL` | "modo multi-luz" | Justo **antes** de la primera luz (preview) |
| `TCCMD_PWM_SETH` | "modo una luz" | Disponible; no se vio en el flujo normal |
| `TCCMD_OFF` | Apaga todo | Al terminar / al salir |
| `TC?CMD_W` `_P` `_N` `_UV` `_WS` | Luz por zona y porcentaje | Preview y captura |

## Secuencia que sigue la app

**Al abrir la cámara**

```
TCCMD_PWM_SETL\n\r
TCLCMD_W0%\n\rTCCCMD_W40%\n\rTCRCMD_W0%\n\r      ← blanca 40%, es el preview
```

**Durante la captura** (niveles reales, `cmd_light_percent_three`):

| Modo | Luz | Nivel |
|---|---|---|
| 1 | W blanca | 85% o 95% (y un 4% en un paso) |
| 2 | N polarizada negativa | 100% (y 15% en un paso) |
| 3 | P polarizada positiva | 80–85% |
| 5 | UV | 80% |
| 4 | WS | 80% |

**Al terminar:** `TCCMD_OFF\n\r`.

## Versión v1 vs v2 del protocolo

`HomeActivity` manda `VER_QUERY` y lee la respuesta del board:

- Si contiene `"V2"` → **v2**: se omiten las zonas en `0%`
  (`TCCCMD_UV80%\n\r` y ya).
- Si no → **v1**: se mandan las tres zonas siempre.

La app guarda el resultado en `Settings.Secure` bajo la clave
`A3_LightControlVersionKey` (valores `Light_Control_Version_1` /
`Light_Control_Version_2`). Se lee con
`adb shell settings get secure A3_LightControlVersionKey`.
Sin respuesta, la app usa **v1**. Empieza por v1.

## Lo que el board contesta

Texto. La app solo lo registra y busca `"V2"`; no espera ACK para mandar el
siguiente comando. Un lector en `/dev/ttyS4` verá la respuesta a `VER_QUERY`.

## Lo que NO sabemos todavía (se confirma en la máquina)

- Si ADB viene habilitado. Si no: Ajustes → Acerca → 7 toques en "Número de
  compilación" → Opciones de desarrollador → Depuración USB.
- Si `/dev/ttyS4` es escribible sin root o hace falta `su -c chmod`.
- Qué luz física es `WS`.
- Tiempo de asentamiento entre encender la luz y disparar (para la fase
  de cámara; no importa para prender luces).

## Seguridad

La UV es de **365 nm**. La app del fabricante la enciende solo el instante de
la foto. Cualquier control propio debe apagarla solo: `luces.mjs` la apaga a
los 20 segundos aunque nadie toque nada. **Nunca mirar de frente la UV
encendida, ni dejar a una clienta bajo ella más de lo que dura una foto.**

## De dónde salió cada cosa

- Constantes: `p3/a.java` (ConfigCmd)
- Armado de comandos y niveles: `ui/base/SingleCameraActivity.java`
  (`cmd_light_percent_three_v1/v2`, `cmd_light_close`, `cmd_multi_light_mode`)
- Apertura y detección v1/v2: `ui/HomeActivity.java` (`onSuccess`,
  `onDataReceived`), `s3/q.java` (`getLightControlVersion`)
- Librería serial: `com/kongqw/serialportlibrary/*`, `android/serialport/SerialPort.java`
- Flujo viejo binario: `ui/CameraActivity.java` (`F1`, `J1`)
