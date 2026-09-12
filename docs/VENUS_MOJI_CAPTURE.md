# Venus Moji: captura primero

Entrada: `https://venuscosmetologia.com.mx/moji` (también `/captura`).

1. Abre la URL en el Moji. En Chrome, instala la actualización enlazada de Venus y pulsa **Abrir Venus Moji**, o abre Venus desde Android. No desinstales la aplicación original del fabricante.
2. Inicia sesión en Venus, busca a la clienta y confirma su nombre.
3. Ajusta la orientación. En Venus 0.8 el botón pide un pulso blanco de máximo 2 segundos y toma un cuadro del video; en Chrome el botón identifica claramente que no controla las luces.
4. Guarda hasta cuatro fotos y pulsa **Continuar a consulta y análisis**. Las fotos de esa sesión se seleccionan en la valoración sin subir archivos manualmente.
5. Confirma las fotos, su zona, orientación, fecha real y luz blanca. Registra el consentimiento, guarda el borrador y solicita OpenAI. Solo Said puede aprobar.

## Límites explícitos

La actualización sustituye la app de prueba Venus, no la del fabricante. Solo usa GPIO0 con escritura: leer `level` altera la dirección del driver y queda prohibido. No usa UART, UV, otras luces, root ni un servicio de fondo. El aviso nativo confirma escritura, no encendido físico. El apagado automático no garantiza protección frente a fallos del kernel, del proceso o del hardware; el operador debe comprobarlo y usar el interruptor si fuera necesario.

La captura nativa usa el cuadro del video dentro del pulso para evitar que `takePhoto` termine después de apagarse la luz. No afirma resolución nativa de 36 MP ni captura multiespectral. El informe Moji existente conserva sus imágenes originales.

El análisis abre otra pantalla dentro de la misma app, sin iframe. Esa pantalla no tiene privilegios de cámara ni de luces. Volver inicia una nueva sesión de captura; las fotos y valoraciones guardadas permanecen en el expediente. En modo seguimiento se pueden guardar fotos sin IA. El enlace administrativo del expediente se ofrece en Chrome, no dentro del contenedor nativo restringido.

## Verificación de esta entrega

- Pruebas de sesión: foto tardía de otra clienta, límite cuatro, duplicados, IDs no confiables y respuesta JSON detenida.
- Validación sintáctica ES2018 para Chrome70. No equivale a una prueba en ese dispositivo.
- 61 comprobaciones nativas y guardas estructurales; firma y alineación de APK verificadas. OFF explícito reintenta incluso tras un fallo; ON queda bloqueado si falló OFF.
- Revisión independiente de especificación y seguridad completadas, incluida separación de cámara y análisis.
- APK publicado como `/downloads/venus-moji-captura-0.8.0.apk`; SHA256 `9d118ffa84a014c1f7aa209a532c95d65a15f60087f3aa4c39a694a930f4f556`.
- El Moji no respondió en `192.168.100.13:5555`. No se instaló ni se activó remotamente la luz durante esta entrega. Sigue pendiente la validación física conjunta de la actualización 0.8.

Construcción reproducible y restricciones: `tools/moji-capture/android/README.md`. La identidad de firma se referencia localmente; no está en el repositorio.
