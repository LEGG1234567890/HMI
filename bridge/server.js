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
// ---------- Cola de escritura: serializa TODO lo que va al puerto ----------
// Evita que un byte de OP se escriba a mitad de una transacción de lectura (255 + 2 bytes resp),
// que es lo que causaba que el protocolo se desincronizara.
let writeQueue = Promise.resolve();
function encolarEscritura(fn) {
    writeQueue = writeQueue.then(fn).catch((err) => console.error('Error en escritura serial:', err));
    return writeQueue;
}
const send = (ws, obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));
const broadcast = (obj) => wss.clients.forEach((c) => send(c, obj));
async function listPorts() {
    try {
        const all = await SerialPort.list();
        return all
        .filter((p) => /ttyUSB|ttyACM/.test(p.path))
        .map((p) => ({ path: p.path, manufacturer: p.manufacturer || '' }));
    } catch (err) {
        console.error('Error listando puertos:', err.message);
        return [];
    }
}
setInterval(async () => {
    const ports = await listPorts();
    const key = JSON.stringify(ports);
    if (key !== lastPorts) { lastPorts = key; broadcast({ type: 'ports', ports }); }
}, 2000);
// ---------- Lectura ADC: ahora pasa por la cola ----------
function poll() {
    if (!port || !port.isOpen || waiting) return;
    encolarEscritura(() => new Promise((resolve) => {
        waiting = true;
        rx = [];
        const tSend = Date.now();
        port._tSend = tSend;
        port.write(Buffer.from([255]), () => {
        waitTimer = setTimeout(() => {
            waiting = false;
            rx = [];
            resolve();           // libera la cola aunque no haya llegado respuesta
        }, Math.max(300, pollMs));
        // 'resolve' real ocurre dentro de port.on('data', ...) cuando llegan los 2 bytes
        port._resolvePoll = resolve;
        });
    }));
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
        setTimeout(startPolling, 2000);
    });
    port.on('close', () => {
        clearInterval(pollTimer);
        waiting = false;
        broadcast({ type: 'status', connected: false });
    });
    port.on('data', (buf) => {
        if (!waiting) return;     // ignora bytes que no pedimos (p.ej. ruido de arranque)
        rx.push(...buf);
        if (rx.length >= 2) {
            clearTimeout(waitTimer);
            const raw = ((rx[0] << 8) | rx[1]) & 0x0FFF;
            const rtt = Date.now() - port._tSend;
            waiting = false;
            rx = [];
            broadcast({ type: 'adc', raw, rtt, t: Date.now() });
            if (port._resolvePoll) { port._resolvePoll(); port._resolvePoll = null; }
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
            encolarEscritura(() => new Promise((resolve) => {
                port.write(Buffer.from([0]), () => { port.close(); resolve(); });
            }));
        }
        // ---------- Escritura de OP: ahora también pasa por la cola ----------
        if (m.type === 'pwm' && port && port.isOpen) {
            const v = Math.max(0, Math.min(100, Math.round(Number(m.value) || 0)));
            encolarEscritura(() => new Promise((resolve) => {
                port.write(Buffer.from([v]), () => resolve());
        }));
        }
        if (m.type === 'rate') {
        pollMs = Math.max(5, Number(m.ms) || 1000);
        if (port && port.isOpen) startPolling();
        }
    });
});
console.log('Puente listo en ws://0.0.0.0:8081');