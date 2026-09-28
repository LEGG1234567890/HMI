const { SerialPort } = require('serialport');
const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ port: 8081 });
let port = null;
let currentPath = null;
let currentBaud = 9600;
let pollTimer = null;
let waitTimer = null;
let waiting = false;
let rx = [];
let pollMs = 1000;
let lastPorts = '';

const send = (ws, obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));
const broadcast = (obj) => wss.clients.forEach((c) => send(c, obj));

async function listPorts() {
    const all = await SerialPort.list();
    return all
        .filter((p) => /ttyUSB|ttyACM/.test(p.path))
        .map((p) => ({ path: p.path, manufacturer: p.manufacturer || '' }));
}

setInterval(async () => {
    const ports = await listPorts();
    const key = JSON.stringify(ports);
    if (key !== lastPorts) { lastPorts = key; broadcast({ type: 'ports', ports }); }
}, 2000);

function poll() {
    if (!port || !port.isOpen || waiting) return;
    waiting = true;
    rx = [];
    const tSend = Date.now();
    port.write(Buffer.from([255]));
    waitTimer = setTimeout(() => { waiting = false; rx = []; }, Math.max(300, pollMs));
    port._tSend = tSend;
}

function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(poll, pollMs);
}

function connect(path, baud) {
    if (port && port.isOpen) port.close();
    clearInterval(pollTimer);
    currentPath = path;
    currentBaud = baud || 9600;

    port = new SerialPort({ path, baudRate: currentBaud, hupcl: false }, (err) => {
        if (err) broadcast({ type: 'error', msg: err.message });
    });

    port.on('open', () => {
        broadcast({ type: 'status', connected: true, path, baud: currentBaud });
        setTimeout(startPolling, 2000); // espera a que la ESP32 termine de resetear
    });

    port.on('close', () => {
        clearInterval(pollTimer);
        waiting = false;
        broadcast({ type: 'status', connected: false });
    });

    port.on('data', (buf) => {
        if (!waiting) return;
        rx.push(...buf);
        if (rx.length >= 2) {
        clearTimeout(waitTimer);
        const raw = ((rx[0] << 8) | rx[1]) & 0x0FFF;
        const rtt = Date.now() - port._tSend;   // latencia ida y vuelta, útil para el reporte
        waiting = false;
        rx = [];
        broadcast({ type: 'adc', raw, rtt, t: Date.now() });
        }
    });
}

wss.on('connection', async (ws) => {
    send(ws, { type: 'ports', ports: await listPorts() });
    send(ws, { type: 'status', connected: !!(port && port.isOpen), path: currentPath, baud: currentBaud });

    ws.on('message', (raw) => {
        let m; try { m = JSON.parse(raw); } catch { return; }

        if (m.type === 'connect' && m.path) connect(m.path, m.baud);

        if (m.type === 'disconnect' && port && port.isOpen) {
        port.write(Buffer.from([0]), () => port.close());
        }

        if (m.type === 'pwm' && port && port.isOpen) {
        const v = Math.max(0, Math.min(100, Math.round(Number(m.value) || 0)));
        port.write(Buffer.from([v]));
        }

        if (m.type === 'rate') {
        pollMs = Math.max(5, Number(m.ms) || 1000);   // Ts en ms
        if (port && port.isOpen) startPolling();
        }
    });
});

console.log('Puente listo en ws://0.0.0.0:8081');