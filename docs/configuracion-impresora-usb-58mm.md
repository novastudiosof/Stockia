# Configuración de la impresora térmica de 58mm por USB

Guía para instalar y dejar lista la impresora térmica (probada con el modelo **POS-5890U-L**, de Zjiang) para imprimir las facturas de Stockia desde un computador con Windows 10/11 y Chrome.

## Qué se necesita

- Impresora térmica de 58mm con su cable USB y su fuente de poder.
- Un rollo de papel térmico de 58mm.
- El archivo del controlador **PrinterDriver.exe**. Viene en el CD o la memoria USB de la caja. Si no está, descárguelo solo desde una página del fabricante (Zjiang).
- Un computador con Windows y Chrome (o Edge).

## 1. Poner el papel y conectar

1. Abra la tapa de la impresora y ponga el rollo con el papel saliendo **por debajo** (el lado que imprime queda hacia el cabezal), como muestra el dibujo del manual. Deje un poco de papel afuera y cierre la tapa.
2. Conecte la fuente de poder y encienda la impresora.
3. **Todavía no conecte el cable USB al computador.** Primero se instala el controlador.

> Para comprobar que la impresora está sana, apáguela, mantenga pulsado el botón de avance de papel y enciéndala. Imprime una hoja de autotest con el modelo y los códigos de página.

## 2. Instalar el controlador

1. Con el USB **desconectado**, haga doble clic en **PrinterDriver.exe**.
2. Windows pregunta si permite cambios. Debe decir **Verified publisher: HUNAN ZIJIANG ELECTRONICS**. Pulse **Sí**.
3. En la ventana "Driver setup and config":
   - Sistema operativo: **Windows 10** (sirve también en Windows 11).
   - Impresora: **POS-58 Series Printer**.
   - Puerto: **USB001**.
   - Deje marcadas "Set as default printer" y "Create Shortcuts" si quiere que quede como impresora predeterminada.
4. Pulse **Begin Setup** y espere a que termine. Si Windows pide confirmar la instalación del controlador, acepte.
5. Pulse **Close**.

## 3. Conectar por USB

1. Conecte el cable USB al computador, directo a un puerto (mejor sin concentradores o hubs).
2. Espere unos 10 segundos.
3. Abra **Configuración → Bluetooth y dispositivos → Impresoras y escáneres**. Debe aparecer una impresora nueva (por ejemplo, "POS-58").
4. Si el puerto USB001 ya lo usaba otra impresora de pruebas, bórrela para que no se confunda.

## 4. Imprimir una factura desde Stockia

1. Entre a Stockia, abra la venta y pulse **Imprimir** en la factura.
2. En el diálogo de Chrome:
   - **Destino:** la impresora nueva (POS-58).
   - Abra **Más ajustes** (si está cerrado, pulse la flecha).
   - **Tamaño del papel:** elija **ZPrinter Paper (58 x 3276 mm)**.
   - **Márgenes:** **Ninguno**.
   - **Escala:** **Predeterminado** (100%).
   - En **Opciones**, deje apagados "Encabezados y pies de página" y "Gráficos de fondo".
3. En la parte superior de la factura de Stockia, el selector debe estar en **58mm**.
4. Pulse **Imprimir**.

Chrome recuerda estos ajustes para esa impresora, así que normalmente solo se configuran la primera vez en cada computador.

## 5. Si algo sale mal

| Problema | Qué hacer |
|---|---|
| Sale **mucho papel en blanco** al final | Cambie el tamaño del papel. Pruebe **58mm** (formulario propio de 58 x 200 mm) o **ZPrinter Paper (58 x 210 mm)**. Evite los de 297 mm. |
| Se **corta el borde derecho** (precios incompletos) | El papel mide 58mm pero la cabeza solo imprime 48mm. Stockia ya arma el ticket a 47mm; confirme que eligió "58mm" en el selector de la factura y márgenes en Ninguno. |
| Se **corta el borde izquierdo** | Stockia ya corre el ticket 5mm a la derecha en 58mm. Si aun así se corta, avise para ajustar el corrimiento de a 1 o 2 mm. |
| Salen **símbolos raros** o letras sin sentido | Está usando un controlador genérico de Windows ("Generic / Text Only" o "IBM Graphics 9pin"). Instale el controlador oficial (paso 2) y elija esa impresora. |
| **No sale nada** y el diálogo se cierra | Revise que la impresora elegida sea la oficial (no una "Pruebas") y que el puerto sea USB001. Compruebe que imprime desde el Bloc de notas. |
| La letra sale **punteada o clara** | En las preferencias de la impresora (Configuración → Impresoras → su impresora → Preferencias), suba la **densidad u oscuridad** un nivel. |
| No aparece el tamaño de papel de 58mm | Instale el controlador oficial. Si aun así falta, cree un formulario propio: `Win + R`, escriba `printui /s /t2`, marque "Crear un formulario nuevo", nómbrelo "58mm", ancho 58 mm, alto 200 mm, márgenes 0, y pulse "Guardar formulario". |

## 6. Imprimir desde el celular o por Bluetooth

Chrome del celular no imprime directo en esta impresora. Opciones:

- **Descargar el PDF** del ticket de 58mm desde la factura y enviarlo a imprimir con la app del fabricante, emparejando la impresora por Bluetooth.
- Con una app tipo **RawBT** (Android), que habla ESC/POS por Bluetooth. Imprimir directo desde Stockia con ella requiere programar un botón aparte (no está hecho).

## Datos de la impresora usada en las pruebas

- Modelo: POS-5890U-L ("58-LL Thermal Printer"), interfaz USB y Bluetooth.
- Papel: 58mm. Ancho de impresión: 384 puntos por línea (48mm útiles).
- Comandos: ESC/POS. Controlador oficial: PrinterDriver.exe (Hunan Zijiang Electronics).
