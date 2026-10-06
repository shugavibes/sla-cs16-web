"""Arma los grafitis de SLA que la página pinta en los mapas (ver web/cliente/grafitis.js).

Uso (desde la carpeta del proyecto, con numpy, cairosvg y pillow instalados):
    python3 marca/fuente/grafitis.py

Deja en marca/web/grafitis/:
  pared-logo.png          el logo completo en aerosol para las paredes de piedra (128 × 240)
  ventana-timbre.png      el timbre pegado debajo de las ventanas (128 × 240)
  puerta-timbre.png       el timbre pegado en las puertas grandes (192 × 160)
  caja-logo.png           el logo en esténcil para los cajones grandes (128 × 128)
  caja-chica-timbre.png   el timbre pegado en los cajones chicos (64 × 64)
  caja-militar-logo.png   el logo en esténcil para los cajones militares (64 × 64)
  calco-*.png             los aerosoles que tiran los bots

Son capas con transparencia, hechas con el logo de SLA y el timbre (marca/fuente/timbre.png):
la página las pinta encima de las texturas del juego de cada jugador cuando arranca (nada
del juego se copia acá).
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


def pared_logo(rng) -> Image.Image:
    """El logo completo (palabra + globo) en aerosol para las paredes de piedra.
    Ojo: el juego muestra las texturas espejadas en más o menos la mitad de las paredes,
    así que ahí el logo se lee al revés (pasa lo mismo con cualquier texto en CS 1.6)."""
    logo = mascara(LOGO, 112)
    forma = ubicar(logo, (128, 240), (64, 118), angulo=6)
    return grafiti_con_borde(forma, rng, grosor=2, chorros=9, largo=(6, 22))


def estencil(forma: np.ndarray, rng, rgb=(236, 230, 210), fuerza=0.9) -> Image.Image:
    """Pintura con plantilla, gastada, como sobre la madera de un cajón."""
    gastado = np.clip(forma * (0.55 + 0.45 * difuminar(rng.random(forma.shape).astype(np.float32), 1.6) * 1.6), 0, 1)
    return color(aerosol(gastado, rng, halo=0.12, gotas=0.08, chorros=0) * fuerza, rgb)


def caja_logo(rng) -> Image.Image:
    return estencil(ubicar(mascara(LOGO, 112), (128, 128), (64, 66)), rng)


def caja_militar_logo(rng) -> Image.Image:
    """El logo en esténcil negro para los cajones militares (en de_dust2 se ven al derecho)."""
    return estencil(ubicar(mascara(LOGO, 58), (64, 64), (32, 34)), rng, rgb=(22, 22, 18), fuerza=0.92)


# ------------------------------------------------------------------ el timbre
def timbre() -> np.ndarray:
    """El timbre (marca/fuente/timbre.png) recortado: sin el fondo blanco, RGBA 0..1."""
    im = Image.open(RAIZ / 'marca' / 'fuente' / 'timbre.png').convert('RGB')
    a = np.asarray(im).astype(np.float32)
    fondo = (np.abs(a - 255).max(axis=2) < 22) | (np.abs(a - (243, 245, 246)).max(axis=2) < 10)
    # el fondo es lo claro que toca los bordes (así no se come los brillos del timbre)
    marca = Image.fromarray((fondo * 255).astype(np.uint8), 'L').copy()   # (copia: la de numpy es de solo lectura)
    alto, ancho = fondo.shape
    for x, y in [(0, 0), (ancho - 1, 0), (ancho // 2, 0), (0, alto // 2), (ancho - 1, alto // 2), (0, alto - 1), (ancho - 1, alto - 1)]:
        if marca.getpixel((x, y)) == 255:
            ImageDraw.floodfill(marca, (x, y), 128)
    alfa = (np.asarray(marca) != 128).astype(np.float32)
    alfa = difuminar(de_imagen(a_imagen(alfa).filter(ImageFilter.MinFilter(3))), 0.8)
    ys, xs = np.where(alfa > 0.5)
    rgba = np.dstack([a / 255, alfa])[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]
    return rgba


def achicar(rgba: np.ndarray, ancho: int) -> np.ndarray:
    alto = round(rgba.shape[0] * ancho / rgba.shape[1])
    im = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), 'RGBA')
    return np.asarray(im.resize((ancho, alto), Image.LANCZOS)).astype(np.float32) / 255


def pegatina(rgba: np.ndarray, tam: tuple[int, int], centro: tuple[float, float], ancho: int,
             angulo: float = 0.0, borde: int = 2) -> Image.Image:
    """Calcomanía pegada: el timbre con borde blanco y una sombrita."""
    chico = achicar(rgba, ancho)
    alfa = chico[..., 3]
    pad = borde + 3
    alfa_p = np.pad(alfa, pad)
    color_p = np.pad(chico[..., :3], ((pad, pad), (pad, pad), (0, 0)))
    blanco = difuminar(dilatar(alfa_p, borde), 0.6)
    sombra = difuminar(np.roll(blanco, (2, 2), axis=(0, 1)), 1.5) * 0.45
    capas = Image.new('RGBA', alfa_p.shape[::-1], (0, 0, 0, 0))
    capas = encima(capas, color(sombra, (0, 0, 0)))
    capas = encima(capas, color(blanco, (246, 244, 236)))
    arte = np.dstack([color_p, alfa_p])
    capas = encima(capas, Image.fromarray((arte * 255).astype(np.uint8), 'RGBA'))
    capas = capas.rotate(angulo, resample=Image.BICUBIC, expand=True)
    lienzo = Image.new('RGBA', tam, (0, 0, 0, 0))
    lienzo.alpha_composite(capas, (round(centro[0] - capas.width / 2), round(centro[1] - capas.height / 2)))
    return lienzo


def calco_color(rgba: Image.Image) -> Image.Image:
    """Para los aerosoles de los bots a todo color: el juego solo los dibuja opacos o
    transparentes (sin medias tintas), así que los bordes se cortan a la mitad."""
    a = np.asarray(rgba).copy()
    a[..., 3] = np.where(a[..., 3] >= 128, 255, 0)
    return Image.fromarray(a, 'RGBA')


def calcos(rng, campana: np.ndarray) -> dict[str, Image.Image]:
    """Aerosoles de los bots. calco-*.png de un color (el color lo pone el juego) y
    calco-*-color.png a todo color."""
    palabra = mascara(LOGO, 116)
    letras = mascara(LOGO, 104, CORTE_LETRAS)
    logo_color = grafiti_con_borde(ubicar(mascara(LOGO, 112), (128, 48), (64, 22)), rng, grosor=2, chorros=0)
    timbre_color = pegatina(campana, (80, 64), (40, 32), 64, borde=2)
    return {
        'calco-logo.png': a_imagen(aerosol(ubicar(palabra, (128, 48), (64, 22)), rng, gotas=0.06, chorros=5, largo=(3, 9))),
        'calco-sla.png': a_imagen(aerosol(ubicar(letras, (128, 64), (64, 28), angulo=6), rng, gotas=0.06, chorros=7, largo=(4, 12))),
        'calco-logo-color.png': calco_color(logo_color),
        'calco-timbre-color.png': calco_color(timbre_color),
    }


def main() -> None:
    SALIDA.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1203)
    campana = timbre()
    hechos = {
        'pared-logo.png': pared_logo(rng),
        'ventana-timbre.png': pegatina(campana, (128, 240), (64, 160), 62, angulo=-5),
        'puerta-timbre.png': pegatina(campana, (192, 160), (146, 98), 36, angulo=4),
        'caja-logo.png': caja_logo(rng),
        'caja-chica-timbre.png': pegatina(campana, (64, 64), (32, 33), 44, angulo=-3),
        'caja-militar-logo.png': caja_militar_logo(rng),
        **calcos(rng, campana),
    }
    for nombre, im in hechos.items():
        im.save(SALIDA / nombre, optimize=True)
        print(f'{nombre}: {im.size[0]} × {im.size[1]}')


if __name__ == '__main__':
    main()
