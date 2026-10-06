#!/usr/bin/env python3
"""Recupera lo que se pueda de antes de que existieran las estadísticas.

La web siempre anotó en su registro cada vez que alguien entraba o salía de una sala
(«[web] jugador conectado a la sala 1 (2 en línea)»). Este script lee ese registro
(docker compose logs -t web, por la entrada estándar) y suma esas partidas a metricas/,
sin nombres (el registro no los tenía) ni visitas. Solo toma lo anterior a la primera vez
que arrancaron las estadísticas, así no se duplica nada, y se puede correr una sola vez.

Uso: docker compose logs -t --no-color web | python3 scripts/recuperar_historial.py metricas
(lo hace bash recuperar-historial.sh)
"""
import collections
import datetime
import glob
import json
import os
import re
import sys

RE_TS = re.compile(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z')
RE_EVENTO = re.compile(r'\[web\] jugador (conectado a|desconectado de) la sala (\S+?)(?::|\s\()')
RE_INICIO = re.compile(r'\[web\] página del juego en el puerto')
MARCA = '.historial-recuperado'
ZONA = datetime.timezone(datetime.timedelta(hours=-3))   # Argentina, para el resumen


def a_ms(fecha, fraccion):
    t = datetime.datetime.strptime(fecha, '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc)
    return int(t.timestamp() * 1000) + int(float(fraccion or 0) * 1000)


def leer_existentes(carpeta):
    eventos = []
    for archivo in sorted(glob.glob(os.path.join(carpeta, '*.jsonl'))):
        with open(archivo, encoding='utf-8') as f:
            for linea in f:
                try:
                    eventos.append(json.loads(linea))
                except ValueError:
                    pass
    return eventos


def recuperar(lineas, primero):
    """Eventos (entra/sale/inicio) anteriores a `primero` (ms)."""
    eventos = []
    abiertas = collections.defaultdict(collections.deque)
    j = 900000
    for linea in lineas:
        m = RE_TS.search(linea)
        if not m:
            continue
        t = a_ms(m.group(1), m.group(2))
        if t >= primero:
            continue
        if RE_INICIO.search(linea):
            abiertas.clear()
            eventos.append({'t': t, 'tipo': 'inicio', 'recuperado': True})
            continue
        e = RE_EVENTO.search(linea)
        if not e:
            continue
        sala = e.group(2)
        if e.group(1) == 'conectado a':
            j += 1
            abiertas[sala].append((t, j))
            eventos.append({'t': t, 'tipo': 'entra', 'sala': sala, 'j': j, 'recuperado': True})
        elif abiertas[sala]:
            t0, jj = abiertas[sala].popleft()
            eventos.append({'t': t, 'tipo': 'sale', 'sala': sala, 'j': jj, 's': round((t - t0) / 1000), 'recuperado': True})
    return eventos


def main():
    carpeta = sys.argv[1] if len(sys.argv) > 1 else 'metricas'
    os.makedirs(carpeta, exist_ok=True)
    if os.path.exists(os.path.join(carpeta, MARCA)):
        print('  Ya se había recuperado el historial antes: no hago nada (así no se duplica).')
        return
    existentes = leer_existentes(carpeta)
    inicios = [e['t'] for e in existentes if e.get('tipo') == 'inicio' and not e.get('recuperado')]
    primero = min(inicios) if inicios else int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
    eventos = recuperar(sys.stdin, primero)
    partidas = [e for e in eventos if e['tipo'] == 'entra']
    if not partidas:
        print('  No quedó nada anterior en el registro de la web (se borra cada vez que se reinstala).')
        return
    por_mes = collections.defaultdict(list)
    for e in eventos:
        por_mes[datetime.datetime.fromtimestamp(e['t'] / 1000, datetime.timezone.utc).strftime('%Y-%m')].append(e)
    dueno = os.stat(carpeta)
    for mes, lista in por_mes.items():
        archivo = os.path.join(carpeta, f'{mes}.jsonl')
        with open(archivo, 'a', encoding='utf-8') as f:
            for e in lista:
                f.write(json.dumps(e, ensure_ascii=False) + '\n')
        try:
            os.chown(archivo, dueno.st_uid, dueno.st_gid)   # que la web pueda seguir escribiendo
        except OSError:
            pass
    with open(os.path.join(carpeta, MARCA), 'w', encoding='utf-8') as f:
        f.write(f'{len(partidas)} partidas recuperadas\n')
    dias = collections.Counter(
        datetime.datetime.fromtimestamp(e['t'] / 1000, ZONA).strftime('%a %d/%m') for e in partidas)
    print(f'  Recuperé {len(partidas)} partidas de antes de las estadísticas:')
    for dia, n in dias.items():
        print(f'    {dia}: {n} partidas')
    print('  (sin nombres ni visitas: eso el registro no lo tenía)')


if __name__ == '__main__':
    main()
