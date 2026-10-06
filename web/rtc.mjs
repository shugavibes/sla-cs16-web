// Puente WebRTC <-> UDP entre los navegadores y el servidor dedicado de CS 1.6.
//
// Basado en server/rtc.mjs de CSweb (https://github.com/santiagoPostacchini/CSweb, MIT).
// Cambios: reescritura de candidatos ICE para funcionar detrás de Docker (el navegador
// tiene que ver la IP publicada, no la interna del contenedor) y límite de jugadores.
//
// Cada navegador abre un DataChannel no confiable y desordenado (se comporta como UDP).
// Por cada jugador se crea un socket UDP local con su propia IP de loopback (127.0.X.Y),
// así el servidor dedicado ve a cada jugador como una IP distinta.
import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import nodeDataChannel from 'node-datachannel';
import { esRcon, nombreDeConexion } from './paquetes.mjs';

const MAX_BUFFERED = 1 << 20;

// "candidate:1 1 UDP 2122317823 172.17.0.2 27018 typ host" -> con la IP pública
export function rewriteCandidate(line, publicIp) {
    const prefix = line.startsWith('a=') ? 'a=' : '';
    const body = prefix ? line.slice(2) : line;
    const parts = body.trim().split(/\s+/);
    if (parts.length < 8 || !parts[0].startsWith('candidate:')) return line;
    const transport = parts[2].toLowerCase();
    const ip = parts[4];
    if (transport !== 'udp') return null;         // sólo UDP
    if (ip.includes(':')) return null;            // sin IPv6
    if (!publicIp) return line;
    parts[4] = publicIp;
    return prefix + parts.join(' ');
}

export function rewriteSdp(sdp, publicIp) {
    const seen = new Set();
    const out = [];
    for (const raw of sdp.split(/\r?\n/)) {
        let line = raw;
        if (line.startsWith('a=candidate:')) {
            line = rewriteCandidate(line, publicIp);
            if (!line) continue;
            const key = line.split(/\s+/).slice(4, 6).join(':');
            if (seen.has(key)) continue;
            seen.add(key);
        } else if (publicIp && line.startsWith('c=IN IP4 ')) {
            line = `c=IN IP4 ${publicIp}`;
        }
        out.push(line);
    }
    return out.join('\r\n');
}

export class RtcBridge extends EventEmitter {
    constructor(cfg) {
        super();
        this.cfg = cfg;           // { webrtcPort, publicIp, maxPeers, maxPorIp }
        this.peers = new Set();
        this.slots = new Set();
        this.nextId = 1;
    }

    get count() {
        return [...this.peers].filter((p) => p.open).length;
    }

    contarSala(id) {
        return [...this.peers].filter((p) => p.open && p.sala === id).length;
    }

    allocSlot() {
        for (let i = 0; i < 254 * 200; i++) {
            if (!this.slots.has(i)) {
                this.slots.add(i);
                return i;
            }
        }
        throw new Error('sin slots libres');
    }

