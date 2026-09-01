"""Convert Vacation Adventure PNG artwork to display-sized WebP files.

Requires Python 3 and Pillow with WebP support. Run from the repository root:

    python scripts/optimize-assets.py            # keep PNG inputs
    python scripts/optimize-assets.py --replace  # remove each PNG after verify

The operation is deterministic and safe to rerun. Transparent padding is kept
for sprites and props because the game uses the existing canvas bounds for
alignment. Destination cards are center-cropped to the same 5:2 aspect ratio
already produced by CSS `object-fit: cover` at 460x184.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, features


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
RESAMPLE = Image.Resampling.LANCZOS


def contain(image: Image.Image, maximum: int) -> Image.Image:
    """Resize without cropping, retaining transparent padding and aspect."""
    if max(image.size) <= maximum:
        return image
    scale = maximum / max(image.size)
    size = tuple(max(1, round(value * scale)) for value in image.size)
    return image.resize(size, RESAMPLE)


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Center crop exactly as the destination-card CSS currently displays."""
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), RESAMPLE)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def prepare(path: Path, image: Image.Image) -> tuple[Image.Image, int]:
    rel = path.relative_to(ASSETS).as_posix()

    if rel.startswith("backgrounds/card_"):
        return cover(image, (920, 368)), 88

    if rel.startswith("backgrounds/"):
        # Existing scene artwork is at or below 1448px wide, so retain its
        # composition and source dimensions; WebP supplies nearly all savings.
        return contain(image, 1920), 88

    if rel.startswith("characters/"):
        # Full-body sprites reach roughly 500px high in close shots. Keeping
        # their current canvas prevents actor baselines and portraits shifting.
        return contain(image, 1200), 90

    name = path.name
    if name.startswith("volleyball_finale_"):
        # The character panels are near full-screen. The ball itself only
        # reaches 265px and needs far less source resolution.
        maximum = 768 if name == "volleyball_finale_ball.png" else 1536
        return contain(image, maximum), 90

    if name.startswith("kebab_reaction_"):
        return contain(image, 1200), 88

    if name.startswith("cloud_"):
        return contain(image, 384), 88

    if name in {"soccerball.png", "volleyball.png"}:
        return contain(image, 320), 90

    if name in {"crepe.png", "kebab.png", "icecream.png"}:
        # Food reward illustrations grow to about half the 600px stage height.
        return contain(image, 768), 92

    if name.startswith("souvenir_"):
        return contain(image, 512), 92

    if name in {"sand_pyramid.png", "flag_small.png", "plane.png"}:
        return contain(image, 768 if name == "plane.png" else 512), 90

    return contain(image, 768), 90


def convert(path: Path, replace: bool) -> tuple[int, int, tuple[int, int], tuple[int, int]]:
    output = path.with_suffix(".webp")
    original_size = path.stat().st_size
    with Image.open(path) as source:
        source.load()
        original_dimensions = source.size
        image, quality = prepare(path, source)
        converted_dimensions = image.size
        save_options = {
            "format": "WEBP",
            "quality": quality,
            "method": 6,
            "exact": True,
        }
        if "icc_profile" in source.info:
            save_options["icc_profile"] = source.info["icc_profile"]
        image.save(output, **save_options)

    # Verify the result independently before considering source removal.
    with Image.open(output) as check:
        check.load()
        if check.size != converted_dimensions:
            output.unlink(missing_ok=True)
            raise RuntimeError(f"WebP verification failed for {path}")

    converted_size = output.stat().st_size
    if replace:
        path.unlink()
    return original_size, converted_size, original_dimensions, converted_dimensions


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--replace", action="store_true", help="remove verified PNG inputs")
    args = parser.parse_args()

    if not features.check("webp"):
        raise SystemExit("This Pillow installation does not include WebP support.")

    paths = sorted(ASSETS.rglob("*.png"))
    if not paths:
        print("No PNG inputs found; assets are already optimized.")
        return

    before = after = 0
    for path in paths:
        old_bytes, new_bytes, old_dim, new_dim = convert(path, args.replace)
        before += old_bytes
        after += new_bytes
        print(
            f"{path.relative_to(ROOT).as_posix()}: "
            f"{old_dim[0]}x{old_dim[1]} -> {new_dim[0]}x{new_dim[1]}, "
            f"{old_bytes / 1024:.0f} KiB -> {new_bytes / 1024:.0f} KiB"
        )

    reduction = (1 - after / before) * 100 if before else 0
    print(f"Converted {len(paths)} files: {before / 1024 / 1024:.2f} MiB -> "
          f"{after / 1024 / 1024:.2f} MiB ({reduction:.1f}% smaller)")


if __name__ == "__main__":
    main()
