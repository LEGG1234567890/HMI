const $ = (id) => document.getElementById(id);

// ==================== PID DISCRETO ====================
class PIDDiscreto {
  constructor() {
    this.A1 = 1; this.B0 = 0; this.B1 = 0; this.B2 = 0;
    this.op_prev = 0; this.err_prev1 = 0; this.err_prev2 = 0;
    this.activo = false;
  }
  sintonizar(Kc, tau_i, tau_d, Ts) {
    if (tau_i === 0) tau_i = 0.0001;
    this.B0 = Kc * (1 + Ts / (2 * tau_i) + tau_d / Ts);
    this.B1 = Kc * (Ts / (2 * tau_i) - 1 - 2 * tau_d / Ts);
    this.B2 = Kc * (tau_d / Ts);
  }
  calcular(err) {
    if (!this.activo) return this.op_prev;
    let op = this.A1 * this.op_prev + this.B0 * err + this.B1 * this.err_prev1 + this.B2 * this.err_prev2;
    op = Math.max(0, Math.min(100, op));   // anti-windup simple
    this.op_prev = op;
    this.err_prev2 = this.err_prev1;
    this.err_prev1 = err;
    return op;
  }
  inicializarBumpless(op_actual, err_actual) {
    this.op_prev = op_actual;
    this.err_prev1 = err_actual;
    this.err_prev2 = err_actual;
    this.activo = true;
  }
  desactivar() { this.activo = false; }
}

const pidMonitor = new PIDDiscreto();
const pidSimulacion = new PIDDiscreto();

// Llama a pid.sintonizar() solo cuando Kc, Tau_i, Tau_d o Ts cambian,
// y una vez al inicio para que arranque con coeficientes válidos.
function wireSintonia(pid, prefix) {
  const kc = $(`kc-${prefix}`);
  const taui = $(`taui-${prefix}`);
  const taud = $(`taud-${prefix}`);
  const ts = $(`ts-${prefix}`);

  const resintonizar = () => {
    pid.sintonizar(
      Number(kc.value) || 0,
      Number(taui.value) || 0,
      Number(taud.value) || 0,
      Number(ts.value) || 1,
    );
  };

  [kc, taui, taud, ts].forEach((input) => input.addEventListener('change', resintonizar));

  resintonizar();          // primera sintonía al cargar la página
  return resintonizar;     // por si se necesita forzar la sintonía en otro punto (bumpless)
}

const resintonizarM = wireSintonia(pidMonitor, 'm');
const resintonizarS = wireSintonia(pidSimulacion, 's');

// ==================== PESTAÑAS ====================
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  };
});

// ==================== GRAFICADO ====================
const MAX_PLOT = 100;
function dibujarSerie(canvas, s1, s2, max, nombre1 = '', nombre2 = '') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Rejilla
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

  const color1 = '#4fc3f7';
  const color2 = '#66bb6a';
  linea(s1, color1);
  linea(s2, color2);

  // ---------- Leyenda ----------
  if (nombre1 || nombre2) {
    const items = [
      { nombre: nombre1, color: color1 },
      { nombre: nombre2, color: color2 },
    ].filter((it) => it.nombre);

    const boxSize = 10;
    const paddingX = 8;
    const paddingY = 6;
    const lineHeight = 16;
    const fontSize = 11;

    ctx.font = `${fontSize}px system-ui, sans-serif`;
    const anchoTexto = Math.max(...items.map((it) => ctx.measureText(it.nombre).width));
    const legendW = boxSize + 6 + anchoTexto + paddingX * 2;
    const legendH = items.length * lineHeight + paddingY * 2 - 4;

    const x0 = w - legendW - 8;   // esquina superior derecha
    const y0 = 8;

    ctx.fillStyle = 'rgba(13, 16, 21, 0.75)';
    ctx.fillRect(x0, y0, legendW, legendH);
    ctx.strokeStyle = '#2d3642';
    ctx.strokeRect(x0, y0, legendW, legendH);

    items.forEach((it, i) => {
      const y = y0 + paddingY + i * lineHeight;
      ctx.fillStyle = it.color;
      ctx.fillRect(x0 + paddingX, y + 2, boxSize, boxSize);
      ctx.fillStyle = '#e8eaed';
      ctx.textBaseline = 'top';
      ctx.fillText(it.nombre, x0 + paddingX + boxSize + 6, y);
    });
  }
}

