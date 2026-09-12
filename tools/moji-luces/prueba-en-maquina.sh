#!/usr/bin/env bash
# Prueba de vida del control de luces del Moji A3, paso por paso.
# Solo lee cosas y prende la luz BLANCA al 40% durante 2 segundos. Termina
# con todo apagado. Si este script prende la luz, el protocolo está probado
# y el panel (node luces.mjs) va a funcionar.
#
# Antes: en la máquina, Ajustes → Acerca → toca 7 veces "Número de
# compilación" → Opciones de desarrollador → Depuración USB. Cable USB a la
# Mac, o `adb connect <ip>:5555` si está por red.

set -u
PUERTO="${PUERTO:-/dev/ttyS4}"
BAUD="${BAUD:-115200}"
SU=""   # se llena solo si el puerto no es escribible y hay su

paso() { printf '\n\033[1m%s\033[0m\n' "$*"; }
sh_() { if [ -n "$SU" ]; then adb shell -T "su -c '$*'"; else adb shell -T "$*"; fi; }
manda() { printf '%b' "$1" | sh_ "cat > $PUERTO"; }

paso "1· ¿La Mac ve la máquina por ADB?"
if ! adb devices -l | tail -n +2 | grep -q 'device'; then
  adb devices -l
  echo "✗ adb no ve nada. Revisa Depuración USB / el cable, o: adb connect <ip>:5555"
  exit 1
fi
adb devices -l | tail -n +2 | grep device

paso "2· Qué máquina es"
echo "modelo:  $(adb shell getprop ro.product.model)"
echo "build:   $(adb shell getprop ro.build.display.id)"
echo "serie:   $(adb shell getprop ro.serialno)"
echo "android: $(adb shell getprop ro.build.version.release)"

paso "3· ¿Existe el puerto y quién puede escribirle?"
if ! adb shell "ls -l $PUERTO" 2>/dev/null; then
  echo "✗ no existe $PUERTO. Puertos que sí hay:"; adb shell 'ls -l /dev/ttyS* 2>/dev/null'
  exit 1
fi

paso "4· ¿Hay root (su)?"
if adb shell 'su -c id' 2>/dev/null | grep -q uid=0; then
  echo "sí, su funciona"
  if ! adb shell "[ -w $PUERTO ] && echo escribible" | grep -q escribible; then
    echo "el puerto no era escribible: uso su para escribirle (y lo abro con chmod 666, como hace la app)"
    adb shell "su -c 'chmod 666 $PUERTO'" 2>/dev/null
    SU=1
  fi
else
  echo "sin su"
  adb shell "[ -w $PUERTO ] && echo 'pero el puerto es escribible, no hace falta' || echo '✗ y el puerto NO es escribible: sin root no podemos escribirle'"
fi

paso "5· Versión del protocolo que guardó la app oficial"
adb shell settings get secure A3_LightControlVersionKey 2>/dev/null || echo "(no leíble)"

paso "6· Configurar el puerto: $BAUD raw"
if sh_ "stty -F $PUERTO $BAUD raw -echo" 2>/dev/null; then echo "ok"; else
  sh_ "stty -F $PUERTO $BAUD" 2>/dev/null && echo "ok (solo velocidad)" || echo "stty no disponible: sigo, la app oficial pudo dejarlo configurado"
fi

paso "7· Preguntarle al board su versión (VER_QUERY) — 2 s de escucha"
( sh_ "timeout 2 cat $PUERTO" 2>/dev/null & )
sleep 0.3
manda 'VER_QUERY\n\r'
sleep 2.3
echo "(si arriba no salió nada, el board no contesta o el puerto no es el bueno; la luz de abajo lo dirá)"

paso "8· LUZ BLANCA al 40% durante 2 segundos — mira la máquina"
manda 'TCCMD_PWM_SETL\n\r'
manda 'TCLCMD_W0%\n\rTCCCMD_W40%\n\rTCRCMD_W0%\n\r'
sleep 2

paso "9· Apagar"
manda 'TCCMD_OFF\n\r'

cat <<FIN

¿Prendió la luz blanca y se apagó?
  · SÍ  → protocolo probado. Corre el panel:  node luces.mjs${SU:+ --su}
  · NO  → mándame la salida completa de este script.
FIN
