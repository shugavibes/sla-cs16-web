# Servidor dedicado de CS 1.6: Xash3D FWGS + ReGameDLL_CS + bots YaPB (todo open source).
# Los archivos del juego (mapas, modelos, sonidos) se montan en /juego (solo lectura).
# Cada sala de config/salas.conf es un proceso aparte (ver entrypoint.sh).

# ---- 1. Bajar los binarios oficiales (Linux 32 bits) ----------------------------
FROM --platform=linux/amd64 debian:trixie-slim AS descarga
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl binutils && rm -rf /var/lib/apt/lists/*
# Versiones probadas (ver FUENTES.txt). Si los "continuous" ya cambiaron, se usa la
# versión nueva igual y se avisa en el armado.
ARG XASH_URL=https://github.com/FWGS/xash3d-fwgs/releases/download/continuous/xash3d-fwgs-linux-i386.tar.gz
ARG XASH_SHA256=b58a244014f29ea5ac2c1b130f34fa9569f4a8b417ee49dc684184b282e4bb45
ARG CS_URL=https://github.com/Velaron/cs16-client/releases/download/continuous/CS16Client-Linux-i386.tar.gz
ARG CS_SHA256=a1e4e887fee92b946859562162c1257a70b2329798319e52e46d7a7d6aea38c8
WORKDIR /tmp/dl
COPY preparar-motor.sh ./
RUN sh preparar-motor.sh

# ---- 2. Imagen final ------------------------------------------------------------
# Debian forky (glibc 2.43) con las bibliotecas de 32 bits. Tiene que ser forky y no
# trixie (glibc 2.41): el yapb.so que viene en la release «continuous» de CS16Client pide
# GLIBC_2.43 y en trixie los bots no cargan («version `GLIBC_2.43' not found»), así que
# las salas arrancan sin bots. El servidor es de 32 bits; en una Mac con chip M corre emulado.
FROM --platform=linux/amd64 debian:forky-slim
RUN dpkg --add-architecture i386 && apt-get update && apt-get install -y --no-install-recommends libc6:i386 libstdc++6:i386 libgcc-s1:i386 unzip && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home --home-dir /home/xash xash
COPY --from=descarga /tmp/dl/motor/ /opt/xash/
COPY entrypoint.sh /usr/local/bin/servidor-cs
RUN chmod 755 /usr/local/bin/servidor-cs /opt/xash/xash3d && chown -R xash:xash /opt/xash
USER xash
WORKDIR /opt/xash
ENV LD_LIBRARY_PATH=/opt/xash
ENTRYPOINT ["/usr/local/bin/servidor-cs"]