    // ws: conexión WebSocket de señalización (paquete "ws"); sala: { id, puerto, maxJugadores }
    handle(ws, remote, sala) {
        const cfg = this.cfg;
        const cerrar = (motivo) => {
            try { ws.close(1013, motivo); } catch { /* cerrado */ }
        };
        if (this.peers.size >= cfg.maxPeers) return cerrar('servidor lleno');
        if ([...this.peers].filter((p) => p.sala === sala.id).length >= sala.maxJugadores + 2) return cerrar('sala llena');
        if (cfg.maxPorIp && remote && [...this.peers].filter((p) => p.remote === remote).length >= cfg.maxPorIp) {
            return cerrar('demasiadas conexiones desde tu red');
        }
        const gamePort = sala.puerto;
        const id = this.nextId++;
        const slot = this.allocSlot();
        const loopback = `127.0.${1 + Math.floor(slot / 254)}.${1 + (slot % 254)}`;
        const peer = { id, open: false, remote, sala: sala.id };
        this.peers.add(peer);

        const send = (obj) => {
            if (ws.readyState === 1) ws.send(JSON.stringify(obj));
        };

        const pc = new nodeDataChannel.PeerConnection(`jugador-${id}`, {
            iceServers: [],
            enableIceUdpMux: true,
            portRangeBegin: cfg.webrtcPort,
            portRangeEnd: cfg.webrtcPort,
            maxMessageSize: 65536,
        });

        let udp = null;
        let dc = null;
        let heartbeat = null;
        let closed = false;
        const cleanup = (why) => {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            const wasOpen = peer.open;
            peer.open = false;
            if (wasOpen) this.emit('leave', peer, why);
            this.peers.delete(peer);
            this.slots.delete(slot);
            try { udp?.close(); } catch { /* ya cerrado */ }
            try { dc?.close(); } catch { /* ya cerrado */ }
            try { pc.close(); } catch { /* ya cerrado */ }
            try { ws.close(); } catch { /* ya cerrado */ }
        };

        pc.onLocalDescription((sdp, type) => send({ type, sdp: rewriteSdp(sdp, cfg.publicIp) }));
        pc.onLocalCandidate((candidate, mid) => {
            const fixed = rewriteCandidate(candidate, cfg.publicIp);
            if (fixed) send({ type: 'candidate', candidate: fixed, mid });
        });
        pc.onStateChange((state) => {
            if (state === 'failed' || state === 'closed') cleanup(`webrtc ${state}`);
        });

        dc = pc.createDataChannel('game', { unordered: true, maxRetransmits: 0 });

        dc.onOpen(() => {
            udp = dgram.createSocket('udp4');
            udp.on('error', (err) => cleanup(`udp: ${err.message}`));
            udp.on('message', (msg, rinfo) => {
                if (rinfo.port !== gamePort) return;
                if (!dc.isOpen() || dc.bufferedAmount() > MAX_BUFFERED) return;
                dc.sendMessageBinary(msg);
            });
            udp.bind(0, loopback, () => {
                peer.open = true;
                peer.loopback = `${loopback}:${udp.address().port}`;
                this.emit('join', peer);
                send({ type: 'ready' });
            });
        });
        dc.onMessage((msg) => {
            if (!peer.open || typeof msg === 'string') return;
            const paquete = Buffer.isBuffer(msg) ? msg : Buffer.from(msg);
            if (esRcon(paquete)) return;   // la administración remota no se acepta desde internet
            if (!peer.nombre) {
                // el pedido de conexión trae el nombre: desde ahí cuenta como una partida
                const nombre = nombreDeConexion(paquete);
                if (nombre) {
                    peer.nombre = nombre;
                    peer.desde = Date.now();
                    this.emit('jugando', peer);
                }
            }
            udp.send(paquete, gamePort, '127.0.0.1');
        });
        dc.onClosed(() => cleanup('canal cerrado'));

        ws.on('message', (data) => {
            let msg;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }
            try {
                if (msg.type === 'answer' && typeof msg.sdp === 'string') {
                    pc.setRemoteDescription(msg.sdp, 'answer');
                } else if (msg.type === 'candidate' && typeof msg.candidate === 'string' && msg.candidate) {
                    pc.addRemoteCandidate(msg.candidate, msg.mid ?? '0');
                }
            } catch (e) {
                // candidatos mDNS (.local) no resolubles, etc.: se ignoran
                this.emit('debug', `peer ${id}: ${e.message}`);
            }
        });
        // ping periódico: detecta navegadores que se cerraron sin avisar
        let alive = true;
        ws.on('pong', () => { alive = true; });
        heartbeat = setInterval(() => {
            if (!alive) {
                cleanup('sin respuesta');
                return;
            }
            alive = false;
            try { ws.ping(); } catch { /* cerrado */ }
        }, 15000);

        ws.on('close', () => cleanup('websocket cerrado'));
        ws.on('error', () => cleanup('websocket error'));
    }

    closeAll() {
        for (const p of [...this.peers]) p.open = false;
        nodeDataChannel.cleanup();
    }
}
