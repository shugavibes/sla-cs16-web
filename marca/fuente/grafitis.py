"""Arma los grafitis de SLA que la página pinta en los mapas (ver web/cliente/grafitis.js).

Uso (desde la carpeta del proyecto, con numpy, cairosvg y pillow instalados):
    python3 marca/fuente/grafitis.py

Deja en marca/web/grafitis/:
  pared-sla.png     «SLA» en aerosol para las paredes de piedra (128 × 240)
  ventana-logo.png  el globo de SLA debajo de las ventanas (128 × 240)
  caja-logo.png     el logo en esténcil blanco para los cajones grandes (128 × 128)
  calco-*.png       máscaras de un solo color para los aerosoles que tiran los bots

Son capas con transparencia, hechas solo con el logo de SLA: la página las pinta encima
de las texturas del juego de cada jugador cuando arranca (nada del juego se copia acá).
"""
from __future__ import annotations

import io
import math
from pathlib import Path

import cairosvg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAIZ = Path(__file__).resolve().parents[2]
SALIDA = RAIZ / 'marca' / 'web' / 'grafitis'
LOGO = (RAIZ / 'marca' / 'web' / 'sla-logo.svg').read_text().replace('#EAEAEA', '#FFFFFF')
GLOBO = (RAIZ / 'marca' / 'web' / 'sla-globo.svg').read_text().replace('#EAEAEA', '#FFFFFF')
VERDE = (19, 196, 116)
TINTA = (14, 16, 14)
CORTE_LETRAS = 1700 / 2469      # en el logo, el globo empieza ahí: a la izquierda quedan las letras


def mascara(svg: str, ancho: int, recorte: float | None = None) -> np.ndarray:
    """Forma del logo como transparencia 0..1 (con el ancho pedido)."""
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=ancho if recorte is None else round(ancho / recorte))
    a = np.asarray(Image.open(io.BytesIO(png)).convert('RGBA'))[..., 3].astype(np.float32) / 255
    if recorte is not None:
        a = a[:, :ancho]
        cols = np.where(a.max(axis=0) > 0.05)[0]
        a = a[:, : cols.max() + 2]
    return a


def a_imagen(a: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'L')


def de_imagen(im: Image.Image) -> np.ndarray:
    return np.asarray(im).astype(np.float32) / 255


def ubicar(forma: np.ndarray, tam: tuple[int, int], centro: tuple[float, float], angulo: float = 0.0) -> np.ndarray:
    """Pone la forma en un lienzo (ancho, alto) con su centro en `centro`, girada `angulo` grados."""
    im = a_imagen(forma).rotate(angulo, resample=Image.BICUBIC, expand=True)
    lienzo = Image.new('L', tam, 0)
    lienzo.paste(im, (round(centro[0] - im.width / 2), round(centro[1] - im.height / 2)))
    return de_imagen(lienzo)


def dilatar(a: np.ndarray, r: int) -> np.ndarray:
    return de_imagen(a_imagen(a).filter(ImageFilter.MaxFilter(2 * r + 1)))


def difuminar(a: np.ndarray, r: float) -> np.ndarray:
    return de_imagen(a_imagen(a).filter(ImageFilter.GaussianBlur(r)))


def chorreados(a: np.ndarray, rng: np.random.Generator, cantidad: int, largo: tuple[int, int]) -> np.ndarray:
    """Pintura que chorrea desde el borde de abajo de la forma."""
    alto, ancho = a.shape
    im = Image.new('L', (ancho, alto), 0)
    d = ImageDraw.Draw(im)
    llenos = a > 0.6
    xs = [x for x in range(ancho) if llenos[:, x].any()]
    for x in rng.choice(xs, size=min(cantidad, len(xs)), replace=False):
        y0 = int(np.where(llenos[:, x])[0].max())
        l = int(rng.integers(*largo))
        g = 1 if rng.random() < 0.6 else 2
        d.line([(x, y0), (x, min(alto - 2, y0 + l))], fill=230, width=g)
        d.ellipse([x - g, y0 + l - g, x + g, y0 + l + g], fill=230)
    return de_imagen(im)


def salpicado(a: np.ndarray, rng: np.random.Generator, densidad: float) -> np.ndarray:
    """Gotitas sueltas alrededor, como deja un aerosol."""
    zona = difuminar(dilatar(a, 4), 3) * (1 - a)
    puntos = (rng.random(a.shape) < densidad * zona).astype(np.float32)
    return np.clip(difuminar(puntos, 0.5) * 2.2, 0, 1)


