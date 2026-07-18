#!/usr/bin/env python3
"""
detect_tree_origins.py — Prépare un lot de PNG de décor (arbres) pour une
animation CSS "balancement · vent léger", au coût de création et
d'implémentation le plus bas possible :

  - détecte automatiquement le pied de chaque arbre (pivot de rotation),
    pas de réglage manuel par image ;
  - rogne la marge transparente inutile (fichiers plus légers à charger) ;
  - génère un manifest.json + un fragment HTML prêt à copier-coller.

Aucune image n'est ré-animée en amont (pas de GIF) : l'animation se fait
en CSS, dans le navigateur, à partir du PNG statique — coût d'exécution
quasi nul, un seul petit fichier par arbre.

Usage :
    python3 detect_tree_origins.py dossier_in/ dossier_out/

    dossier_in/   PNG sources (fond transparent)
    dossier_out/  reçoit : les PNG rognés, manifest.json, snippets.html
"""

import argparse
import json
import os
import re
import sys
import unicodedata

import numpy as np
from PIL import Image

ALPHA_THRESHOLD = 10          # seuil pour considérer un pixel "non transparent"
BOTTOM_SLICE_PX = 14           # bande du bas utilisée pour centrer le pivot en X
MARGIN_PX = 3                  # marge de sécurité gardée autour du rognage


def slugify(filename: str) -> str:
    """Nom de fichier sans accents/espaces/majuscules — évite les soucis
    d'encodage une fois les images hébergées sur un serveur web."""
    base, ext = os.path.splitext(filename)
    normalized = unicodedata.normalize("NFKD", base).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return f"{slug}{ext.lower()}"


def analyze(img: Image.Image):
    """Retourne (bbox, origin_x_frac, origin_y_frac) sur l'image d'origine."""
    arr = np.array(img)
    alpha = arr[:, :, 3]
    mask = alpha > ALPHA_THRESHOLD
    ys, xs = np.where(mask)
    if len(ys) == 0:
        raise ValueError("Image entièrement transparente")

    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())

    # Centroïde pondéré par l'alpha sur la bande du bas -> centre du pied,
    # robuste même si le tronc n'est pas exactement au centre du feuillage.
    slice_top = max(y0, y1 - BOTTOM_SLICE_PX)
    band = alpha[slice_top:y1 + 1, x0:x1 + 1].astype(np.float64)
    xs_local = np.arange(x0, x1 + 1)
    weights = band.sum(axis=0)
    if weights.sum() > 0:
        cx = float((xs_local * weights).sum() / weights.sum())
    else:
        cx = (x0 + x1) / 2

    return (x0, y0, x1, y1), cx, float(y1)


def process(in_path, out_dir):
    img = Image.open(in_path).convert("RGBA")
    (x0, y0, x1, y1), cx, foot_y = analyze(img)

    w, h = img.size
    cx0 = max(0, x0 - MARGIN_PX)
    cy0 = max(0, y0 - MARGIN_PX)
    cx1 = min(w, x1 + MARGIN_PX + 1)
    cy1 = min(h, y1 + MARGIN_PX + 1)

    cropped = img.crop((cx0, cy0, cx1, cy1))
    crop_w, crop_h = cropped.size

    # Origine en % relatif à l'image ROGNÉE (celle réellement utilisée sur le site)
    origin_x_pct = round(100 * (cx - cx0) / crop_w, 1)
    origin_y_pct = round(100 * (foot_y - cy0) / crop_h, 1)

    name = slugify(os.path.basename(in_path))
    out_path = os.path.join(out_dir, name)
    cropped.save(out_path, optimize=True)

    saved_kb_before = os.path.getsize(in_path) / 1024
    saved_kb_after = os.path.getsize(out_path) / 1024

    return {
        "file": name,
        "width": crop_w,
        "height": crop_h,
        "originXPercent": origin_x_pct,
        "originYPercent": origin_y_pct,
        "sizeBeforeKB": round(saved_kb_before, 1),
        "sizeAfterKB": round(saved_kb_after, 1),
    }