// ==================== MODO MANUAL/AUTO (bumpless) ====================
// wireModo ahora acepta un callback opcional que se dispara al cambiar de modo,
// para que el PID pueda inicializarse en bumpless sin que nadie reasigne el onclick.
function wireModo(prefix, onCambio) {
  const btn = $(`modoCtrl-${prefix}`);
  const ref = $(`referencia-${prefix}`);
  const op = $(`op-${prefix}`);
  let auto = false;

  const aplicar = () => {
    ref.disabled = !auto;
    op.disabled = auto;
    btn.textContent = auto ? 'Automático' : 'Manual';
    btn.classList.toggle('on', auto);
  };
  aplicar();

  btn.onclick = () => {
    auto = !auto;
    aplicar();
    if (onCambio) onCambio(auto);
  };

  return {
    esAuto: () => auto,
    trackReferencia: (pv) => { if (!auto) ref.value = pv.toFixed(2); },
  };
}

const modoM = wireModo('m', (auto) => {
  if (auto) {
    resintonizarM();
    const opActual = Number($('op-m').value) || 0;
    const pv = Number($('pv-m').textContent) || 0;
    const sp = Number($('referencia-m').value) || 0;
    pidMonitor.inicializarBumpless(opActual, sp - pv);
  } else {
    pidMonitor.desactivar();
  }
});

const modoS = wireModo('s', (auto) => {
  if (auto) {
    resintonizarS();
    const opActual = Number($('op-s').value) || 0;
    const pv = Number($('pv-s').textContent) || 0;
    const sp = Number($('referencia-s').value) || 0;
    pidSimulacion.inicializarBumpless(opActual, sp - pv);
  } else {
    pidSimulacion.desactivar();
  }
});

// ==========================================================
// ========================= MONITOR =======================
// ==========================================================
const ws = new WebSocket(`ws://${location.hostname}:8081`);
let conectado = false;
const histPVm = [], histSPm = [], histErrm = [], histOPm = [];
let registroM = [], archivandoM = false, tInicioM = 0, tsSamplesM = [];

let mCal = Number($('m').value) || 1;
let bCal = Number($('b').value) || 0;
$('m').onchange = () => { mCal = Number($('m').value) || 1; };
$('b').onchange = () => { bCal = Number($('b').value) || 0; };

const enviarWs = (obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);

  if (msg.type === 'ports') {
    $('ports').innerHTML = msg.ports.length
      ? msg.ports.map((p) => `<option value="${p.path}">${p.path} ${p.manufacturer}</option>`).join('')
      : '<option value="">Sin placas detectadas</option>';
  }

  if (msg.type === 'status') {
    conectado = msg.connected;
    $('estado').textContent = conectado ? `Conectado ${msg.path} @${msg.baud || ''}bps` : 'Desconectado';
    $('estado').className = conectado ? 'on' : 'off';
    $('btnConn').textContent = conectado ? 'Desconectar' : 'Conectar';
  }

  if (msg.type === 'error') alert(msg.msg);

  if (msg.type === 'adc') {
    const pv = msg.raw * mCal + bCal;
    modoM.trackReferencia(pv);

    const sp = Number($('referencia-m').value) || 0;
    let op = Number($('op-m').value) || 0;
    const err = sp - pv;

    if (pidMonitor.activo) {
      op = pidMonitor.calcular(err);
      $('op-m').value = op.toFixed(0);
      enviarWs({ type: 'pwm', value: op });
    }

    $('raw').textContent = msg.raw;
    $('pv-m').textContent = pv.toFixed(2);
    $('error-m').textContent = err.toFixed(2);
    $('rtt').textContent = msg.rtt;

    tsSamplesM.push(msg.t);
    if (tsSamplesM.length > 20) tsSamplesM.shift();
    if (tsSamplesM.length > 1) {
      const dt = (tsSamplesM.at(-1) - tsSamplesM[0]) / (tsSamplesM.length - 1);
      $('fps').textContent = (1000 / dt).toFixed(2);
    }

    [histPVm, histSPm, histErrm, histOPm].forEach((h) => { if (h.length > MAX_PLOT) h.shift(); });
    histPVm.push(pv); histSPm.push(sp); histErrm.push(err); histOPm.push(op);
    dibujarSerie($('chartPV-m'), histSPm, histPVm, 340, 'SP', 'PV');
    dibujarSerie($('chartErr-m'), histErrm, histOPm, 100, 'Error', 'OP');
    if (archivandoM) {
      registroM.push({ t: msg.t - tInicioM, raw: msg.raw, pv: pv.toFixed(2), sp, err: err.toFixed(2), op });
      $('contador-m').textContent = registroM.length;
    }
  }
};

