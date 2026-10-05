# Depósitos de tarjeta

La comisión es el 5% del dinero efectivamente cobrado con tarjeta, redondeado a centavos por registro de cobro. Se muestra el bruto, la comisión y el neto. No se cambia el precio de la clienta ni se altera el ingreso bruto de ventas; el panel de depósitos distingue el neto bancario.

La fecha estimada es el siguiente día laborable (lunes a viernes), cerca de las 12:00 en America/Mexico_City. Los cobros de viernes, sábado y domingo se esperan el lunes. No hay calendario de festivos ni conexión bancaria; una fecha vencida indica «Revisar en banco», nunca «Recibido» automáticamente.

En Reportes → Depósitos de tarjeta, filtrar por fecha de cobro y confirmar el depósito completo de un día o los cobros individuales. «Deshacer confirmación» vuelve a dejarlo pendiente y conserva la bitácora. El historial previo empieza sin confirmar. Se puede consultar hasta un año por rango.

Fuentes: ventas (incluye citas, anticipos, paquetes y ventas directas), CoffeeSale no canceladas y citas históricas sin Sale como respaldo. Los anticipos utilizados posteriormente no se vuelven a sumar. Las citas antiguas sin registro de venta muestran que su fecha de cobro es estimada.

Las confirmaciones se guardan en Setting bajo card_settlement:<fuente>:<id>, con monto, fecha de cobro, comisión, neto, usuario e historial. La escritura es transaccional y serializable; si cambia el monto o se elimina el cobro, una petición antigua no puede confirmarlo. Solo el rol admin puede consultar o confirmar depósitos.
