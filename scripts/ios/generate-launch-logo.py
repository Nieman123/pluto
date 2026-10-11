"""Package the existing transparent Pluto logo for the iOS launch screen.

Run from any directory with Pillow installed. AppIcon artwork is separate.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'assets/experience/pluto-logo-small.png'
image = Image.open(source).convert('RGBA')
width = 160
height = round(width * image.height / image.width)
target = ROOT / 'ios/Runner/Assets.xcassets/LaunchImage.imageset'
for scale, suffix in [(1, ''), (2, '@2x'), (3, '@3x')]:
    image.resize((width * scale, height * scale), Image.Resampling.LANCZOS).save(
        target / ('LaunchImage' + suffix + '.png'), optimize=True)
print('Updated transparent iOS launch logo at 1x, 2x and 3x')
