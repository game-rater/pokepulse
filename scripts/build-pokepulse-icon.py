"""Render the existing pulse motif as a Windows multi-resolution app icon."""
from pathlib import Path
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent.parent
assets=root/'run-bun/assets';assets.mkdir(exist_ok=True)
scale=16
image=Image.new('RGBA',(64*scale,64*scale))
d=ImageDraw.Draw(image)
d.rounded_rectangle((2*scale,2*scale,62*scale,62*scale),radius=14*scale,fill='#17231e')
points=[(10,33),(21,33),(26,22),(33,46),(40,15),(45,33),(54,33)]
d.line([(x*scale,y*scale) for x,y in points],fill='#66d98e',width=4*scale,joint='curve')
for x,y in [points[0],points[-1]]:
 d.ellipse(((x-2)*scale,(y-2)*scale,(x+2)*scale,(y+2)*scale),fill='#66d98e')
image=image.resize((256,256),Image.Resampling.LANCZOS)
image.save(assets/'pokepulse-icon.png')
image.save(assets/'pokepulse.ico',sizes=[(n,n) for n in (16,24,32,48,64,128,256)])
