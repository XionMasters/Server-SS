"""
generate_art.py  —  Arte de cartas con IA para generate_v2.py
=============================================================
Recorre las cartas de database/**/*.json y, para cada una sin arte en art/,
genera una ilustración y la guarda como art/{code}.jpg (Pollinations) o
art/{code}.png (Stable Diffusion). generate_v2.py la encuentra después por el
code de la carta.

Backends:
    pollinations  (por defecto) servicio web gratuito, sin configuración.
    sd            Stable Diffusion local (Forge/A1111 arrancado con --api).
                  URL en la variable SD_URL (por defecto http://127.0.0.1:7860).
                  Usa el LoRA de estilo Saint_Seiya_Style en todas las cartas.

Prompt: el campo "art_prompt" de la carta si existe; si no, se construye con
el nombre, el rango/tipo y la descripción, más el sufijo de estilo común.
Con --backend sd se quita el sufijo de estilo de Pollinations y se añaden los
tags de estilo de SD. Campos opcionales de la carta, solo para SD:
    "art_tags":     "1boy, male focus, long purple hair"   tags extra al inicio
                    (con 1boy/1girl se añade al negative el género contrario)
    "art_negative": "wings"                                 negative extra
    "art_loras":    {"ar13smucdz": 0.8}                     LoRA extra con su peso
                    (el trigger del LoRA va en art_tags)

Uso:
    python generate_art.py --all                       # todas las cartas sin arte
    python generate_art.py seiya_pegasus_v1            # una carta
    python generate_art.py --all --force               # regenerar aunque exista arte
    python generate_art.py --all --dry-run             # solo mostrar los prompts
    python generate_art.py --all --backend sd --limit 3          # probar con 3 cartas
    python generate_art.py --json ../../database/Santuario/Knights/gold.json --backend sd
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from generate import ART_DIR, DATABASE_DIR, find_art

API_URL = "https://image.pollinations.ai/prompt/"
# Proporción vertical: el recorte de generate_v2 centra en art_focus (por defecto, tercio superior)
WIDTH, HEIGHT = 832, 1024
TIMEOUT_S = 240
RETRIES = 3
PAUSE_S = 4   # entre peticiones, para no saturar el servicio

STYLE = (
    "Official Saint Seiya artwork style, 1986-1989 Toei Animation anime, Shingo Araki and "
    "Michi Himeno character designs, faithful to Masami Kurumada original manga, 80s cel-shaded "
    "anime look, hand-painted background, dramatic cosmo aura, vertical 3:4 composition, no text, "
    "no letters, no frame, no border, no watermark."
)

# ── Stable Diffusion local (SD 1.5 + MeinaMix probado en GTX 980 de 4 GB) ──
SD_URL = os.environ.get("SD_URL", "http://127.0.0.1:7860").rstrip("/")
SD_TIMEOUT_S = 900
# 512x768 nativo de SD 1.5; hires fix x1.5 -> 768x1152, suficiente para la ventana de arte (774x683)
SD_WIDTH, SD_HEIGHT = 512, 768
SD_HR_SCALE = 1.5
SD_STYLE_LORA = ("Saint_Seiya_Style", 0.7)
SD_STYLE = "masterpiece, best quality, retro artstyle, 1980s (style), anime coloring"
SD_NEGATIVE = (
    "lowres, bad anatomy, bad hands, extra fingers, missing fingers, blurry, jpeg artifacts, "
    "text, letters, watermark, signature, logo, frame, border, chibi, multiple views"
)
# Los art_prompt existentes llevan el estilo de Pollinations al final; SD lo sustituye por sus tags
POLLINATIONS_STYLE_RE = re.compile(r"\s*Official Saint Seiya artwork style.*$", re.S)
# Sin art_prompt: tags en inglés por rango (CLIP de SD 1.5 no entiende la descripción en español)
SD_RANK_TAGS = {
    "Bronze Saint": "bronze saint, armor",
    "Silver Saint": "silver saint, silver armor",
    "Gold Saint": "gold saint, gold armor, cape",
    "Black Saint": "black armor, dark aura, evil",
    "Marine General": "marina general, golden orange scale armor",
    "Mariner": "soldier, scale armor, trident",
    "God": "god, divine aura",
}
SD_TYPE_TAGS = {
    "technique": "energy attack, cosmic energy beam, action shot",
    "object": "no humans, still life, glowing object, centered",
    "stage": "no humans, scenery, landscape, wide shot",
    "helper": "upper body, portrait",
    "occasion": "dramatic scene",
}

RANK_EN = {
    "Bronze Saint": "Bronze Saint of Athena",
    "Silver Saint": "Silver Saint of Athena",
    "Gold Saint": "Gold Saint of Athena",
    "Black Saint": "Black Saint, dark counterpart of Athena's saints",
    "Marine General": "Marina General of Poseidon",
    "Mariner": "Mariner soldier of Poseidon",
    "God": "Olympian god",
}

TYPE_SUBJECT = {
    "technique": "{name}, a special cosmo technique shown in action, signature attack effects.",
    "object": "{name}, a sacred object drawn centered with a glowing cosmo aura.",
    "stage": "{name}, an iconic location, wide establishing shot.",
    "helper": "{name}, a supporting character, half-body portrait.",
    "occasion": "{name}, a dramatic story moment.",
}


def iter_cards(json_path: str | None):
    files = [Path(json_path)] if json_path else sorted(DATABASE_DIR.rglob("*.json"))
    for path in files:
        text = path.read_text(encoding="utf-8")
        if not text.strip():
            continue
        data = json.loads(text)
        for card in data.get("cards", []):
            if isinstance(card, dict) and card.get("code"):
                card["_type"] = data.get("type", "")
                card["_rank"] = data.get("rank", "")
                card["_saga"] = data.get("saga", "")
                yield card


def build_prompt(card: dict) -> str:
    if card.get("art_prompt"):
        return card["art_prompt"]
    name, desc = card.get("name", card["code"]), card.get("description", "")
    if card["_type"] == "knight":
        rank = RANK_EN.get(card["_rank"], card["_rank"] or "saint")
        subject = (f"{name}, {rank}. Full-body shot wearing the canonical cloth armor exactly as "
                   f"in the anime, accurate colors and helmet design, iconic battle pose.")
    else:
        subject = TYPE_SUBJECT.get(card["_type"], "{name}.").format(name=name)
    return f"{subject} {desc} {STYLE}".replace("  ", " ")


def build_sd_prompt(card: dict) -> tuple[str, str]:
    """Prompt y negative para SD: LoRA + tags de estilo + tags de la carta + sujeto sin el estilo de Pollinations."""
    if card.get("art_prompt"):
        subject = POLLINATIONS_STYLE_RE.sub("", card["art_prompt"]).strip()
    elif card["_type"] == "knight":
        rank = SD_RANK_TAGS.get(card["_rank"], "armor")
        subject = (f"{card.get('name', card['code'])}, {rank}, solo, cowboy shot, fighting stance, "
                   f"glowing cosmic aura, starry sky background")
    else:
        subject = f"{card.get('name', card['code'])}, {SD_TYPE_TAGS.get(card['_type'], '')}"
    loras = {SD_STYLE_LORA[0]: SD_STYLE_LORA[1], **(card.get("art_loras") or {})}
    lora_tags = ", ".join(f"<lora:{name}:{weight}>" for name, weight in loras.items())
    tags = card.get("art_tags", "")
    parts = [lora_tags, SD_STYLE, tags, subject]
    # MeinaMix tiende a feminizar: el género de art_tags se refuerza en el negative
    gender_negative = ("1girl, female, breasts" if "1boy" in tags
                       else "1boy, male focus" if "1girl" in tags else "")
    negative = ", ".join(p for p in (SD_NEGATIVE, gender_negative, card.get("art_negative", "")) if p)
    return ", ".join(p for p in parts if p), negative


def fetch_sd(prompt: str, negative: str, seed: int) -> bytes:
    body = json.dumps({
        "prompt": prompt, "negative_prompt": negative, "seed": seed,
        "width": SD_WIDTH, "height": SD_HEIGHT, "steps": 25, "cfg_scale": 7,
        "sampler_name": "DPM++ 2M", "scheduler": "Karras",
        "enable_hr": True, "hr_scale": SD_HR_SCALE, "hr_upscaler": "R-ESRGAN 4x+ Anime6B",
        "hr_second_pass_steps": 12, "denoising_strength": 0.4,
        "hr_additional_modules": [],   # sin esto Forge responde 500 al usar hires fix por API
    }).encode()
    req = urllib.request.Request(f"{SD_URL}/sdapi/v1/txt2img", data=body,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=SD_TIMEOUT_S) as resp:
            images = json.loads(resp.read())["images"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"Stable Diffusion devolvió {e.code}: {e.read()[:300]!r}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"Stable Diffusion no responde en {SD_URL} (¿Forge arrancado con --api?): {e}")
    return base64.b64decode(images[0])


def fetch(prompt: str, seed: int) -> bytes:
    query = urllib.parse.urlencode({
        "width": WIDTH, "height": HEIGHT, "nologo": "true", "seed": seed, "model": "flux",
    })
    url = f"{API_URL}{urllib.parse.quote(prompt, safe='')}?{query}"
    last_error: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "server-ss-card-generator"})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                data = resp.read()
                if not resp.headers.get("Content-Type", "").startswith("image/"):
                    raise RuntimeError(f"respuesta no es imagen: {data[:120]!r}")
                return data
        except Exception as e:   # red, 5xx, rate limit
            last_error = e
            print(f"    intento {attempt}/{RETRIES} falló: {e}")
            time.sleep(PAUSE_S * attempt * 2)
    raise RuntimeError(f"sin imagen tras {RETRIES} intentos: {last_error}")


def generate_for(card: dict, force: bool, dry_run: bool, backend: str) -> bool:
    code = card["code"]
    if not force and find_art(card):
        return False
    if backend == "sd":
        prompt, negative = build_sd_prompt(card)
    else:
        prompt, negative = build_prompt(card), ""
    if dry_run:
        print(f"• {code}\n    {prompt}" + (f"\n    NEG: {negative}" if negative else ""))
        return False
    # Semilla estable por carta: regenerar da la misma imagen salvo que cambie el prompt
    seed = int(hashlib.sha1(code.encode()).hexdigest()[:8], 16)
    print(f"• {code} …", flush=True)
    start = time.time()
    data, ext = (fetch_sd(prompt, negative, seed), "png") if backend == "sd" else (fetch(prompt, seed), "jpg")
    ART_DIR.mkdir(parents=True, exist_ok=True)
    # find_art prioriza .jpg: se borra el arte anterior en otro formato para que no tape al nuevo
    for old in ART_DIR.glob(f"{code}.*"):
        old.unlink()
    (ART_DIR / f"{code}.{ext}").write_bytes(data)
    print(f"  ✓ art/{code}.{ext} ({len(data) // 1024} KB, {time.time() - start:.0f} s)", flush=True)
    return True


def main():
    parser = argparse.ArgumentParser(description="Genera el arte de las cartas con IA")
    parser.add_argument("code", nargs="?")
    parser.add_argument("--json", default=None, help="Limitar a un JSON de database/")
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--force", action="store_true", help="Regenerar aunque ya exista arte")
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar los prompts")
    parser.add_argument("--backend", choices=["pollinations", "sd"], default="pollinations")
    parser.add_argument("--limit", type=int, default=0, help="Generar como máximo N imágenes")
    args = parser.parse_args()

    cards = list(iter_cards(args.json))
    if not args.all:
        if not args.code:
            parser.print_help()
            sys.exit(1)
        cards = [c for c in cards if c["code"] == args.code]
        if not cards:
            print(f"Error: carta '{args.code}' no encontrada.")
            sys.exit(1)

    generated, failed = 0, []
    for card in cards:
        if args.limit and generated >= args.limit:
            break
        try:
            if generate_for(card, args.force, args.dry_run, args.backend):
                generated += 1
                if args.backend == "pollinations":
                    time.sleep(PAUSE_S)
        except Exception as e:
            failed.append(card["code"])
            print(f"  ✗ {card['code']}: {e}", flush=True)

    print(f"\nGeneradas: {generated}  Fallidas: {len(failed)}  Total cartas: {len(cards)}")
    if failed:
        print("Reintentar: " + " ".join(failed))


if __name__ == "__main__":
    main()
