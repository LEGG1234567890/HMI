<?php
header('Content-Type: application/json');

// Aquí después leerás tu PLC, base de datos, sensores, etc.
echo json_encode([
    'temperatura' => round(20 + mt_rand(0, 100) / 10, 1),
    'presion'     => round(1 + mt_rand(0, 50) / 100, 2),
    'bomba'       => (bool) mt_rand(0, 1),
    'hora'        => date('H:i:s'),
]);