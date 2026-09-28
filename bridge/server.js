const { SerialPort } = require('serialport');
const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8081 });
const BAUD = 9600;
let port = null;
let pollTimer = null;
let waitTimer = null;
let waiting = false;
let rx = [];
let pollMs = 50;
let lastPorts = '';

const send = (ws, obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));
const broadcast = (obj) => wss.clients.forEach((c) => send(c, obj));

async function listPorts() {
    const all = await SerialPort.list();
    return all
        .filter((p) => /ttyUSB|ttyACM/.test(p.path))
        .map((p) => ({ path: p.path, manufacturer: p.manufacturer || '' }));
}

// Detección automática de placas conectadas/desconectadas
setInterval(async () => {
    const ports = await listPorts();
    const key = JSON.stringify(ports);
    if (key !== lastPorts) {
        lastPorts = key;
        broadcast({ type: 'ports', ports });
    }
}, 2000);

function poll() {
    if (!port || !port.isOpen || waiting) return;
    waiting = true;
    rx = [];
    port.write(Buffer.from([255]));
    // Si la respuesta no llega completa en 200 ms, descarta y reintenta
    waitTimer = setTimeout(() => { waiting = false; rx = []; }, 200);
}

function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, pollMs);
}

function connect(path) {
    if (port && port.isOpen) port.close();
    clearInterval(pollTimer);

    // hupcl:false evita que abrir el puerto reinicie la ESP32 (no siempre funciona)
    port = new SerialPort({ path, baudRate: BAUD, hupcl: false }, (err) => {
        if (err) broadcast({ type: 'error', msg: err.message });
    });

    port.on('open', () => {
        broadcast({ type: 'status', connected: true, path });
        // Espera 2 s: si la placa se reinició, manda basura de arranque
        setTimeout(startPolling, 2000);
    });

    port.on('close', () => {
        clearInterval(pollTimer);
        waiting = false;
        broadcast({ type: 'status', connected: false });
    });

    port.on('data', (buf) => {
        if (!waiting) return;          // ignora bytes que no pedimos
        rx.push(...buf);
        if (rx.length >= 2) {
        clearTimeout(waitTimer);
        const raw = ((rx[0] << 8) | rx[1]) & 0x0FFF;
        waiting = false;
        rx = [];
        broadcast({ type: 'adc', raw });
        }
    });
}

wss.on('connection', async (ws) => {
    send(ws, { type: 'ports', ports: await listPorts() });
    send(ws, { type: 'status', connected: !!(port && port.isOpen), path: port && port.path });

    ws.on('message', (raw) => {
        let m;
        try { m = JSON.parse(raw); } catch { return; }

        if (m.type === 'connect' && m.path) connect(m.path);

        if (m.type === 'disconnect' && port && port.isOpen) {
        port.write(Buffer.from([0]), () => port.close());   // PWM a 0 antes de cerrar
        }

        if (m.type === 'pwm' && port && port.isOpen) {
        // Limitar a 0-100: valores mayores romperían el mapeo, y 255 es el comando de lectura
        const v = Math.max(0, Math.min(100, Math.round(Number(m.value) || 0)));
        port.write(Buffer.from([v]));
        }

        if (m.type === 'rate') {
        pollMs = Math.max(10, Math.min(1000, Number(m.ms) || 50));
        if (port && port.isOpen) startPolling();
        }
    });
});

console.log('Puente listo en ws://0.0.0.0:8081');