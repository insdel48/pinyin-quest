"""Place the supplied concept crops next to the corresponding Blender renders."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from check import ROOT


def compare(references, render_dir, output, round_number, selection=None, prefix=""):
    for asset, file, bounds in (
        ("hero", "A-hero.png", (0.02, 0.0, .98, 1.0)),
        ("suanni", "A-battle.png", (.515, .018, .977, .665)),
    ):
        if selection and selection!=asset:
            continue
        with Image.open(references / file) as raw:
            w, h = raw.size
            ref = raw.crop(tuple(round(v * d) for v,d in zip(bounds,(w,h,w,h))))
        with Image.open(render_dir / f"{asset}-blender-concept.png") as raw:
            if asset == "hero" and raw.mode == "RGBA":
                render = Image.new("RGB",raw.size,"#a9a6ab")
                render.paste(raw,mask=raw.getchannel("A"))
            else:
                render = raw.convert("RGB")
        width,height = (520,780) if asset == "hero" else (720,650)
        comparison=Image.new("RGB",(width*2+36,height+60),"#202326")
        draw=ImageDraw.Draw(comparison)
        font=ImageFont.load_default(size=17)
        for i,(label,photo) in enumerate((("CONCEPT",ref),("BLENDER",render))):
            x=12+i*(width+12)
            draw.text((x,12),f"{asset.upper()}  /  {label}  /  PASS {round_number}",font=font,fill="#e4e3dd")
            image=ImageOps.contain(photo.convert("RGB"),(width,height),Image.Resampling.LANCZOS)
            comparison.paste(image,(x+(width-image.width)//2,42+(height-image.height)//2))
        comparison.save(output/f"compare-{asset}-{prefix}r{round_number:02d}.png",optimize=True)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("round",type=int)
    parser.add_argument("references",type=Path)
    parser.add_argument("renders",type=Path)
    parser.add_argument("--asset",choices=("hero","suanni"))
    parser.add_argument("--prefix",default="")
    args=parser.parse_args()
    result=ROOT/"art-work"/"real"
    result.mkdir(parents=True,exist_ok=True)
    compare(args.references,args.renders,result,args.round,args.asset,args.prefix)
