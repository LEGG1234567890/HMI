const ws = new WebSocket(`ws://${location.hostname}:8081`);
const $ = (id) => document.getElementById(id);

// ---------- Navegación de pestañas ----------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  };
});

// ---------- Estado ----------
let conectado = false;
let modoAuto = false;
let archivando = false;
let m = Number(localStorage.getItem('m') ?? 0);
let b = Number(localStorage.getItem('b') ?? 0);
$('m').value = m;
$('b').value = b;

const MAX_PLOT = 100;
const histPV = [], histSP = [], histErr = [], histOP = [];
let registro = [];
let tInicioArchivo = 0;
let tsSamples = [];

const enviar = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));
const rawAclimatado = (raw) => m * raw + b;

// ---------- WebSocket ----------
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);

  if (m.type === 'ports') {
    $('ports').innerHTML = m.ports.length
      ? m.ports.map((p) => `<option value="${p.path}">${p.path} ${p.manufacturer}</option>`).join('')
      : '<option value="">Sin placas detectadas</option>';
  }

  if (m.type === 'status') {
    conectado = m.connected;
    $('estado').textContent = conectado ? `Conectado ${m.path} @${m.baud || ''}bps` : 'Desconectado';
    $('estado').className = conectado ? 'on' : 'off';
    $('btnConn').textContent = conectado ? 'Desconectar' : 'Conectar';
  }

  if (m.type === 'error') alert(m.msg);

  if (m.type === 'adc') {
    const pv = rawAclimatado(m.raw);
    const sp = Number($('referencia').value) || 0;
    const op = Number($('op').value) || 0;
    const err = sp - pv;

    $('raw').textContent = m.raw;
    $('pv').textContent = pv.toFixed(2);
    $('error').textContent = err.toFixed(2);
    $('rtt').textContent = m.rtt;

    tsSamples.push(m.t);
    if (tsSamples.length > 20) tsSamples.shift();

    [histPV, histSP, histErr, histOP].forEach((h) => { if (h.length > MAX_PLOT) h.shift(); });
    histPV.push(pv); histSP.push(sp); histErr.push(err); histOP.push(op);
    dibujar();

    if (archivando) {
      registro.push({ t: m.t - tInicioArchivo, raw: m.raw, pv: pv.toFixed(2), sp, err: err.toFixed(2), op });
      $('contador').textContent = registro.length;
    }
  }
};

// ---------- Conexión ----------
$('btnConn').onclick = () => {
  if (conectado) enviar({ type: 'disconnect' });
  else enviar({ type: 'connect', path: $('ports').value, baud: Number($('baud').value) });
};

// ---------- Manipulación (OP) ----------
$('op').onchange = (e) => {
  let v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
  e.target.value = v;
  enviar({ type: 'pwm', value: v });
};

// ---------- STOP ----------
$('btnStop').onclick = () => {
  $('op').value = 0;
  enviar({ type: 'pwm', value: 0 });
};

// ---------- Modo Ctrl (switch) ----------
$('modoCtrl').onclick = () => {
  modoAuto = !modoAuto;
  $('modoCtrl').textContent = modoAuto ? 'Automático' : 'Manual';
  $('modoCtrl').classList.toggle('on', modoAuto);
  // El control PID automático se implementará en la siguiente práctica.
};

// ---------- Ts ----------
$('ts').onchange = (e) => {
  const seg = Math.max(0.1, Number(e.target.value) || 1);
  e.target.value = seg;
  enviar({ type: 'rate', ms: Math.round(seg * 1000) });
};

// ---------- Archivar / Guardar ----------
$('archivar').onclick = () => {
  archivando = !archivando;
  $('archivar').textContent = archivando ? 'Archivando…' : 'OFF';
  $('archivar').classList.toggle('on', archivando);
  if (archivando) { registro = []; tInicioArchivo = Date.now(); $('contador').textContent = 0; }
};

$('btnSave').onclick = () => {
  if (!registro.length) { alert('No hay datos archivados. Activa "Archivar datos" primero.'); return; }
  const header = 'ts,raw,pv,sp,error,op\n';
  const csv = header + registro.map((r) => `${r.t},${r.raw},${r.pv},${r.sp},${r.err},${r.op}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `datos_${Date.now()}.csv`;
  a.click();
};

// ---------- Gráficas ----------
function dibujarSerie(ctx, w, h, serie1, serie2, max) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#26303b';
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  const linea = (serie, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    serie.forEach((v, i) => {
      const x = (i / (MAX_PLOT - 1)) * w;
      const y = h - (v / max) * h;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  };
  linea(serie1, '#4fc3f7');
  linea(serie2, '#66bb6a');
}

function dibujar() {
  const c1 = $('chartPV'), c2 = $('chartErr');
  dibujarSerie(c1.getContext('2d'), c1.width, c1.height, histSP, histPV, 340);
  dibujarSerie(c2.getContext('2d'), c2.width, c2.height, histErr, histOP, 100);
}