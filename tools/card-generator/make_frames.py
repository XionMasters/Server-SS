"""
make_frames.py  —  Genera las variantes de marco a partir de un marco base
==========================================================================
1. Convierte la ventana de arte (verde #00FF00) en transparente.
2. Retinta el metal dorado a otros metales (bronce, plata, negro...).
   El fondo pizarra y el pergamino no se tocan.

Uso:
    python make_frames.py                       # usa Designer.png → frames/v2/
    python make_frames.py --base otro.png --out frames/v3
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

BASE_DIR = Path(__file__).parent

# ─────────────────────────────────────────────────────────────────────────────
# VARIANTES DE METAL
# hue en grados; sat_mul/val_mul escalan saturación/brillo del dorado original.
# hue=None conserva el tono original (oro).
# ─────────────────────────────────────────────────────────────────────────────
METALS = {
    "gold":   {"hue": None, "sat_mul": 1.00, "val_mul": 1.00},
    "bronze": {"hue": 24,   "sat_mul": 0.85, "val_mul": 0.80},
    "silver": {"hue": 215,  "sat_mul": 0.10, "val_mul": 0.95},
    "black":  {"hue": 275,  "sat_mul": 0.45, "val_mul": 0.45},
}


def rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    """rgb float [0,1] (..., 3) → hsv con h en [0,360), s y v en [0,1]."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rm = nz & (mx == r)
    gm = nz & (mx == g) & ~rm
    bm = nz & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h *= 60
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return np.stack([h, s, mx], -1)


def hsv_to_rgb(hsv: np.ndarray) -> np.ndarray:
    h, s, v = hsv[..., 0] / 60, hsv[..., 1], hsv[..., 2]
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    choices = [
        np.stack([v, t, p], -1), np.stack([q, v, p], -1), np.stack([p, v, t], -1),
        np.stack([p, q, v], -1), np.stack([t, p, v], -1), np.stack([v, p, q], -1),
    ]
    out = np.zeros(hsv.shape)
    for k in range(6):
        out[i == k] = choices[k][i == k]
    return out


def green_mask(rgb: np.ndarray) -> np.ndarray:
    """Pixeles de la ventana verde (incluye vetas y bordes suavizados)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (g > 0.45) & (g > r * 1.6) & (g > b * 1.6)


def metal_weight(hsv: np.ndarray) -> np.ndarray:
    """Peso 0..1 de 'cuánto es dorado' cada pixel (transición suave)."""
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    hue_ok = np.clip(1 - np.abs(h - 42) / 25, 0, 1)        # amarillos/naranjas
    sat_ok = np.clip((s - 0.30) / 0.20, 0, 1)              # el pergamino es poco saturado
    val_ok = np.clip((v - 0.12) / 0.10, 0, 1)
    return hue_ok * sat_ok * val_ok


def make_variant(rgb: np.ndarray, hsv: np.ndarray, weight: np.ndarray, cfg: dict) -> np.ndarray:
    new = hsv.copy()
    if cfg["hue"] is not None:
        # Conserva las variaciones de tono alrededor del dorado medio (42°)
        new[..., 0] = (cfg["hue"] + (hsv[..., 0] - 42)) % 360
    new[..., 1] = np.clip(hsv[..., 1] * cfg["sat_mul"], 0, 1)
    new[..., 2] = np.clip(hsv[..., 2] * cfg["val_mul"], 0, 1)
    tinted = hsv_to_rgb(new)
    w = weight[..., None]
    return rgb * (1 - w) + tinted * w


def main():
    parser = argparse.ArgumentParser(description="Genera variantes de marco")
    parser.add_argument("--base", default=str(BASE_DIR / "Designer.png"))
    parser.add_argument("--out",  default=str(BASE_DIR / "frames" / "v2"))
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    img = Image.open(args.base).convert("RGB")
    rgb = np.asarray(img).astype(np.float64) / 255
    hsv = rgb_to_hsv(rgb)

    # Ventana de arte → transparente. Se expande 2px para comerse el halo verde.
    mask_img = Image.fromarray((green_mask(rgb) * 255).astype(np.uint8))
    from PIL import ImageFilter
    mask_img = mask_img.filter(ImageFilter.MaxFilter(5))
    alpha = 255 - np.asarray(mask_img)

    ys, xs = np.nonzero(alpha == 0)
    print(f"Ventana de arte: x={xs.min()}..{xs.max()}  y={ys.min()}..{ys.max()}")

    weight = metal_weight(hsv)
    weight[alpha == 0] = 0

    for name, cfg in METALS.items():
        out_rgb = make_variant(rgb, hsv, weight, cfg)
        rgba = np.dstack([(out_rgb * 255).round().astype(np.uint8), alpha.astype(np.uint8)])
        path = out_dir / f"frame-{name}.png"
        Image.fromarray(rgba, "RGBA").save(path)
        print(f"  ✓ {path}")


if __name__ == "__main__":
    main()
