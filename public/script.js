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

// ---------- Utilidad: dibujar dos series en un canvas ----------
const MAX_PLOT = 100;
function dibujarSerie(canvas, s1, s2, max) {
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
  linea(serie1 = s1, '#4fc3f7');
  linea(s2, '#66bb6a');
}

// ---------- Manual/Automático con bumpless transfer ----------
// Manual: Referencia deshabilitada y sigue a PV. OP habilitada, el usuario la controla.
// Automático: Referencia habilitada (SP deseado). OP deshabilitada (la fijará el PID).
function wireModo(prefix) {
  const btn = $(`modoCtrl-${prefix}`);
  const ref = $(`referencia-${prefix}`);
  const op = $(`op-${prefix}`);
  let auto = false;
  const aplicar = () => {
    ref.disabled = auto ? false : true;
    op.disabled = auto ? true : false;
    btn.textContent = auto ? 'Automático' : 'Manual';
    btn.classList.toggle('on', auto);
  };
  aplicar();
  btn.onclick = () => {
    auto = !auto;
    aplicar();
  };
  return {
    esAuto: () => auto,
    trackReferencia: (pv) => {
      if (!auto) {
        ref.value = pv.toFixed(2);
      }
    },
    setReferenciaManual: (sp) => {
      if (!auto) {
        ref.value = sp.toFixed(2);
      }
    },
  };
}

const modoM = wireModo('m');
const modoS = wireModo('s');

// ============================================================
// ============================ MONITOR =======================
// ============================================================
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
    modoM.trackReferencia(pv);                 // bumpless si está en Manual
    const sp = Number($('referencia-m').value) || 0;
    const op = Number($('op-m').value) || 0;
    const err = sp - pv;

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
    dibujarSerie($('chartPV-m'), histSPm, histPVm, 340);
    dibujarSerie($('chartErr-m'), histErrm, histOPm, 100);

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
// ========================= SIMULACIÓN ======================
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

  const kp = Number($('kp-s').value) || 0;
  const op = Number($('op-s').value) || 0;
  const inicial = Number($('inicial-s').value) || 0;

  try {

    const r = await fetch(`${SIM_URL}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op }),
    });
    const d = await r.json();
    const pv = d.pv+inicial;
    let sp;
    if (auto) {
      // Automático:
      // el usuario define la referencia
      sp = Number($('referencia-s').value) || 0;
    } else {
      // Manual:
      // SP = Kp * OP + valor inicial
      sp = kp * op + inicial;
      modoS.setReferenciaManual(sp);
    }
    const err = sp - pv;
    $('pv-s').textContent = pv.toFixed(2);
    $('error-s').textContent = err.toFixed(2);
    [histPVs, histSPs, histErrs, histOPs].forEach((h) => {
      if (h.length > MAX_PLOT) h.shift();
    });
    histPVs.push(pv);
    histSPs.push(sp);
    histErrs.push(err);
    histOPs.push(op);
    dibujarSerie(
      $('chartPV-s'),
      histSPs,
      histPVs,
      Math.max(10, Math.max(...histPVs, ...histSPs) * 1.2)
    );
    dibujarSerie(
      $('chartErr-s'),
      histErrs,
      histOPs,
      100
    );
    if (archivandoS) {
      registroS.push({
        t: Date.now() - tInicioS,
        pv: pv.toFixed(2),
        sp: sp.toFixed(2),
        err: err.toFixed(2),
        op: op
      });
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
  await aplicarParametrosSim();          // asegura estado inicial correcto
  const Ts = Math.max(0.05, Number($('ts-s').value) || 1);
  simTimer = setInterval(pasoSim, Ts * 1000);   // igual que en la vida real: 1 muestra cada Ts
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

// ---------- Utilidad: descargar CSV ----------
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

// Inicializa la planta simulada con valores por defecto al cargar la página
aplicarParametrosSim();