"""
fix_frame_alpha.py
Convierte el fondo "falso" (cuadrícula bakeada o blanco) de un frame de carta
en transparencia real (alpha=0), para poder usarlo como overlay sobre el arte.

Técnica: flood-fill desde el CENTRO del ventana de arte hacia afuera,
marcando como transparentes todos los píxeles similares conectados.
El borde del frame (dorado/plateado/oscuro) actúa como barrera natural.

Uso:
    python fix_frame_alpha.py <frame.png> [--tolerance N] [--seed-x X --seed-y Y]
    python fix_frame_alpha.py frames/frame-basic.png
    python fix_frame_alpha.py frames/frame-basic.png --tolerance 30
    python fix_frame_alpha.py frames/frame-basic.png --seed-x 400 --seed-y 300

Resultado: sobreescribe el archivo con alpha real en la zona transparente.
           (El original se guarda como <frame>_backup.png)
"""

import sys
import os
import argparse
from collections import deque

import numpy as np
from PIL import Image, ImageFilter


def flood_fill_to_alpha(
    img: Image.Image,
    seed_x: int,
    seed_y: int,
    tolerance: int = 30,
) -> Image.Image:
    """
    Flood-fill BFS desde (seed_x, seed_y) hacia afuera.
    Píxeles similares al color del seed → alpha = 0.
    Usa la imagen desenfocada para calcular similitud (evita bordes ruidosos).
    """
    rgba = img.convert("RGBA")
    data = np.array(rgba).copy()

    rgb_blurred = np.array(
        Image.fromarray(data[:, :, :3]).filter(ImageFilter.GaussianBlur(radius=3))
    ).astype(np.float32)

    h, w = data.shape[:2]

    # Color semilla (en imagen desenfocada)
    seed_color = rgb_blurred[seed_y, seed_x]
    print(f"  Seed ({seed_x},{seed_y}): RGB≈({seed_color[0]:.0f},{seed_color[1]:.0f},{seed_color[2]:.0f})")

    visited = np.zeros((h, w), dtype=bool)
    is_transparent = np.zeros((h, w), dtype=bool)
    queue = deque()

    def similar(y: int, x: int) -> bool:
        return float(np.max(np.abs(rgb_blurred[y, x] - seed_color))) <= tolerance

    if similar(seed_y, seed_x):
        visited[seed_y, seed_x] = True
        is_transparent[seed_y, seed_x] = True
        queue.append((seed_y, seed_x))

    while queue:
        cy, cx = queue.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                visited[ny, nx] = True
                if similar(ny, nx):
                    is_transparent[ny, nx] = True
                    queue.append((ny, nx))

    pixels_removed = is_transparent.sum()
    total = h * w
    print(f"  Píxeles convertidos a alpha=0: {pixels_removed:,} ({100*pixels_removed/total:.1f}% del frame)")

    # Aplicar alpha=0 a los píxeles detectados
    data[is_transparent, 3] = 0

    return Image.fromarray(data, "RGBA")


def auto_seed(img: Image.Image) -> tuple[int, int]:
    """
    Detecta automáticamente el punto semilla en el interior del ventana de arte.
    Busca la región rectangular más grande con colores casi-blancos/uniformes
    y devuelve su centro.
    Fallback: 40% desde arriba, 55% desde la izquierda.
    """
    w, h = img.size
    data = np.array(img.convert("RGB")).astype(float)

    # Detectar zona casi-blanca (posible área de arte)
    lum = data.mean(axis=2)
    is_light = lum > 200

    # Tomar el punto más alto y centrado de la zona clara (interior)
    rows_with_light = np.where(is_light.any(axis=1))[0]
    cols_with_light = np.where(is_light.any(axis=0))[0]

    if len(rows_with_light) > 0 and len(cols_with_light) > 0:
        # Usar cuarto superior de la zona clara (art window)
        mid_row = rows_with_light[len(rows_with_light) // 4]
        mid_col = cols_with_light[len(cols_with_light) // 2]
        return int(mid_col), int(mid_row)

    return int(w * 0.55), int(h * 0.30)


def process_frame(path: str, tolerance: int, seed_x: int | None, seed_y: int | None):
    if not os.path.exists(path):
        print(f"Error: no se encontró '{path}'")
        sys.exit(1)

    img = Image.open(path)
    w, h = img.size
    print(f"Frame: {os.path.basename(path)}  {w}x{h}  modo={img.mode}")

    # Verificar si ya tiene alpha real
    if img.mode == "RGBA":
        alpha = np.array(img)[:, :, 3]
        if (alpha < 255).any():
            pct = 100 * (alpha < 255).mean()
            print(f"  ⚠ Ya tiene {pct:.1f}% píxeles semi/transparentes. Procesando igual...")

    # Determinar seed
    if seed_x is None or seed_y is None:
        seed_x, seed_y = auto_seed(img)
        print(f"  Auto-seed detectado: ({seed_x},{seed_y})")
    else:
        print(f"  Seed manual: ({seed_x},{seed_y})")

    # Backup
    base, ext = os.path.splitext(path)
    backup_path = f"{base}_backup{ext}"
    if not os.path.exists(backup_path):
        img.save(backup_path)
        print(f"  Backup guardado: {backup_path}")

    # Procesar
    result = flood_fill_to_alpha(img, seed_x, seed_y, tolerance)
    result.save(path, "PNG")
    print(f"  ✓ Guardado con alpha real: {path}\n")


def main():
    parser = argparse.ArgumentParser(description="Convierte fondo falso en alpha real en frames de cartas")
    parser.add_argument("files", nargs="+", help="Frame PNG(s) a procesar")
    parser.add_argument("--tolerance", type=int, default=30, help="Tolerancia de similitud (default: 30)")
    parser.add_argument("--seed-x", type=int, default=None, help="X del punto semilla (auto si no se especifica)")
    parser.add_argument("--seed-y", type=int, default=None, help="Y del punto semilla (auto si no se especifica)")
    args = parser.parse_args()

    for path in args.files:
        process_frame(path, args.tolerance, args.seed_x, args.seed_y)


if __name__ == "__main__":
    main()
