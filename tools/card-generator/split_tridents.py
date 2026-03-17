"""
split_tridents.py
Divide una imagen con 6 tridents (grid 3x2) en 6 imágenes individuales,
auto-recorta el fondo blanco de cada una y las centra en un canvas uniforme.
Todas las salidas tienen exactamente las mismas dimensiones.

Uso:
    python split_tridents.py <ruta_imagen> [ancho alto] [--padding N]
    python split_tridents.py tridents.png
    python split_tridents.py tridents.png 128 128
    python split_tridents.py tridents.png 128 128 --padding 10

Los tridents se guardan con estos nombres (izquierda→derecha, arriba→abajo):
    trident_dark.png    trident_silver.png    trident_teal.png
    trident_gold.png    trident_orange.png    trident_red.png
"""

import sys
import os
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

ICONS_DIR = os.path.join(os.path.dirname(__file__), "icons")

TRIDENT_NAMES = [
    "_dark",
    "_silver",
    "_teal",
    "_gold",
    "_orange",
    "_red",
]

GRID_COLS = 3
GRID_ROWS = 2

# Umbral para considerar un píxel como "fondo blanco" (0-255)
WHITE_THRESHOLD = 240


def _flood_fill_background(data: np.ndarray, tolerance: int = 45) -> np.ndarray:
    """
    BFS flood fill desde todos los bordes para detectar la región de fondo.
    Usa la imagen desenfocada para calcular similitud → maneja cuadrícula alternante.
    Solo marca como fondo píxeles CONECTADOS a los bordes, nunca "agujeros" internos.
    """
    pil_rgb = Image.fromarray(data[:, :, :3].astype(np.uint8))
    blurred = np.array(pil_rgb.filter(ImageFilter.GaussianBlur(radius=3))).astype(np.float32)

    h, w = data.shape[:2]

    # Color de fondo: mediana de todos los píxeles del borde (imagen desenfocada)
    border = np.concatenate([
        blurred[0, :, :],
        blurred[h - 1, :, :],
        blurred[1:h - 1, 0, :],
        blurred[1:h - 1, w - 1, :],
    ])
    bg_color = np.median(border, axis=0)

    is_bg = np.zeros((h, w), dtype=bool)
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    def similar(y: int, x: int) -> bool:
        return float(np.max(np.abs(blurred[y, x] - bg_color))) <= tolerance

    # Sembrar desde todos los píxeles del borde
    for x in range(w):
        for y in [0, h - 1]:
            if not visited[y, x] and similar(y, x):
                visited[y, x] = True
                is_bg[y, x] = True
                queue.append((y, x))
    for y in range(1, h - 1):
        for x in [0, w - 1]:
            if not visited[y, x] and similar(y, x):
                visited[y, x] = True
                is_bg[y, x] = True
                queue.append((y, x))

    # BFS
    while queue:
        cy, cx = queue.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                visited[ny, nx] = True
                if similar(ny, nx):
                    is_bg[ny, nx] = True
                    queue.append((ny, nx))

    return is_bg


def auto_crop(cell: Image.Image) -> Image.Image:
    """
    Elimina el fondo alrededor del contenido.
    - Si tiene transparencia REAL (alpha < 255 en algún píxel): usa canal alpha.
    - Si el alpha es 255 en todos lados (fondo bakeado): usa flood fill con blur.
    """
    rgba = cell.convert("RGBA")
    data = np.array(rgba)

    r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]

    # ¿Hay transparencia real o el alpha es todo 255 (fondo bakeado)?
    has_real_alpha = bool((a < 255).any())

    if has_real_alpha:
        is_background = a < 128
    else:
        is_background = _flood_fill_background(data)
        # Incluir también píxeles casi blancos fuera del área de contenido
        is_background |= (r >= WHITE_THRESHOLD) & (g >= WHITE_THRESHOLD) & (b >= WHITE_THRESHOLD)

    is_content = ~is_background

    rows = np.any(is_content, axis=1)
    cols = np.any(is_content, axis=0)

    if not rows.any():
        # Celda completamente vacía, devolver tal cual
        return cell

    top    = int(np.argmax(rows))
    bottom = int(len(rows) - np.argmax(rows[::-1]))
    left   = int(np.argmax(cols))
    right  = int(len(cols) - np.argmax(cols[::-1]))

    return rgba.crop((left, top, right, bottom))


def place_centered(content: Image.Image, canvas_size: tuple[int, int]) -> Image.Image:
    """
    Coloca `content` centrado sobre un canvas transparente de `canvas_size`.
    Escala el contenido para que quepa respetando el aspect ratio.
    """
    cw, ch = canvas_size
    iw, ih = content.size

    scale = min(cw / iw, ch / ih)
    new_w = int(iw * scale)
    new_h = int(ih * scale)

    resized = content.resize((new_w, new_h), Image.LANCZOS)

    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    offset_x = (cw - new_w) // 2
    offset_y = (ch - new_h) // 2
    canvas.paste(resized, (offset_x, offset_y), resized)

    return canvas


