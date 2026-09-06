# Luces del Moji A3 desde tu Mac

Tres archivos:

| Archivo | Para qué |
|---|---|
| `PROTOCOLO.md` | Cómo le habla la app oficial al driver board (sacado del APK) |
| `prueba-en-maquina.sh` | Prueba de vida: prende la luz blanca 2 s y la apaga |
| `luces.mjs` | Panel web con las 5 luces + apagado; corre en la Mac y manda por adb |

## 1. Preparar la máquina (una sola vez)

En la pantalla del Moji: **Ajustes → Acerca del dispositivo → toca 7 veces
"Número de compilación"** → aparece **Opciones de desarrollador** → enciende
**Depuración USB**. Conecta un cable USB de la máquina a la Mac y acepta el
aviso "¿Permitir depuración USB?" en la pantalla del Moji.

Si prefieres sin cable (misma red WiFi): en Opciones de desarrollador activa
**Depuración inalámbrica** o, con el cable puesto una vez,
`adb tcpip 5555` y luego `adb connect <ip-del-moji>:5555`.

## 2. Prueba de vida

```bash
cd tools/moji-luces
./prueba-en-maquina.sh
```

Te dice qué máquina es, si el puerto existe, si hay root, qué contesta el
board, y **prende la luz blanca al 40% dos segundos**. Si la ves prender, el
protocolo está probado.

## 3. El panel

```bash
node luces.mjs            # o: node luces.mjs --su   (si la prueba lo indicó)
```

Abre **http://localhost:8080**. Cinco botones, un control de intensidad y
"Apagar todo". La UV se apaga sola a los 20 segundos aunque nadie la toque.

Para verlo sin la máquina: `node luces.mjs --fake` (imprime lo que mandaría).

## Qué sigue después de que prenda

- **Cámara:** es UVC estándar. El siguiente paso es capturar la imagen con
  cada luz y subirla al expediente de la clienta en Venus.
- **App en la máquina:** hoy el puente corre en la Mac por adb. Cuando el
  flujo esté probado, se mueve a una app dentro del Moji que exponga el
  mismo panel en la red del estudio, sin Mac de por medio.
- **El análisis** (poros, manchas, arrugas) sigue viviendo en la nube del
  fabricante. Para eso está su API pública — ver PROTOCOLO.md y la memoria
  del proyecto.
