"""
Simulador de planta FOPDT (First Order Plus Dead Time)
Ecuacion de diferencias (transformada Z modificada):
    Cn = a1*Cn-1 + b1*M[n-1-N] + b2*M[n-2-N]
a1 = exp(-Ts/tau)
b1 = K*(1 - exp(-m*Ts/tau))
b2 = K*(exp(-m*Ts/tau) - exp(-Ts/tau))
N  = floor(theta/Ts)        -> parte entera del retardo (en muestras)
m  = 1 - (theta - N*Ts)/Ts  -> parte fraccionaria del retardo
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np

app = Flask(__name__)
CORS(app)

state = {}

def reset_state(k, tau, theta, Ts, inicial):
    Ts = max(Ts, 1e-6)
    tau = max(tau, 1e-6)

    modulo = theta / Ts
    N = int(np.floor(modulo))
    m = 1 - (theta - N * Ts) / Ts

    a1 = np.exp(-Ts / tau)
    b1 = k * (1 - np.exp(-m * Ts / tau))
    b2 = k * (np.exp(-m * Ts / tau) - np.exp(-Ts / tau))

    state.clear()
    state.update({
        'k': k, 'tau': tau, 'theta': theta, 'Ts': Ts,
        'a1': float(a1), 'b1': float(b1), 'b2': float(b2),
        'N': N, 'm': float(m), 'modulo': float(modulo),
        'M': [0.0] * (N + 3),   # historial de manipulacion (con margen)
        'Cn': 0.0,
        'inicial': float(inicial),
        'n': 0,
    })

@app.route('/reset', methods=['POST'])
def reset():
    d = request.get_json(force=True) or {}
    reset_state(
        k=float(d.get('k', 1.0)),
        tau=float(d.get('tau', 1.0)),
        theta=float(d.get('theta', 0.0)),
        Ts=float(d.get('Ts', 0.1)),
        inicial=float(d.get('inicial', 0.0)),
    )
    return jsonify(ok=True, a1=state['a1'], b1=state['b1'], b2=state['b2'], N=state['N'], m=state['m'], modulo=state['modulo'])

@app.route('/step', methods=['POST'])
def step():
    if not state:
        reset_state(1.0, 1.0, 0.0, 1.0, 0.0)

    d = request.get_json(force=True) or {}
    op = float(d.get('op', 0.0))

    M = state['M']
    M.append(op)
    N = state['N']

    n = len(M) - 1
    idx1 = n - 1 - N       # M[n-1-N]
    idx2 = n - 2 - N       # M[n-2-N]
    M1 = M[idx1] if idx1 >= 0 else 0.0
    M2 = M[idx2] if idx2 >= 0 else 0.0

    Cn = state['a1'] * state['Cn'] + state['b1'] * M1 + state['b2'] * M2
    state['Cn'] = float(Cn)
    state['n'] = n
    pv = state['Cn'] + state['inicial']

    if len(M) > 5000:                    # evita crecer indefinidamente
        state['M'] = M[-(N + 10):]

    return jsonify(
        pv=float(pv),
        cn=float(state['Cn']),
        inicial=float(state['inicial']),
        n=n
    )

@app.route('/health', methods=['GET'])
def health():
    return jsonify(ok=True, tiene_estado=bool(state))

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)