def detect_row_split(img: Image.Image, cols: int, rows: int, bg_tolerance: int = 45) -> list[int]:
    """
    Detecta automáticamente las líneas horizontales de separación entre filas de contenido.
    Analiza varias columnas y busca las filas donde TODO el contenido desaparece (fondo puro).
    Devuelve una lista de coordenadas Y para los `rows+1` bordes de celda (incluyendo 0 y height).
    Si no encuentra separación clara, usa la división uniforme.
    """
    w, h = img.size
    data = np.array(img.convert("RGBA"))

    # Estimar bg_color global desde los bordes de la imagen completa
    border = np.concatenate([
        data[0, :, :3].astype(float),
        data[h - 1, :, :3].astype(float),
        data[:, 0, :3].astype(float),
        data[:, w - 1, :3].astype(float),
    ])
    bg_color = np.median(border, axis=0)

    # Para cada fila completa: ¿tiene contenido en alguna columna?
    diff = np.max(np.abs(data[:, :, :3].astype(float) - bg_color), axis=2)
    row_has_content = np.any(diff > bg_tolerance, axis=1)  # shape: (h,)

    # Encontrar las "bandas" de background entre grupos de contenido
    uniform_splits = [int(i * h / rows) for i in range(rows + 1)]

    if rows <= 1:
        return uniform_splits

    # Encontrar los gaps (filas sin contenido) cerca de cada punto de corte uniforme
    splits = [0]
    for i in range(1, rows):
        center = uniform_splits[i]
        search_start = max(0, center - h // rows // 3)
        search_end   = min(h, center + h // rows // 3)

        # Buscar fila sin contenido más cercana al centro
        best_y = center
        best_dist = h
        for y in range(search_start, search_end):
            if not row_has_content[y]:
                dist = abs(y - center)
                if dist < best_dist:
                    best_dist = dist
                    best_y = y

        splits.append(best_y)
    splits.append(h)

    print(f"  [auto-split] Líneas de corte detectadas: {splits}")
    return splits


def split_tridents(
    image_path: str,
    out_name: str = "trident",
    output_size: tuple[int, int] | None = None,
    padding: int = 8,
    debug: bool = False,
    auto_split: bool = True,
):
    """
    Divide la imagen en 6 partes, auto-recorta el fondo blanco de cada una
    y las centra en un canvas de tamaño uniforme.

    Args:
        image_path:  Ruta a la imagen fuente.
        output_size: Tamaño final de cada icono (ancho, alto).
                     Si es None, usa el tamaño natural de cada celda.
        padding:     Píxeles de margen vacío alrededor del contenido.
    """
    if not os.path.exists(image_path):
        print(f"Error: No se encontró la imagen '{image_path}'")
        sys.exit(1)

    os.makedirs(ICONS_DIR, exist_ok=True)

    debug_dir = os.path.join(os.path.dirname(__file__), "icons", "_debug")
    if debug:
        os.makedirs(debug_dir, exist_ok=True)

    img = Image.open(image_path).convert("RGBA")
    total_w, total_h = img.size

    cell_w = total_w // GRID_COLS

    if auto_split:
        row_splits = detect_row_split(img, GRID_COLS, GRID_ROWS)
    else:
        cell_h = total_h // GRID_ROWS
        row_splits = [i * cell_h for i in range(GRID_ROWS + 1)]

    cell_h = (row_splits[1] - row_splits[0])  # para mostrar en log

    final_size = output_size or (cell_w, cell_h)
    # Área interna disponible descontando el padding
    inner_size = (final_size[0] - padding * 2, final_size[1] - padding * 2)

    print(f"Imagen fuente  : {total_w}x{total_h} px")
    print(f"Celda original : {cell_w}x{cell_h} px")
    print(f"Tamaño de salida: {final_size[0]}x{final_size[1]} px  (padding={padding}px)")
    print(f"Guardando en   : {ICONS_DIR}\n")

    index = 0
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            left  = col * cell_w
            upper = row_splits[row]
            right = left + cell_w
            lower = row_splits[row + 1]

            cell = img.crop((left, upper, right, lower))

            # 1. Auto-recortar el fondo blanco
            cropped = auto_crop(cell)

            # 2. Centrar en canvas con padding uniforme
            centered = place_centered(cropped, inner_size)

            # 3. Añadir el padding al canvas final
            final = Image.new("RGBA", final_size, (0, 0, 0, 0))
            final.paste(centered, (padding, padding), centered)

            name = f"{out_name}{TRIDENT_NAMES[index]}"
            output_path = os.path.join(ICONS_DIR, f"{name}.png")
            final.save(output_path, "PNG")

            if debug:
                cropped.save(os.path.join(debug_dir, f"{name}_crop.png"), "PNG")
                cell.save(os.path.join(debug_dir, f"{name}_cell.png"), "PNG")

            cw, ch = cropped.size
            print(f"  [{index + 1}/6] {name}.png  contenido={cw}x{ch}px → centrado en {final_size[0]}x{final_size[1]}px")
            index += 1

    print("\n✓ Listo. 6 iconos guardados en icons/")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python split_tridents.py <ruta_imagen> [nombre] [ancho alto] [--padding N]")
        print("Ejemplo: python split_tridents.py tridents.png trident 128 128 --padding 10")
        print("Ejemplo: python split_tridents.py santuary.png santuary 128 128 --padding 10")
        sys.exit(1)

    image_path = sys.argv[1]
    output_size = None
    padding = 8
    out_name = "trident"
    debug = False

    args = sys.argv[2:]

    if "--debug" in args:
        debug = True
        args = [a for a in args if a != "--debug"]

    if "--no-auto-split" in args:
        auto_split = False
        args = [a for a in args if a != "--no-auto-split"]
    else:
        auto_split = True

    # Parsear --padding
    if "--padding" in args:
        idx = args.index("--padding")
        padding = int(args[idx + 1])
        args = [a for i, a in enumerate(args) if i != idx and i != idx + 1]

    # Si el primer argumento restante no es un número → es el nombre de salida
    if args and not args[0].lstrip("-").isdigit():
        out_name = args[0]
        args = args[1:]

    if len(args) >= 2:
        output_size = (int(args[0]), int(args[1]))

    split_tridents(image_path, out_name=out_name, output_size=output_size, padding=padding, debug=debug, auto_split=auto_split)
