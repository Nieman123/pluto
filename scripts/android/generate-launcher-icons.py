"""Package the approved Pluto artwork as Android launcher resources.

Run from the repo root with Pillow installed. This does not redraw the artwork.
"""
from pathlib import Path
from PIL import Image

source = Path('assets/branding/pluto-app-icon.png')
image = Image.open(source).convert('RGB')
if image.width != image.height:
    raise ValueError('Launcher artwork must be square')
resources = Path('android/app/src/main/res')
for density, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    target = resources / ('mipmap-' + density) / 'ic_launcher.png'
    image.resize((size, size), Image.Resampling.LANCZOS).save(target, optimize=True)
target = resources / 'drawable-nodpi' / 'pluto_launcher_art.png'
target.parent.mkdir(parents=True, exist_ok=True)
image.resize((512, 512), Image.Resampling.LANCZOS).save(target, optimize=True)
print('Updated 5 launcher densities and adaptive artwork from ' + str(source))