$('btnConn').onclick = () => {
  if (conectado) enviarWs({ type: 'disconnect' });
  else enviarWs({ type: 'connect', path: $('ports').value, baud: Number($('baud').value) });
};
$('op-m').onchange = (e) => {
  const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
  e.target.value = v;
  enviarWs({ type: 'pwm', value: v });
};
$('btnStop-m').onclick = () => { $('op-m').value = 0; enviarWs({ type: 'pwm', value: 0 }); };
$('ts-m').onchange = (e) => {
  const seg = Math.max(0.1, Number(e.target.value) || 1);
  enviarWs({ type: 'rate', ms: Math.round(seg * 1000) });
};
$('archivar-m').onclick = () => {
  archivandoM = !archivandoM;
  $('archivar-m').textContent = archivandoM ? 'Archivando…' : 'OFF';
  $('archivar-m').classList.toggle('on', archivandoM);
  if (archivandoM) { registroM = []; tInicioM = Date.now(); $('contador-m').textContent = 0; }
};
$('btnSave-m').onclick = () => descargarCsv(registroM, 'monitor');

// ===========================================================
// ========================= SIMULACIÓN =======================
// ===========================================================
const SIM_URL = `http://${location.hostname}:8082`;
const histPVs = [], histSPs = [], histErrs = [], histOPs = [];
let registroS = [], archivandoS = false, tInicioS = 0;
let simTimer = null, simCorriendo = false;

async function aplicarParametrosSim() {
  const body = {
    k: Number($('kp-s').value) || 1,
    tau: Number($('tau-s').value) || 1,
    theta: Number($('theta-s').value) || 0,
    Ts: Number($('ts-s').value) || 1,
    inicial: Number($('inicial-s').value) || 0,
  };
  try {
    const r = await fetch(`${SIM_URL}/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const d = await r.json();
    $('coefA1-s').textContent = d.a1.toFixed(4);
    $('coefB1-s').textContent = d.b1.toFixed(4);
    $('coefB2-s').textContent = d.b2.toFixed(4);
    $('coefN-s').textContent = d.N;
    histPVs.length = histSPs.length = histErrs.length = histOPs.length = 0;
  } catch (err) {
    alert('No se pudo conectar al simulador (puerto 8082). ¿Está corriendo el contenedor?');
  }
}

async function pasoSim() {
  const auto = modoS.esAuto();
  let op = Number($('op-s').value) || 0;

  try {
    const r = await fetch(`${SIM_URL}/step`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op }),
    });
    const d = await r.json();
    const pv = d.pv;                       // el backend ya arranca en "inicial"; no sumar de nuevo
    modoS.trackReferencia(pv);

    const sp = Number($('referencia-s').value) || 0;
    const err = sp - pv;

    if (auto && pidSimulacion.activo) {
      op = pidSimulacion.calcular(err);
      $('op-s').value = op.toFixed(2);
    }

    $('pv-s').textContent = pv.toFixed(2);
    $('error-s').textContent = err.toFixed(2);

    [histPVs, histSPs, histErrs, histOPs].forEach((h) => { if (h.length > MAX_PLOT) h.shift(); });
    histPVs.push(pv); histSPs.push(sp); histErrs.push(err); histOPs.push(op);
    dibujarSerie($('chartPV-s'), histSPs, histPVs, Math.max(10, Math.max(...histPVs, ...histSPs) * 1.2), 'SP', 'PV');
    dibujarSerie($('chartErr-s'), histErrs, histOPs, 100, 'Error', 'OP');

    if (archivandoS) {
      registroS.push({ t: Date.now() - tInicioS, pv: pv.toFixed(2), sp, err: err.toFixed(2), op });
      $('contador-s').textContent = registroS.length;
    }
  } catch (err) {
    console.error('Error de simulación', err);
  }
}

$('btnReset-s').onclick = aplicarParametrosSim;

$('btnRun-s').onclick = async () => {
  if (simCorriendo) {
    clearInterval(simTimer);
    simCorriendo = false;
    $('btnRun-s').textContent = 'Iniciar simulación';
    return;
  }
  await aplicarParametrosSim();
  const Ts = Math.max(0.05, Number($('ts-s').value) || 1);
  simTimer = setInterval(pasoSim, Ts * 1000);
  simCorriendo = true;
  $('btnRun-s').textContent = 'Detener simulación';
};

$('btnStop-s').onclick = () => { $('op-s').value = 0; };

$('archivar-s').onclick = () => {
  archivandoS = !archivandoS;
  $('archivar-s').textContent = archivandoS ? 'Archivando…' : 'OFF';
  $('archivar-s').classList.toggle('on', archivandoS);
  if (archivandoS) { registroS = []; tInicioS = Date.now(); $('contador-s').textContent = 0; }
};
$('btnSave-s').onclick = () => descargarCsv(registroS, 'simulacion');

// ==================== CSV ====================
function descargarCsv(registro, nombre) {
  if (!registro.length) { alert('No hay datos archivados. Activa "Archivar datos" primero.'); return; }
  const header = Object.keys(registro[0]).join(',') + '\n';
  const csv = header + registro.map((r) => Object.values(r).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}_${Date.now()}.csv`;
  a.click();
}

aplicarParametrosSim();