const $ = (id) => document.getElementById(id);
// ==================== COLORES DE LAS GRÁFICAS ====================
const COLORS = { op: '#4fc3f7', sp: '#ffa552', pv: '#66bb6a', err: '#ef5350' };
// ==================== INPUT "CONTROLADO" ====================
// El valor solo se confirma (y queda disponible via .get()) al presionar
// Enter o al perder el foco (change). Mientras el usuario escribe, el
// resto de la app sigue usando el último valor confirmado.
function numeroControlado(id, defaultValue = 0, { min, max } = {}) {
  const el = $(id);
  const clamp = (v) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };
  let valor = clamp(Number(el.value));
  if (!Number.isFinite(valor)) valor = defaultValue;
  const confirmar = () => {
    let v = Number(el.value);
    if (!Number.isFinite(v)) v = valor;
    valor = clamp(v);
    el.value = valor;
  };
  el.addEventListener('change', confirmar);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { confirmar(); el.blur(); } });
  return {
    get: () => valor,
    set: (v) => { valor = clamp(v); el.value = valor; },
    el,
  };
}
// ==================== CAMPOS CONTROLADOS ====================
const referenciaM = numeroControlado('referencia-m', 0);
const opM = numeroControlado('op-m', 0, { min: 0, max: 100 });
const tsM = numeroControlado('ts-m', 0.1, { min: 0.05 });
const kcM = numeroControlado('kc-m', 0);
const tauiM = numeroControlado('taui-m', 0);
const taudM = numeroControlado('taud-m', 0);
const referenciaS = numeroControlado('referencia-s', 0);
const opS = numeroControlado('op-s', 0, { min: 0, max: 100 });
const tsS = numeroControlado('ts-s', 0.1, { min: 0.05 });
const kcS = numeroControlado('kc-s', 0);
const tauiS = numeroControlado('taui-s', 0);
const taudS = numeroControlado('taud-s', 0);
const kpS = numeroControlado('kp-s', 1);
const tauS = numeroControlado('tau-s', 1);
const thetaS = numeroControlado('theta-s', 0);
const inicialS = numeroControlado('inicial-s', 0);
const mCalCtrl = numeroControlado('m', 1);
const bCalCtrl = numeroControlado('b', 0);
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
    op = Math.max(0, Math.min(100, op));
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
// ==================== PESTAÑAS ====================
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.add('active');
  };
});
// ==================== GRAFICADO (la leyenda vive en el HTML, no aquí) ====================
const MAX_PLOT = 100;
function dibujarSerie(canvas, s1, color1, s2, color2, max) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
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
  linea(s1, color1);
  linea(s2, color2);
}
// ==================== MODO MANUAL/AUTO (bumpless) ====================
function wireModo(prefix, refCtrl, opCtrl, onCambio) {
  const btn = $(`modoCtrl-${prefix}`);
  let auto = false;
  const aplicar = () => {
    refCtrl.el.disabled = !auto;
    opCtrl.el.disabled = auto;
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
    trackReferencia: (pv) => { if (!auto) refCtrl.set(Number(pv.toFixed(2))); },
  };
}
// ==================== SINTONÍA: solo al confirmar Kc/Tau_i/Tau_d/Ts ====================
function wireSintonia(pid, kcCtrl, tauiCtrl, taudCtrl, tsCtrl) {
  const resintonizar = () => {
    pid.sintonizar(kcCtrl.get(), tauiCtrl.get(), taudCtrl.get(), tsCtrl.get());
  };
  [kcCtrl, tauiCtrl, taudCtrl, tsCtrl].forEach((ctrl) => {
    ctrl.el.addEventListener('change', resintonizar);
    ctrl.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') resintonizar(); });
  });
  resintonizar();
  return resintonizar;
}
const resintonizarM = wireSintonia(pidMonitor, kcM, tauiM, taudM, tsM);
const resintonizarS = wireSintonia(pidSimulacion, kcS, tauiS, taudS, tsS);
const modoM = wireModo('m', referenciaM, opM, (auto) => {
  if (auto) {
    resintonizarM();
    const pv = Number($('pv-m').textContent) || 0;
    pidMonitor.inicializarBumpless(opM.get(), referenciaM.get() - pv);
  } else {
    pidMonitor.desactivar();
  }
});
const modoS = wireModo('s', referenciaS, opS, (auto) => {
  if (auto) {
    resintonizarS();
    const pv = Number($('pv-s').textContent) || 0;
    pidSimulacion.inicializarBumpless(opS.get(), referenciaS.get() - pv);
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
    const pv = msg.raw * mCalCtrl.get() + bCalCtrl.get();
    modoM.trackReferencia(pv);
    const sp = referenciaM.get();
    let op = opM.get();
    const err = sp - pv;
    if (pidMonitor.activo) {
      op = pidMonitor.calcular(err);
      opM.set(Number(op.toFixed(0)));
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
    dibujarSerie($('chartPV-m'), histSPm, COLORS.sp, histPVm, COLORS.pv, 340);
    dibujarSerie($('chartErr-m'), histErrm, COLORS.err, histOPm, COLORS.op, 100);
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
// Al confirmar OP manual (Enter/blur), se envía al hardware
opM.el.addEventListener('change', () => {
  if (!modoM.esAuto()) enviarWs({ type: 'pwm', value: opM.get() });
});
$('btnStop-m').onclick = () => { opM.set(0); enviarWs({ type: 'pwm', value: 0 }); };
// Al confirmar Ts (Enter/blur), se envía el nuevo periodo de muestreo
tsM.el.addEventListener('change', () => {
  enviarWs({ type: 'rate', ms: Math.round(tsM.get() * 1000) });
});
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
    k: kpS.get(), tau: tauS.get(), theta: thetaS.get(),
    Ts: tsS.get(), inicial: inicialS.get(),
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
  let op = opS.get();
  try {
    const r = await fetch(`${SIM_URL}/step`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op }),
    });
    const d = await r.json();
    const pv = d.pv;
    modoS.trackReferencia(pv);
    const sp = referenciaS.get();
    const err = sp - pv;
    if (auto && pidSimulacion.activo) {
      op = pidSimulacion.calcular(err);
      opS.set(Number(op.toFixed(2)));
    }
    $('pv-s').textContent = pv.toFixed(2);
    $('error-s').textContent = err.toFixed(2);
    [histPVs, histSPs, histErrs, histOPs].forEach((h) => { if (h.length > MAX_PLOT) h.shift(); });
    histPVs.push(pv); histSPs.push(sp); histErrs.push(err); histOPs.push(op);
    dibujarSerie($('chartPV-s'), histSPs, COLORS.sp, histPVs, COLORS.pv, Math.max(10, Math.max(...histPVs, ...histSPs) * 1.2));
    dibujarSerie($('chartErr-s'), histErrs, COLORS.err, histOPs, COLORS.op, 100);
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
  const Ts = Math.max(0.05, tsS.get());
  simTimer = setInterval(pasoSim, Ts * 1000);
  simCorriendo = true;
  $('btnRun-s').textContent = 'Detener simulación';
};

$('btnStop-s').onclick = () => { opS.set(0); };

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