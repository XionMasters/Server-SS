"""
generate.py  —  Generador de cartas para Caballeros Cósmicos
=============================================================
Lee datos de carta desde los JSON en database/ y genera una imagen PNG composita.

Uso:
    python generate.py <card_code>                        # genera una carta
    python generate.py seiya_pegasus_v1
    python generate.py seiya_pegasus_v1 --frame frames/frame-basic.png
    python generate.py seiya_pegasus_v1 --art art/pegasus-seiya-v1.jpg
    python generate.py --all                              # genera todas las cartas del JSON
    python generate.py --json database/Santuario/Knights/legendary.json seiya_pegasus_v1

Opciones:
    --json <path>       JSON fuente (default: busca en todos los JSONs de database/)
    --frame <path>      Frame PNG a usar (override; si no, se elige por rareza)
    --art <path>        Arte a usar (override; si no, se busca por card code)
    --out <dir>         Directorio de salida (default: output/)
    --art-crop <0-1>    Qué parte vertical recortar del arte (0=arriba, 1=abajo) default: 0.15
    --all               Genera todas las cartas del JSON indicado
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ─────────────────────────────────────────────────────────────────────────────
# RUTAS BASE
# ─────────────────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
FRAMES_DIR  = BASE_DIR / "frames"
ART_DIR     = BASE_DIR / "art"
ICONS_DIR   = BASE_DIR / "icons"
FONTS_DIR   = BASE_DIR / "fonts"
OUTPUT_DIR  = BASE_DIR / "output"
DATABASE_DIR = BASE_DIR.parents[1] / "database"   # Server-SS/database/

# ─────────────────────────────────────────────────────────────────────────────
# ICONOS DE RAREZA  (icons/{prefix}_{suffix}.png)
# ─────────────────────────────────────────────────────────────────────────────
SAGA_RARITY_ICON_PREFIX = {
    "Santuario": "santuary",
    # Agregar más sagas aquí
}
RARITY_ICON_SUFFIX = {
    "common":    "dark",
    "uncommon":  "silver",
    "rare":      "teal",
    "epic":      "gold",
    "legendary": "orange",
    "divine":    "red",
}

# ─────────────────────────────────────────────────────────────────────────────
# FRAMES POR RANGO
# ─────────────────────────────────────────────────────────────────────────────
RANK_FRAMES = {
    "Bronze Saint": "frame-special.png",
    "Silver Saint": "frame-silver.png",
    "Gold Saint":   "frame-gold.png",
    "Black Saint":  "frame-black.png",
    # Agregar más rangos aquí — fallback: frame-basic.png
}

# ─────────────────────────────────────────────────────────────────────────────
# COLORES DE ELEMENTO  (fallback cuando no hay arte)
# ─────────────────────────────────────────────────────────────────────────────
ELEMENT_COLORS = {
    "fire":   (200, 60,  20),
    "water":  (30,  100, 200),
    "wind":   (30,  160, 80),
    "earth":  (140, 100, 40),
    "steel":  (100, 100, 120),
    "light":  (200, 180, 60),
    "dark":   (80,  40,  120),
}

# ─────────────────────────────────────────────────────────────────────────────
# SISTEMA DE LAYOUTS POR FRAME
# ─────────────────────────────────────────────────────────────────────────────
# El layout base está en frames/frame-default.json.
# Cada frame puede tener su propio JSON en frames/{stem}.json con overrides.
# Los dicts anidados se mergean clave a clave; las listas se reemplazan completas.
# Ejemplo: frames/frame-gold.json solo necesita las claves que difieren del default.

_layout_cache: dict[str, dict] = {}


def _deep_merge(base: dict, overrides: dict) -> dict:
    """Combina base con overrides. Los dicts anidados se mergean; el resto se reemplaza."""
    result = dict(base)
    for key, val in overrides.items():
        if key in result and isinstance(result[key], dict) and isinstance(val, dict):
            result[key] = _deep_merge(result[key], val)
        else:
            result[key] = val
    return result


def _convert_colors(data: object) -> object:
    """Recorre el layout y convierte listas de 3-4 enteros (RGB/RGBA) a tuplas para Pillow."""
    if isinstance(data, dict):
        return {k: _convert_colors(v) for k, v in data.items()}
    if isinstance(data, list):
        # Lista de 3 o 4 ints → color RGB/RGBA
        if len(data) in (3, 4) and all(isinstance(v, int) for v in data):
            return tuple(data)
        return [_convert_colors(item) for item in data]
    return data


def get_layout(frame_file: str) -> dict:
    """Carga frames/frame-default.json y mergea frames/{stem}.json si existe.
    Los resultados se cachean por stem para evitar re-lecturas.
    """
    stem = Path(frame_file).stem  # ej: "frame-gold"
    if stem in _layout_cache:
        return _layout_cache[stem]

    default_path = FRAMES_DIR / "frame-default.json"
    if not default_path.exists():
        raise FileNotFoundError(f"No se encontró el layout base: {default_path}")
    with open(default_path, encoding="utf-8") as f:
        base = json.load(f)

    override_path = FRAMES_DIR / f"{stem}.json"
    if override_path.exists() and stem != "frame-default":
        with open(override_path, encoding="utf-8") as f:
            overrides = json.load(f)
        result = _deep_merge(base, overrides)
    else:
        result = base

    result = _convert_colors(result)
    _layout_cache[stem] = result
    return result


# ─────────────────────────────────────────────────────────────────────────────
# FUENTES
# ─────────────────────────────────────────────────────────────────────────────
_font_cache: dict[int, ImageFont.FreeTypeFont] = {}

def get_font(size: int) -> ImageFont.FreeTypeFont:
    if size not in _font_cache:
        font_path = FONTS_DIR / "OPTIBelwe-Medium.otf"
        try:
            _font_cache[size] = ImageFont.truetype(str(font_path), size)
        except Exception:
            _font_cache[size] = ImageFont.load_default()
    return _font_cache[size]

# ─────────────────────────────────────────────────────────────────────────────
# BÚSQUEDA DE DATOS DE CARTA
# ─────────────────────────────────────────────────────────────────────────────
def find_card_data(code: str, json_path: str | None = None) -> dict | None:
    """Busca la carta por code en el JSON indicado o en todos los JSONs de database/."""
    search_paths: list[Path] = []

    if json_path:
        search_paths = [Path(json_path)]
    else:
        # Buscar recursivamente en database/
        if DATABASE_DIR.exists():
            search_paths = list(DATABASE_DIR.rglob("*.json"))
        # También buscar en data/ local
        local_data = BASE_DIR / "data"
        if local_data.exists():
            search_paths += list(local_data.rglob("*.json"))

    for path in search_paths:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            cards = data.get("cards", [data]) if isinstance(data, dict) else data
            for card in cards:
                if isinstance(card, dict) and card.get("code") == code:
                    # Añadir metadatos del archivo
                    card["_source_file"] = str(path)
                    card["_saga"] = data.get("saga", "")
                    card["_rank"] = data.get("rank", "")
                    return card
        except Exception:
            continue

    return None


def load_all_cards(json_path: str) -> list[dict]:
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)
    cards = data.get("cards", [])
    saga = data.get("saga", "")
    rank = data.get("rank", "")
    for c in cards:
        c["_source_file"] = json_path
        c["_saga"] = saga
        c["_rank"] = rank
    return cards


# ─────────────────────────────────────────────────────────────────────────────
# BÚSQUEDA DE ARTE
# ─────────────────────────────────────────────────────────────────────────────
ART_EXTENSIONS = [".jpg", ".jpeg", ".jfif", ".png", ".webp"]

def find_art(card: dict, art_override: str | None = None) -> Path | None:
    """Busca el archivo de arte para la carta."""
    if art_override:
        p = Path(art_override)
        return p if p.exists() else None

    # 1) Buscar por code en art/
    for ext in ART_EXTENSIONS:
        p = ART_DIR / f"{card['code']}{ext}"
        if p.exists():
            return p

    # 2) Buscar por image_url relativo a assets/cards/ del servidor
    image_url = card.get("image_url", "")
    if image_url:
        # Intentar en art/ directamente (nombre del archivo)
        filename = Path(image_url).name
        for ext in ART_EXTENSIONS:
            stem = Path(filename).stem
            p = ART_DIR / f"{stem}{ext}"
            if p.exists():
                return p
        # Intentar src/assets/cards/ del servidor
        server_assets = BASE_DIR.parents[1] / "src" / "assets" / "cards"
        p = server_assets / image_url
        if p.exists():
            return p

    return None


# ─────────────────────────────────────────────────────────────────────────────
# COMPOSICIÓN DE LA CARTA
# ─────────────────────────────────────────────────────────────────────────────
def compose_card(
    card: dict,
    frame_override: str | None = None,
    art_override: str | None = None,
    art_crop: float = 0.15,
    out_dir: Path = OUTPUT_DIR,
) -> Path:
    """Compone la imagen de la carta y la guarda. Devuelve la ruta del output."""

    out_dir.mkdir(parents=True, exist_ok=True)

    stats    = card.get("stats", {})
    rarity   = card.get("rarity", "common")
    element  = card.get("element", "steel")
    saga     = card.get("_saga", "")
    code     = card["code"]

    # ── Frame (según rank del caballero) ─────────────────────────────────────
    rank = card.get("_rank", "Bronze Saint")
    frame_file = RANK_FRAMES.get(rank, "frame-basic.png")
    frame_name = frame_override or (FRAMES_DIR / frame_file)
    frame = Image.open(frame_name).convert("RGBA")
    fw, fh = frame.size

    # ── Layout efectivo para este frame ──────────────────────────────────────
    layout = get_layout(str(frame_name))

    # ── Canvas base (fondo blanco) ────────────────────────────────────────────
    canvas = Image.new("RGBA", (fw, fh), (255, 255, 255, 255))

    # ── Arte ─────────────────────────────────────────────────────────────────
    art_path = find_art(card, art_override)
    if art_path:
        _paste_art(canvas, art_path, art_crop, layout)
    else:
        # Fondo de color según elemento
        el_color = ELEMENT_COLORS.get(element, (180, 180, 180))
        art_bg = Image.new("RGBA", (fw, fh), (*el_color, 255))
        canvas.alpha_composite(art_bg)
        print(f"  ⚠ Arte no encontrado para '{code}'. Usando color de elemento.")

    # ── Frame superpuesto ────────────────────────────────────────────────────
    canvas.alpha_composite(frame)

    # ── Textos ───────────────────────────────────────────────────────────────
    draw = ImageDraw.Draw(canvas)
    _draw_name(draw, card, layout)
    _draw_element_icon(canvas, element, layout)
    _draw_stat_circles(draw, card, stats, layout)
    _draw_rank_label(draw, card, layout)
    # _draw_description(draw, card, layout)
    _draw_abilities(draw, card, layout)
    _draw_rarity_icon(canvas, rarity, saga, layout)

    # ── Guardar ──────────────────────────────────────────────────────────────
    out_path = out_dir / f"{code}.webp"
    canvas.convert("RGB").save(str(out_path), "WEBP", quality=92)
    print(f"  ✓ {code}.webp  →  {out_path}")
    return out_path


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS DE RENDER
# ─────────────────────────────────────────────────────────────────────────────

def _paste_art(canvas: Image.Image, art_path: Path, art_crop: float, layout: dict):
    aw_cfg = layout["art_window"]
    WIN_X  = aw_cfg["x"]
    WIN_Y  = aw_cfg["y"]
    WIN_W  = aw_cfg["w"]
    WIN_H  = aw_cfg["h"]
    pad_l  = aw_cfg["pad_left"]
    pad_r  = aw_cfg["pad_right"]

    art_w  = WIN_W - pad_l - pad_r
    art    = Image.open(art_path).convert("RGBA")
    aw, ah = art.size

    scale  = art_w / aw
    art_h  = int(ah * scale)
    art_scaled = art.resize((art_w, art_h), Image.LANCZOS)

    crop_y = int((art_h - WIN_H) * art_crop) if art_h > WIN_H else 0
    crop_h = min(WIN_H, art_h)
    art_crop_img = art_scaled.crop((0, crop_y, art_w, crop_y + crop_h))

    art_y  = WIN_Y + (WIN_H - crop_h) // 2
    canvas.alpha_composite(art_crop_img, dest=(WIN_X + pad_l, art_y))


def _draw_centered(draw: ImageDraw.ImageDraw, text: str, cx: int, cy: int,
                   font: ImageFont.FreeTypeFont, color: tuple):
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), text, font=font, fill=color)


def _draw_name(draw: ImageDraw.ImageDraw, card: dict, layout: dict):
    cfg  = layout["name"]
    font = get_font(cfg["font_size"])
    name = card.get("name", card["code"])

    cx = cfg["x"] + cfg["w"] // 2
    cy = cfg["y"] + cfg["h"] // 2
    _draw_centered(draw, name, cx, cy, font, cfg["color"])


def _draw_element_icon(canvas: Image.Image, element: str, layout: dict):
    """Busca icons/<element>.<ext> y lo pega al canvas. Si no existe, omite silenciosamente."""
    cfg = layout["element_icon"]
    for ext in (".png", ".bmp", ".jpg", ".jpeg"):
        icon_path = ICONS_DIR / f"{element}{ext}"
        if icon_path.exists():
            icon = Image.open(icon_path).convert("RGBA")
            icon = icon.resize((cfg["size"], cfg["size"]), Image.LANCZOS)
            canvas.alpha_composite(icon, dest=(cfg["x"], cfg["y"]))
            return
    # Icono no encontrado — omitir silenciosamente


def _draw_stat_circles(draw: ImageDraw.ImageDraw, card: dict, stats: dict, layout: dict):
    for stat_key, label, cx, cy, radius, font_size, font_size_label in layout["stat_circles"]:
        value = stats.get(stat_key, card.get(stat_key, 0))

        font = get_font(font_size)
        font_label = get_font(font_size_label)

        # Valor (número grande, centrado en el círculo)
        _draw_centered(draw, str(value), cx, cy, font, (20, 20, 20))
        # Label pequeño encima
        _draw_centered(draw, label, cx, cy - radius // 2, font_label, (150, 0, 24)) # rojo oscuro


def _draw_rank_label(draw: ImageDraw.ImageDraw, card: dict, layout: dict):
    cfg   = layout["rank_label"]
    font  = get_font(cfg["font_size"])
    rank  = card.get("_rank", "")
    if not rank:
        return
    cx = cfg["x"] + cfg["w"] // 2
    cy = cfg["y"] 
    _draw_centered(draw, rank, cx, cy, font, cfg["color"])


def _draw_description(draw: ImageDraw.ImageDraw, card: dict, layout: dict):
    cfg   = layout["description"]
    desc  = card.get("description", "")
    if not desc:
        return

    font  = get_font(cfg["font_size"])
    max_w = cfg["w"]
    x, y  = cfg["x"], cfg["y"]

    # Wrap por ancho
    avg_char_w = cfg["font_size"] * 0.55
    chars_per_line = max(1, int(max_w / avg_char_w))
    lines = textwrap.wrap(desc, width=chars_per_line)[:cfg["max_lines"]]
    line_h = cfg["font_size"] + cfg["line_spacing"]

    for line in lines:
        draw.text((x, y), line, font=font, fill=cfg["color"])
        y += line_h


def _draw_abilities(draw: ImageDraw.ImageDraw, card: dict, layout: dict):
    cfg        = layout["abilities"]
    abilities  = card.get("abilities", [])[:cfg["max_abilities"]]
    if not abilities:
        return

    x, y = cfg["x"], cfg["y"]
    max_w = cfg["w"]

    f_name = get_font(cfg["font_size_name"])
    f_desc = get_font(cfg["font_size_desc"])

    avg_char_w_desc = cfg["font_size_desc"] * 0.54
    chars_per_line  = max(1, int(max_w / avg_char_w_desc))

    for ability in abilities:
        a_type  = ability.get("type", "").upper()
        a_name  = ability.get("name", "")
        a_desc  = ability.get("description", "")

        # Nombre de habilidad
        header = f"[{a_type}] {a_name}"
        draw.text((x, y), header, font=f_name, fill=cfg["name_color"])
        y += cfg["font_size_name"] + cfg["line_spacing"]

        # Descripción (wrapeada, max 3 líneas)
        lines = textwrap.wrap(a_desc, width=chars_per_line)[:3]
        for line in lines:
            draw.text((x, y), line, font=f_desc, fill=cfg["desc_color"])
            y += cfg["font_size_desc"] + cfg["line_spacing"]

        y += 12  # espacio entre habilidades


def _draw_rarity_icon(canvas: Image.Image, rarity: str, saga: str, layout: dict):
    """Pega el icono de rareza (icons/{saga_prefix}_{suffix}.png) en el canvas."""
    cfg    = layout["rarity_icon"]
    prefix = SAGA_RARITY_ICON_PREFIX.get(saga, "")
    suffix = RARITY_ICON_SUFFIX.get(rarity, "dark")
    if not prefix:
        return
    for ext in (".png", ".bmp", ".jpg", ".jpeg"):
        icon_path = ICONS_DIR / f"{prefix}_{suffix}{ext}"
        if icon_path.exists():
            icon = Image.open(icon_path).convert("RGBA")
            icon = icon.resize((cfg["size"], cfg["size"]), Image.LANCZOS)
            canvas.alpha_composite(icon, dest=(cfg["x"], cfg["y"]))
            return


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Generador de cartas — Caballeros Cósmicos")
    parser.add_argument("code", nargs="?", help="Código de la carta (ej: seiya_pegasus_v1)")
    parser.add_argument("--json",      default=None, help="JSON fuente")
    parser.add_argument("--frame",     default=None, help="Frame PNG override")
    parser.add_argument("--art",       default=None, help="Arte PNG/JPG override")
    parser.add_argument("--out",       default=str(OUTPUT_DIR), help="Directorio de salida")
    parser.add_argument("--art-crop",  type=float, default=0.0,
                        help="Offset de recorte vertical del arte (0.0-1.0, default 0.15)")
    parser.add_argument("--all",       action="store_true", help="Generar todas las cartas del JSON")
    args = parser.parse_args()

    out_dir = Path(args.out)

    if args.all:
        if not args.json:
            print("Error: --all requiere --json <path>")
            sys.exit(1)
        cards = load_all_cards(args.json)
        print(f"Generando {len(cards)} cartas desde {args.json}...\n")
        for card in cards:
            try:
                compose_card(card, args.frame, args.art, args.art_crop, out_dir)
            except Exception as e:
                print(f"  ✗ Error en {card.get('code', '?')}: {e}")
        return

    if not args.code:
        parser.print_help()
        sys.exit(1)

    card = find_card_data(args.code, args.json)
    if not card:
        print(f"Error: carta '{args.code}' no encontrada.")
        if not args.json:
            print("  Hint: usá --json <path> para especificar el archivo JSON.")
        sys.exit(1)

    print(f"Generando carta: {card.get('name', args.code)}")
    compose_card(card, args.frame, args.art, args.art_crop, out_dir)


if __name__ == "__main__":
    main()
