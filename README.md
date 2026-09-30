# HMI — Human-Machine Interface

Sistema de **Interfaz Hombre-Máquina (HMI)** desarrollado para el monitoreo, control y simulación de un proceso mediante una interfaz web.

El proyecto permite trabajar con dos escenarios:

* **Monitor:** conexión con hardware real mediante comunicación serial.
* **Simulación:** simulación de una planta **FOPDT (First Order Plus Dead Time)** mediante Python.
* **Variables:** configuración de calibración y visualización de parámetros de comunicación.

La aplicación utiliza una interfaz web desarrollada con **HTML, CSS y JavaScript**, un puente **Serial ↔ WebSocket** desarrollado en Node.js y un simulador de planta desarrollado en Python.

---

# Resumen rápido

Para utilizar el proyecto desde cero:

```bash
git clone https://github.com/LEGG1234567890/HMI.git

cd HMI

docker compose up --build
```

Después abre:

```text
http://localhost:8080
```

## Contenido

* [Características](#-características)
* [Estructura del proyecto](#-estructura-del-proyecto)
* [Requisitos](#-requisitos)
* [Instalación](#-instalación)
* [Ejecución con Docker](#-ejecución-con-docker)
* [Uso de la HMI](#-uso-de-la-hmi)
  * [Monitor](#1-monitor)
  * [Simulación](#2-simulación)
  * [Variables](#3-variables)
* [Comunicación con el hardware](#-comunicación-con-el-hardware)
* [Control PID](#-control-pid)
* [Registro de datos](#-registro-de-datos)
* [Desarrollo sin Docker](#-desarrollo-sin-docker)

---

# Características

La HMI cuenta con las siguientes funciones:

## Estructura del proyecto

### Monitoreo de hardware

* Detección automática de puertos seriales.
* Selección del puerto de comunicación.
* Selección de velocidad de comunicación.
* Lectura de una señal ADC.
* Conversión de ADC a PV mediante una ecuación de calibración.
* Visualización de:
  * PV — Variable de proceso.
  * SP — Referencia.
  * Error.
  * OP — Variable manipulada.
* Gráficas en tiempo real.
* Control manual y automático.
* Control PID discreto.
* Envío de PWM al microcontrolador.
* Botón de paro `STOP`.

### Simulación

Permite probar el sistema sin conectar hardware físico.

La planta se modela como:

**FOPDT — First Order Plus Dead Time**

con los parámetros:

* `Kp` — Ganancia del proceso.
* `τ` — Constante de tiempo.
* `θ` — Tiempo muerto.
* `Ts` — Tiempo de muestreo.
* `Inicial` — Condición inicial.

El simulador calcula automáticamente los coeficientes discretos:

* `a1`
* `b1`
* `b2`
* `N`

La simulación se ejecuta mediante una API HTTP desarrollada con Flask.

### Registro de datos

La HMI permite registrar los datos obtenidos durante una prueba y descargarlos posteriormente en formato CSV.

---

## Servicios

| Servicio    | Tecnología     | Puerto | Función                         |
| ----------- | -------------- | -----: | ------------------------------- |
| `hmi`       | Apache + PHP   | `8080` | Interfaz web                    |
| `bridge`    | Node.js        | `8081` | Comunicación Serial ↔ WebSocket |
| `simulator` | Python + Flask | `8082` | Simulación FOPDT                |

El archivo `docker-compose.yml` configura estos tres servicios y expone los puertos correspondientes.

---

# Estructura del proyecto

```text
HMI/
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── script.js
│
├── bridge/
│   ├── Dockerfile
│   ├── package.json
│   └── server.js
│
├── simulator/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app.py
│
├── firmware/
│   └── Firmware del microcontrolador
│
├── Dockerfile
├── docker-compose.yml
└── README.md
```

### `public/`

Contiene la interfaz gráfica.

* `index.html` — estructura de la HMI.
* `style.css` — estilos de la interfaz.
* `script.js` — lógica de comunicación, gráficas, PID, simulación y registro.

La interfaz actualmente contiene las pestañas **Monitor, Simulación y Variables**.

### `bridge/`

Contiene el servidor encargado de comunicar el navegador con el hardware.

Utiliza:

* Node.js
* `serialport`
* `ws`

El puente detecta puertos `/dev/ttyUSB*` y `/dev/ttyACM*`, administra la comunicación serial y publica los datos mediante WebSocket en el puerto `8081`.

### `simulator/`

Contiene el modelo matemático de la planta.

Utiliza:

* Python 3.12
* Flask
* Flask-CORS
* NumPy

El simulador proporciona los endpoints:

```text
POST /reset
POST /step
GET  /health
```

### `firmware/`

Contiene el código que debe ejecutarse en el microcontrolador conectado físicamente al equipo.

El firmware debe ser compatible con el protocolo serial utilizado por `bridge/server.js`.

---

# Requisitos

La forma recomendada de ejecutar el proyecto es mediante **Docker**.

## Requisitos mínimos

Se necesita:

* Git
* Docker
* Docker Compose
* Navegador web moderno
* Puerto USB disponible para el microcontrolador, si se utilizará el modo Monitor.

### Sistemas operativos

El proyecto puede ejecutarse en cualquier sistema operativo que soporte Docker, incluyendo:

* Linux
* Windows
* macOS

Para utilizar el hardware mediante USB, se deben tener en cuenta los permisos y acceso al dispositivo serial del sistema operativo.

---

# Instalación

Clona el repositorio:

```bash
git clone https://github.com/LEGG1234567890/HMI.git
```

Entra al directorio:

```bash
cd HMI
```

Verifica que Docker esté instalado:

```bash
docker --version
```

Y que Docker Compose esté disponible:

```bash
docker compose version
```

---

# Ejecución con Docker

La forma más sencilla de iniciar todo el sistema es:

```bash
docker compose up --build
```

La primera ejecución puede tardar algunos minutos debido a la construcción de las imágenes.

Cuando los servicios hayan iniciado, abre:

```text
http://localhost:8080
```

La HMI debería aparecer en el navegador.

El sistema utiliza:

```text
HMI          → http://localhost:8080
Bridge       → ws://localhost:8081
Simulator    → http://localhost:8082
```

El `docker-compose.yml` monta además `/dev` dentro del contenedor `bridge` para permitir el acceso a dispositivos seriales del sistema.

---

## Detener el sistema

Presiona:

```text
Ctrl + C
```

o ejecuta:

```bash
docker compose down
```

---

## Ejecutar en segundo plano

Si quieres mantener los servicios ejecutándose:

```bash
docker compose up -d
```

Para consultar los contenedores:

```bash
docker compose ps
```

Para consultar los registros:

```bash
docker compose logs -f
```

Para consultar solamente el puente:

```bash
docker compose logs -f bridge
```

Para consultar el simulador:

```bash
docker compose logs -f simulator
```

---

# Uso de la HMI

## 1. Monitor

La pestaña **Monitor** se utiliza cuando existe hardware conectado.

La pantalla contiene:

* Puerto serial.
* Baudrate.
* Estado de conexión.
* PV.
* SP.
* Error.
* OP.
* Tiempo de muestreo.
* Parámetros PID.
* Modo Manual/Automático.
* Registro de datos.
* Botón STOP.
* Gráficas en tiempo real.

La interfaz permite seleccionar `9600` o `115200` baudios.

---

## Conectar el hardware

1. Conecta el microcontrolador mediante USB.
2. Inicia Docker:

```bash
docker compose up
```

3. Abre:

```text
http://localhost:8080
```

4. Ve a **Monitor**.
5. Selecciona el puerto correspondiente.
6. Selecciona el baudrate.
7. Presiona **Conectar**.

El bridge busca automáticamente dispositivos cuyo nombre corresponda a:

```text
/dev/ttyUSB*
/dev/ttyACM*
```

---

## Variable de proceso — PV

La PV se obtiene a partir de la lectura ADC recibida del microcontrolador.

La conversión utilizada es:

```text
PV = m × ADC + b
```

donde:

* `ADC` = lectura cruda del sensor.
* `m` = pendiente de calibración.
* `b` = offset.

Los parámetros `m` y `b` se pueden modificar desde la pestaña **Variables**.

---

# 2. Simulación

La pestaña **Simulación** permite probar la HMI sin necesidad de conectar un microcontrolador.

El modelo utilizado es una planta FOPDT:

```text
             Kp
G(s) = ───────────── e^(-θs)
          τs + 1
```

Los parámetros que pueden modificarse son:

| Parámetro | Descripción                |
| --------- | -------------------------- |
| `Kp`      | Ganancia del proceso       |
| `τ`       | Constante de tiempo        |
| `θ`       | Tiempo muerto              |
| `Ts`      | Tiempo de muestreo         |
| `Inicial` | Valor inicial de la planta |

El simulador convierte el modelo continuo a una ecuación de diferencias y calcula:

```text
a1
b1
b2
N
```

---

## Ejecutar una simulación

1. Abre:

```text
http://localhost:8080
```

2. Selecciona **Simulación**.
3. Introduce los parámetros de la planta.
4. Introduce los parámetros del controlador.
5. Presiona:

```text
Aplicar / Reiniciar planta
```

6. Verifica los coeficientes calculados.
7. Establece el SP.
8. Selecciona el modo de control.
9. Presiona:

```text
Iniciar simulación
```

La HMI realizará solicitudes al simulador mediante:

```text
http://localhost:8082/reset
```

y:

```text
http://localhost:8082/step
```

---

# 3. Variables

La pestaña **Variables** permite observar y modificar parámetros relacionados con la adquisición de datos.

Actualmente contiene:

### Calibración

```text
PV = m × ADC + b
```

### ADC crudo

Muestra directamente el valor recibido del microcontrolador.

### Frecuencia real

Muestra la frecuencia aproximada de adquisición de datos.

### RTT

Muestra el tiempo de ida y vuelta de la comunicación entre el bridge y el hardware.

---

# Control PID

La HMI incorpora un controlador PID discreto implementado en JavaScript.

La estructura general es:

```text
SP ──────┐
         │
         ▼
       Error ──► PID ──► OP ──► Planta
         ▲                         │
         │                         │
         └──────── PV ◄────────────┘
```

El controlador utiliza:

```text
Kc
τi
τd
Ts
```

y calcula los coeficientes discretos:

```text
B0
B1
B2
```

La salida está limitada entre:

```text
0 ≤ OP ≤ 100
```

para evitar valores de manipulación fuera del rango permitido.

---

## Modo Manual

En modo Manual:

* El usuario controla directamente la OP.
* La referencia puede seguir la PV.
* El PID permanece desactivado.

Esto permite modificar la salida directamente sin intervención automática del controlador.

---

## Modo Automático

En modo Automático:

* El usuario establece el SP.
* El PID calcula el error:

```text
Error = SP - PV
```

* El controlador calcula la OP.
* La OP se mantiene dentro del rango `0–100`.

El cambio de Manual a Automático utiliza una inicialización **bumpless**, buscando evitar un salto brusco de la salida al activar el controlador.

---

# Comunicación con el hardware

El sistema utiliza el siguiente flujo:

```text
Browser
   │
   │ WebSocket
   ▼
Bridge :8081
   │
   │ Serial USB
   ▼
Microcontrolador
```

## Lectura ADC

El bridge realiza periódicamente una solicitud al microcontrolador enviando:

```text
0xFF
```

El dispositivo debe responder con **2 bytes** correspondientes a la lectura ADC.

El bridge reconstruye el valor:

```text
raw = ((byte1 << 8) | byte2) & 0x0FFF
```

por lo que actualmente se utiliza una lectura ADC de hasta **12 bits**.

---

## Escritura de PWM

Cuando la HMI modifica la OP, el bridge envía un byte:

```text
0 – 100
```

donde:

```text
0   → 0 %
100 → 100 %
```

El valor es limitado automáticamente al rango permitido.

---

## Cambio de frecuencia de adquisición

La HMI puede modificar el periodo de muestreo `Ts`.

El bridge recibe el periodo en milisegundos mediante un mensaje WebSocket y actualiza su frecuencia de polling.

---

# Registro de datos

La HMI permite registrar datos durante una prueba.

Para comenzar:

1. Ve a **Monitor** o **Simulación**.
2. Activa:

```text
Archivar datos
```

3. Ejecuta la prueba.
4. Cuando termines, presiona:

```text
Guardar Datos (SAVE)
```

Se generará un archivo CSV con los datos registrados.

En el modo Monitor se almacenan variables como:

```text
t
raw
pv
sp
err
op
```

Mientras que en Simulación se registran:

```text
t
pv
sp
err
op
```

---

# Desarrollo sin Docker

También es posible modificar los componentes individualmente.

## HMI

La interfaz web está compuesta por:

```text
public/index.html
public/style.css
public/script.js
```

Para realizar modificaciones visuales o de comportamiento basta con editar estos archivos.

---

## Bridge

El bridge utiliza:

```text
Node.js 22
serialport
ws
```

Estas dependencias están definidas en:

```text
bridge/package.json
```

Para ejecutarlo directamente:

```bash
cd bridge
npm install
node server.js
```

El servidor estará disponible en:

```text
ws://localhost:8081
```

---

## Simulador

El simulador utiliza:

```text
Python 3.12
Flask 3.0.3
Flask-CORS 4.0.1
NumPy 1.26.4
```

Instalación:

```bash
cd simulator

python3 -m venv venv
source venv/bin/activate

pip install -r requirements.txt
```

Ejecutar:

```bash
python app.py
```

El simulador estará disponible en:

```text
http://localhost:5000
```

---

# Autor

**Luis Enrique García Gallegos**

Proyecto es de desarrollo de una interfaz hombre-máquina para monitoreo, control y simulación de procesos. De uso libre.

Repositorio:

**HMI — Human-Machine Interface**

---