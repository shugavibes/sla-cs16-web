// Filtros para los paquetes que mandan los navegadores a las salas (puente WebRTC ⇄ UDP).

// ¿Es un pedido de administración remota (RCON)? En GoldSrc/Xash3D son paquetes "sin
// conexión" (empiezan con FF FF FF FF) con el texto «challenge rcon» o «rcon ...».
// Desde internet no tienen por qué llegar: para administrar están ./servidor.sh y
// web/rcon.mjs, que hablan directo con la sala dentro del servidor.
export function esRcon(paquete) {
    if (!paquete || paquete.length < 8) return false;
    if (paquete[0] !== 0xff || paquete[1] !== 0xff || paquete[2] !== 0xff || paquete[3] !== 0xff) return false;
    const texto = Buffer.from(paquete.subarray(4, 40)).toString('latin1').toLowerCase().trimStart();
    return texto.startsWith('rcon') || texto.startsWith('challenge rcon');
}

// Nombre del jugador en el pedido de conexión («connect 49 ... "\name\Shuga\..."»), para
// las métricas. Devuelve null si el paquete no es ese.
export function nombreDeConexion(paquete) {
    if (!paquete || paquete.length < 12) return null;
    if (paquete[0] !== 0xff || paquete[1] !== 0xff || paquete[2] !== 0xff || paquete[3] !== 0xff) return null;
    const texto = Buffer.from(paquete.subarray(4, 2048)).toString('utf8');
    if (!texto.trimStart().toLowerCase().startsWith('connect ')) return null;
    const m = /\\name\\([^\\"]{1,64})/.exec(texto);
    if (!m) return null;
    const nombre = m[1].replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 32);
    return nombre || null;
}