def build_snippets_html(entries):
    """Fragment HTML prêt à coller : une balise <img> par arbre, pivot inclus,
    et un léger déphasage aléatoire pour que plusieurs arbres ne bougent pas
    en même temps (via une CSS custom property --sway-delay)."""
    import random
    random.seed(42)  # déphasages reproductibles d'un run à l'autre

    lines = [
        "<!-- Colle ce bloc où tu veux afficher les arbres. -->",
        '<link rel="stylesheet" href="tree-sway.css">',
        "",
    ]
    for e in entries:
        delay = round(random.uniform(-4.5, 0), 2)     # décale la phase du cycle
        drift = round(random.uniform(0.85, 1.15), 2)  # variation de vitesse (fréquence)
        amp = round(random.uniform(0.75, 1.3), 2)      # variation d'amplitude
        lines.append(
            f'<img src="{e["file"]}" class="tree-sway" '
            f'style="width:220px; transform-origin:{e["originXPercent"]}% {e["originYPercent"]}%; '
            f'--sway-delay:{delay}s; --sway-drift:{drift}; --sway-amp:{amp};" '
            f'alt="{os.path.splitext(e["file"])[0]}">'
        )
    lines.append("")
    lines.append('<script src="tree-sway.js" defer></script>')
    return "\n".join(lines)


TREE_SWAY_CSS = """/* tree-sway.css — animation "vent léger" pour décor PNG statique.
   Coût zéro à l'exécution : un seul PNG par arbre, pas de sprite sheet,
   pas de JS de rendu — juste une rotation CSS autour du pied.

   --sway-amp   multiplie l'amplitude de rotation (1 = angles de base)
   --sway-delay décale la phase du cycle (désynchronise les arbres entre eux)
   --sway-drift multiplie la durée du cycle (vitesses légèrement différentes) */

@keyframes tree-sway {
  0%, 100% { transform: rotate(calc(var(--sway-amp, 1) * -1.6deg)); }
  50%      { transform: rotate(calc(var(--sway-amp, 1) * 1.8deg)); }
}

.tree-sway {
  animation-name: tree-sway;
  animation-duration: calc(4.5s * var(--sway-drift, 1));
  animation-delay: var(--sway-delay, 0s);
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  will-change: transform;
}

/* Respecte les préférences d'accessibilité : coupe l'animation si demandé. */
@media (prefers-reduced-motion: reduce) {
  .tree-sway { animation: none; }
}
"""

TREE_SWAY_JS = """// tree-sway.js — optionnel.
// N'est utile QUE si tu ajoutes des arbres dynamiquement en JS (sans passer
// par le fragment HTML généré) : il assigne un déphasage, une amplitude et
// une vitesse aléatoires à chaque .tree-sway qui n'en a pas déjà, pour
// éviter un balancement identique/synchronisé entre tous les arbres.
// Si tu utilises snippets.html tel quel, ce fichier n'est pas nécessaire.
(function () {
  document.querySelectorAll('.tree-sway').forEach(function (el) {
    if (!el.style.getPropertyValue('--sway-delay')) {
      el.style.setProperty('--sway-delay', (Math.random() * -4.5).toFixed(2) + 's');
    }
    if (!el.style.getPropertyValue('--sway-drift')) {
      el.style.setProperty('--sway-drift', (0.85 + Math.random() * 0.3).toFixed(2));
    }
    if (!el.style.getPropertyValue('--sway-amp')) {
      el.style.setProperty('--sway-amp', (0.75 + Math.random() * 0.55).toFixed(2));
    }
  });
})();
"""


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("in_dir", help="Dossier des PNG sources")
    p.add_argument("out_dir", help="Dossier de sortie")
    args = p.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)

    pngs = sorted(
        f for f in os.listdir(args.in_dir) if f.lower().endswith(".png")
    )
    if not pngs:
        print(f"Aucun .png dans {args.in_dir}", file=sys.stderr)
        sys.exit(1)

    entries = []
    for name in pngs:
        e = process(os.path.join(args.in_dir, name), args.out_dir)
        entries.append(e)
        print(
            f"{e['file']:<20} pivot {e['originXPercent']}% / {e['originYPercent']}%   "
            f"{e['sizeBeforeKB']}KB -> {e['sizeAfterKB']}KB"
        )

    with open(os.path.join(args.out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    with open(os.path.join(args.out_dir, "tree-sway.css"), "w", encoding="utf-8") as f:
        f.write(TREE_SWAY_CSS)

    with open(os.path.join(args.out_dir, "tree-sway.js"), "w", encoding="utf-8") as f:
        f.write(TREE_SWAY_JS)

    with open(os.path.join(args.out_dir, "snippets.html"), "w", encoding="utf-8") as f:
        f.write(build_snippets_html(entries))

    print(f"\n{len(entries)} arbre(s) traité(s) -> {args.out_dir}/")
    print("Fichiers générés : manifest.json, tree-sway.css, tree-sway.js, snippets.html")


if __name__ == "__main__":
    main()