def aerosol(forma: np.ndarray, rng: np.random.Generator, *, halo=0.28, gotas=0.25,
            chorros=6, largo=(5, 16)) -> np.ndarray:
    """Transparencia de un grafiti de un solo color: bordes suaves, nube y chorreados."""
    trazo = difuminar(forma, 0.6)
    nube = difuminar(dilatar(forma, 2), 3.2) * halo
    gotitas = salpicado(forma, rng, gotas) * 0.8
    chorro = chorreados(forma, rng, chorros, largo) if chorros else np.zeros_like(forma)
    ruido = 0.88 + 0.12 * rng.random(forma.shape)          # la pintura no queda pareja
    return np.clip(np.maximum.reduce([trazo * ruido, nube, gotitas, chorro * 0.95]), 0, 1)


def color(alfa: np.ndarray, rgb) -> Image.Image:
    alto, ancho = alfa.shape
    out = np.zeros((alto, ancho, 4), np.uint8)
    out[..., :3] = rgb
    out[..., 3] = (np.clip(alfa, 0, 1) * 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def encima(abajo: Image.Image, arriba: Image.Image) -> Image.Image:
    return Image.alpha_composite(abajo, arriba)


def grafiti_con_borde(forma: np.ndarray, rng, relleno=VERDE, borde=TINTA, grosor=2, **kw) -> Image.Image:
    """Letras de aerosol: borde oscuro, relleno de color, brillo y chorreados."""
    alto, ancho = forma.shape
    contorno = dilatar(forma, grosor)
    capa_borde = aerosol(contorno, rng, halo=0.22, gotas=0.15, chorros=0)
    capa_relleno = aerosol(forma, rng, halo=0.0, gotas=0.0, **kw)
    brillo = np.clip(forma - np.roll(forma, (2, 2), axis=(0, 1)), 0, 1) * 0.55   # luz arriba a la izquierda
    lienzo = Image.new('RGBA', (ancho, alto), (0, 0, 0, 0))
    lienzo = encima(lienzo, color(capa_borde, borde))
    lienzo = encima(lienzo, color(capa_relleno, relleno))
    lienzo = encima(lienzo, color(brillo * forma, (210, 255, 230)))
    return lienzo


def pared_sla(rng) -> Image.Image:
    letras = mascara(LOGO, 104, CORTE_LETRAS)
    forma = ubicar(letras, (128, 240), (64, 126), angulo=7)
    return grafiti_con_borde(forma, rng, chorros=9, largo=(6, 22))


def ventana_logo(rng) -> Image.Image:
    globo = mascara(GLOBO, 64)
    forma = ubicar(globo, (128, 240), (66, 160), angulo=-4)
    return grafiti_con_borde(forma, rng, grosor=2, chorros=5, largo=(5, 18))


def caja_logo(rng) -> Image.Image:
    """Esténcil: el logo completo en blanco gastado, como pintado sobre la madera."""
    logo = mascara(LOGO, 108)
    forma = ubicar(logo, (128, 128), (64, 66))
    gastado = np.clip(forma * (0.55 + 0.45 * difuminar(rng.random(forma.shape).astype(np.float32), 1.6) * 1.6), 0, 1)
    return color(aerosol(gastado, rng, halo=0.12, gotas=0.08, chorros=0) * 0.9, (236, 230, 210))


def calcos(rng) -> dict[str, Image.Image]:
    """Máscaras para los aerosoles de los bots (decals: el color lo pone el juego)."""
    palabra = mascara(LOGO, 116)
    letras = mascara(LOGO, 104, CORTE_LETRAS)
    globo = mascara(GLOBO, 84)
    return {
        'calco-palabra.png': a_imagen(aerosol(ubicar(palabra, (128, 48), (64, 22)), rng, chorros=5, largo=(3, 9))),
        'calco-sla.png': a_imagen(aerosol(ubicar(letras, (128, 64), (64, 28), angulo=6), rng, chorros=7, largo=(4, 12))),
        'calco-globo.png': a_imagen(aerosol(ubicar(globo, (96, 96), (48, 46)), rng, chorros=5, largo=(4, 12))),
    }


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1203)
    hechos = {
        'pared-sla.png': pared_sla(rng),
        'ventana-logo.png': ventana_logo(rng),
        'caja-logo.png': caja_logo(rng),
        **calcos(rng),
    }
    for nombre, im in hechos.items():
        im.save(SALIDA / nombre, optimize=True)
        print(f'{nombre}: {im.size[0]} × {im.size[1]}')


if __name__ == '__main__':
    main()
