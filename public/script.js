const ws = new WebSocket(`ws://${location.hostname}:8081`);
const $ = (id) => document.getElementById(id);
const MAX = 300;          // puntos visibles
const ADC_MAX = 4095;
const VREF = 3.3;         // aproximado; el ADC de la ESP32 no es perfectamente lineal
const datos = [];
let conectado = false;
const enviar = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

ws.onmessage = (e) => {
    const m = JSON.parse(e.data);

    if (m.type === 'ports') {
        $('ports').innerHTML = m.ports.length
        ? m.ports.map((p) => `<option value="${p.path}">${p.path} ${p.manufacturer}</option>`).join('')
        : '<option value="">Sin placas detectadas</option>';
    }

    if (m.type === 'status') {
        conectado = m.connected;
        $('estado').textContent = conectado ? `Conectado a ${m.path}` : 'Desconectado';
        $('estado').className = conectado ? 'on' : 'off';
        $('btnConn').textContent = conectado ? 'Desconectar' : 'Conectar';
        if (!conectado) { $('pwm').value = 0; $('pwmVal').textContent = 0; }
    }

    if (m.type === 'error') alert(m.msg);

    if (m.type === 'adc') {
        $('raw').textContent = m.raw;
        $('volt').textContent = (m.raw / ADC_MAX * VREF).toFixed(2);
        datos.push(m.raw);
        if (datos.length > MAX) datos.shift();
        dibujar();
    }
};

$('btnConn').onclick = () => {
    if (conectado) enviar({ type: 'disconnect' });
    else enviar({ type: 'connect', path: $('ports').value });
};

$('pwm').oninput = (e) => {
    $('pwmVal').textContent = e.target.value;
    enviar({ type: 'pwm', value: Number(e.target.value) });
};

$('rate').onchange = (e) => enviar({ type: 'rate', ms: Number(e.target.value) });

function dibujar() {
    const c = $('grafica'), g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);

    // Rejilla horizontal
    g.strokeStyle = '#26303b'; g.fillStyle = '#7d8a99'; g.font = '11px sans-serif';
    for (let i = 0; i <= 4; i++) {
        const y = (i / 4) * c.height;
        g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke();
        g.fillText((VREF * (1 - i / 4)).toFixed(2) + ' V', 4, y + (i === 0 ? 12 : -3));
    }

    g.strokeStyle = '#4fc3f7'; g.lineWidth = 2; g.beginPath();
    datos.forEach((v, i) => {
        const x = (i / (MAX - 1)) * c.width;
        const y = c.height - (v / ADC_MAX) * c.height;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.stroke();
}