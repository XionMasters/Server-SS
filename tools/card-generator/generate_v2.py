"""
generate_v2.py  —  Generador de cartas con los marcos v2 (frames/v2/)
=====================================================================
Usa el mismo JSON de cartas que generate.py, pero con el layout nuevo:
facción con aro de rareza, coste en el hexágono, gemas de stats, rango en la
banda, elemento en la ranura y habilidades con separadores y coste.

Uso:
    python generate_v2.py seiya_pegasus_v1
    python generate_v2.py seiya_pegasus_v1 --art seiya-v1.png --metal bronze
    python generate_v2.py --all --json ../../database/Santuario/Knights/legendary.json

Campos opcionales de la carta en el JSON:
    "art_focus": [0.5, 0.25]   punto del arte que debe quedar centrado (x, y en 0..1)
    "frame_metal": "bronze"    fuerza el metal del marco
    "constellation": "pegasus" icono del medallón inferior (icons/constellations/pegasus.png)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from generate import (
    ICONS_DIR,
    OUTPUT_DIR,
    SAGA_RARITY_ICON_PREFIX,
    find_art,
    find_card_data,
    get_font,
    load_all_cards,
)

V2_DIR = Path(__file__).parent / "frames" / "v2"

RANK_METAL = {
    "Bronze Saint": "bronze",
    "Silver Saint": "silver",
    "Gold Saint":   "gold",
    "Black Saint":  "black",
}

RANK_LABEL_ES = {
    "Bronze Saint": "Santo de Bronce",
    "Silver Saint": "Santo de Plata",
    "Gold Saint":   "Santo de Oro",
    "Black Saint":  "Santo Negro",
}

ABILITY_TYPE_ES = {
    "pasiva": "PASIVA", "activa": "ACTIVA",
    "equipamiento": "EQUIPO", "campo": "CAMPO",
}

# Escala clásica de rarezas. El icono de facción se retinta con este color.
RARITY_COLORS = {
    "common":    (150, 150, 155),   # gris / hierro
    "uncommon":  (60, 185, 80),     # verde
    "rare":      (50, 120, 230),    # azul
    "epic":      (155, 70, 220),    # violeta
    "legendary": (240, 165, 30),    # dorado / naranja
    "divine":    (215, 30, 45),     # carmesí
}
# Variante de icono que se usa como base para retintar (icons/{prefix}_{base}.png)
FACTION_ICON_BASE = "gold"

CONSTELLATIONS_DIR = ICONS_DIR / "constellations"

ELEMENT_GEMS = {
    "fire":  (210, 70, 25),
    "water": (30, 110, 210),
    "wind":  (40, 170, 90),
    "earth": (150, 105, 45),
    "steel": (130, 135, 150),
    "light": (235, 205, 80),
    "dark":  (95, 45, 140),
}


def load_layout() -> dict:
    with open(V2_DIR / "layout.json", encoding="utf-8") as f:
        return json.load(f)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS DE DIBUJO
# ─────────────────────────────────────────────────────────────────────────────

def fit_font(text: str, max_w: int, size: int, min_size: int):
    while size > min_size and get_font(size).getlength(text) > max_w:
        size -= 1
    return get_font(size)


def draw_text_center(draw: ImageDraw.ImageDraw, text: str, cx: float, cy: float, font,
                     fill, stroke=None, stroke_width: int = 0):
    draw.text((cx, cy), text, font=font, fill=tuple(fill), anchor="mm",
              stroke_width=stroke_width, stroke_fill=tuple(stroke) if stroke else None)


def paint_gem(canvas: Image.Image, cx: int, cy: int, r: int, color):
    """Gema esférica: degradado radial con brillo arriba a la izquierda."""
    size = r * 2
    gem = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = gem.load()
    hx, hy = size * 0.35, size * 0.30
    for y in range(size):
        for x in range(size):
            dx, dy = x - r + 0.5, y - r + 0.5
            if dx * dx + dy * dy > r * r:
                continue
            dist = ((x - hx) ** 2 + (y - hy) ** 2) ** 0.5 / (size * 0.95)
            k = max(0.0, 1.0 - dist)
            shade = 0.45 + 0.75 * k
            c = [min(255, int(ch * shade + 90 * k ** 3)) for ch in color]
            px[x, y] = (*c, 255)
    canvas.alpha_composite(gem, dest=(cx - r, cy - r))


def paste_icon(canvas: Image.Image, path: Path, cx: int, cy: int, r: int):
    icon = Image.open(path).convert("RGBA")
    icon.thumbnail((r * 2, r * 2), Image.LANCZOS)
    canvas.alpha_composite(icon, dest=(cx - icon.width // 2, cy - icon.height // 2))


def wrap(text: str, font, max_w: int) -> list[str]:
    lines, cur = [], ""
    for word in text.split():
        test = f"{cur} {word}".strip()
        if font.getlength(test) <= max_w:
            cur = test
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


# ─────────────────────────────────────────────────────────────────────────────
# PIEZAS DE LA CARTA
# ─────────────────────────────────────────────────────────────────────────────

def paste_art(canvas: Image.Image, art_path: Path, focus, cfg: dict):
    """Recorte tipo 'cover' centrado en focus."""
    b = cfg["bleed"]
    wx, wy, ww, wh = cfg["x"] - b, cfg["y"] - b, cfg["w"] + 2 * b, cfg["h"] + 2 * b
    art = Image.open(art_path).convert("RGBA")
    scale = max(ww / art.width, wh / art.height)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
    fx, fy = focus
    left = min(max(0, int(art.width * fx - ww / 2)), art.width - ww)
    top = min(max(0, int(art.height * fy - wh / 2)), art.height - wh)
    canvas.alpha_composite(art.crop((left, top, left + ww, top + wh)), dest=(wx, wy))


def ability_header(ability: dict) -> str:
    a_type = ABILITY_TYPE_ES.get(ability.get("type", ""), ability.get("type", "").upper())
    costs = []
    for c in (ability.get("effects") or {}).get("cost", []) or []:
        if c.get("type") == "cosmos":
            costs.append(f"{c.get('amount', 0)} CP")
        elif c.get("type") == "player_cosmos":
            costs.append(f"{c.get('amount', 0)} Cosmo")
        elif c.get("type") == "life":
            costs.append(f"{c.get('amount', 0)} LP")
        elif c.get("type") == "discard":
            costs.append("Descarte")
    # OPTIBelwe no tiene "·"; se usa guion
    cost_txt = f" - {', '.join(costs)}" if costs else ""
    return f"[{a_type}{cost_txt}] {ability.get('name', '')}"


def layout_abilities(abilities: list[dict], cfg: dict, desc_size: int):
    """Devuelve (bloques, alto_total) para un tamaño de fuente dado."""
    name_size = max(desc_size + 2, round(cfg["font_size_name"] * desc_size / cfg["font_size_desc"]))
    f_name, f_desc = get_font(name_size), get_font(desc_size)
    blocks, total = [], 0
    for i, ab in enumerate(abilities):
        header = wrap(ability_header(ab), f_name, cfg["w"])
        body = wrap(ab.get("description", ""), f_desc, cfg["w"])
        h = len(header) * (name_size + cfg["line_spacing"]) + len(body) * (desc_size + cfg["line_spacing"])
        blocks.append((header, body, f_name, f_desc, name_size))
        total += h + (cfg["gap"] * 2 if i < len(abilities) - 1 else 0)
    return blocks, total


def draw_divider(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, color):
    color = tuple(color)
    cx = x + w // 2
    draw.line([(x + 30, y), (cx - 16, y)], fill=color, width=2)
    draw.line([(cx + 16, y), (x + w - 30, y)], fill=color, width=2)
    s = 9
    draw.polygon([(cx, y - s), (cx + s // 2, y), (cx, y + s), (cx - s // 2, y)], fill=color)
    draw.polygon([(cx - s, y), (cx, y - s // 2), (cx + s, y), (cx, y + s // 2)], fill=color)


def draw_abilities(draw: ImageDraw.ImageDraw, abilities: list[dict], cfg: dict):
    if not abilities:
        return
    size = cfg["font_size_desc"]
    blocks, total = layout_abilities(abilities, cfg, size)
    while total > cfg["h"] and size > cfg["min_font_size_desc"]:
        size -= 1
        blocks, total = layout_abilities(abilities, cfg, size)
    if total > cfg["h"]:
        print(f"  ⚠ Las habilidades no caben ni a {size}px; se cortará el texto.")

    y = cfg["y"] + max(0, (cfg["h"] - total) // 3)   # algo de aire arriba si sobra espacio
    for i, (header, body, f_name, f_desc, name_size) in enumerate(blocks):
        for line in header:
            draw.text((cfg["x"], y), line, font=f_name, fill=tuple(cfg["name_color"]))
            y += name_size + cfg["line_spacing"]
        for line in body:
            draw.text((cfg["x"], y), line, font=f_desc, fill=tuple(cfg["desc_color"]))
            y += size + cfg["line_spacing"]
        if i < len(blocks) - 1:
            y += cfg["gap"]
            draw_divider(draw, cfg["x"], y, cfg["w"], cfg["divider_color"])
            y += cfg["gap"]


def tint_icon(path: Path, color) -> Image.Image:
    """Retinta un icono según su luminancia: sombras oscuras, brillos casi blancos."""
    icon = Image.open(path).convert("RGBA")
    lum = icon.convert("L")
    alpha = icon.getchannel("A")
    lut = []
    for ch in color:
        lut += [min(255, int(ch * (0.25 + 1.1 * v / 255) + max(0, v - 200) * 1.2)) for v in range(256)]
    rgb = Image.merge("RGB", (lum, lum, lum)).point(lut)
    rgb.putalpha(alpha)
    return rgb


def faction_icon(card: dict) -> Image.Image | None:
    """Icono de facción retintado con el color de la rareza."""
    prefix = SAGA_RARITY_ICON_PREFIX.get(card.get("_saga", ""), "")
    if not prefix:
        return None
    base = ICONS_DIR / f"{prefix}_{FACTION_ICON_BASE}.png"
    if not base.exists():
        return None
    color = RARITY_COLORS.get(card.get("rarity", "common"), RARITY_COLORS["common"])
    return tint_icon(base, color)


# ─────────────────────────────────────────────────────────────────────────────
# COMPOSICIÓN
# ─────────────────────────────────────────────────────────────────────────────

def compose_card_v2(card: dict, metal: str | None, art_override: str | None, out_dir: Path) -> Path:
    L = load_layout()
    code = card["code"]
    rank = card.get("_rank", "")
    metal = metal or card.get("frame_metal") or RANK_METAL.get(rank, "gold")

    frame = Image.open(V2_DIR / f"frame-{metal}.png").convert("RGBA")
    canvas = Image.new("RGBA", frame.size, (0, 0, 0, 0))

    # Arte (detrás del marco)
    art_path = find_art(card, art_override)
    if art_path:
        paste_art(canvas, art_path, card.get("art_focus", [0.5, 0.25]), L["art_window"])
    else:
        a = L["art_window"]
        color = ELEMENT_GEMS.get(card.get("element", ""), (60, 60, 80))
        canvas.alpha_composite(Image.new("RGBA", (a["w"] + 12, a["h"] + 12), (*color, 255)),
                               dest=(a["x"] - 6, a["y"] - 6))
        print(f"  ⚠ Arte no encontrado para '{code}'. Usando color de elemento.")

    canvas.alpha_composite(frame)
    draw = ImageDraw.Draw(canvas)

    # Nombre
    n = L["name"]
    font = fit_font(card.get("name", code), n["w"], n["font_size"], n["min_font_size"])
    draw_text_center(draw, card.get("name", code), n["x"] + n["w"] / 2, n["y"] + n["h"] / 2,
                     font, n["fill"], n["stroke"], n["stroke_width"])

    # Facción + rareza
    fi = L["faction_icon"]
    icon = faction_icon(card)
    if icon:
        icon = icon.crop(icon.getchannel("A").getbbox())   # quitar margen transparente
        k = fi["r"] * 1.6 / max(icon.size)
        icon = icon.resize((round(icon.width * k), round(icon.height * k)), Image.LANCZOS)
        canvas.alpha_composite(icon, dest=(fi["cx"] - icon.width // 2, fi["cy"] - icon.height // 2))

    # Constelación / signo / emblema en el medallón inferior
    bm = L["bottom_medallion"]
    constellation = card.get("constellation")
    if constellation:
        c_icon = CONSTELLATIONS_DIR / f"{constellation}.png"
        if c_icon.exists():
            paste_icon(canvas, c_icon, bm["cx"], bm["cy"], bm["r"])
        else:
            print(f"  ⚠ Icono de constelación no encontrado: {c_icon.name}")

    # Coste
    c = L["cost"]
    draw_text_center(draw, str(card.get("cost", 0)), c["cx"], c["cy"],
                     get_font(c["font_size"]), c["fill"], c["stroke"], c["stroke_width"])

    # Stats
    st = L["stats"]
    stats = card.get("stats", {})
    for item in st["items"]:
        paint_gem(canvas, item["cx"], item["cy"], st["r"] - 4, item["gem"])
    draw = ImageDraw.Draw(canvas)
    for item in st["items"]:
        draw_text_center(draw, item["label"], item["cx"], item["cy"] - st["r"] * 0.55,
                         get_font(st["label_size"]), (255, 240, 210), (20, 10, 5), 2)
        draw_text_center(draw, str(stats.get(item["key"], 0)), item["cx"], item["cy"] + 8,
                         get_font(st["font_size"]), (255, 255, 255), (20, 10, 5), 4)

    # Rango
    rl = L["rank_label"]
    rank_txt = RANK_LABEL_ES.get(rank, rank)
    if rank_txt:
        font = fit_font(rank_txt, rl["w"], rl["font_size"], rl["min_font_size"])
        draw_text_center(draw, rank_txt, rl["x"] + rl["w"] / 2, rl["y"] + rl["h"] / 2,
                         font, rl["fill"], rl["stroke"], rl["stroke_width"])

    # Elemento
    es = L["element_socket"]
    gem_color = ELEMENT_GEMS.get(card.get("element", ""))
    if gem_color:
        el_icon = ICONS_DIR / f"{card['element']}.png"
        if el_icon.exists():
            paste_icon(canvas, el_icon, es["cx"], es["cy"], es["r"])
        else:
            paint_gem(canvas, es["cx"], es["cy"], es["r"] - 6, gem_color)

    # Habilidades
    draw = ImageDraw.Draw(canvas)
    draw_abilities(draw, card.get("abilities", []), L["abilities"])

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{code}.webp"
    canvas.save(out_path, "WEBP", quality=92)
    print(f"  ✓ {code}.webp  →  {out_path}")
    return out_path


def main():
    parser = argparse.ArgumentParser(description="Generador de cartas v2")
    parser.add_argument("code", nargs="?")
    parser.add_argument("--json", default=None)
    parser.add_argument("--art", default=None)
    parser.add_argument("--metal", default=None, choices=["gold", "bronze", "silver", "black"])
    parser.add_argument("--out", default=str(OUTPUT_DIR / "v2"))
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    out_dir = Path(args.out)

    if args.all:
        if not args.json:
            print("Error: --all requiere --json <path>")
            sys.exit(1)
        for card in load_all_cards(args.json):
            try:
                compose_card_v2(card, args.metal, None, out_dir)
            except Exception as e:
                print(f"  ✗ Error en {card.get('code', '?')}: {e}")
        return

    if not args.code:
        parser.print_help()
        sys.exit(1)
    card = find_card_data(args.code, args.json)
    if not card:
        print(f"Error: carta '{args.code}' no encontrada.")
        sys.exit(1)
    compose_card_v2(card, args.metal, args.art, out_dir)


if __name__ == "__main__":
    main()
