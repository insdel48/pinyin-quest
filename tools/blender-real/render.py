"""Render all four camera views from an asset's .blend source."""
from pathlib import Path
import sys

import bpy


def render(directory, labels):
    scene = bpy.context.scene
    stem = Path(bpy.data.filepath).stem
    directory.mkdir(parents=True, exist_ok=True)
    default_size=(scene.render.resolution_x,scene.render.resolution_y)
    for label in labels:
        scene.render.resolution_x,scene.render.resolution_y=default_size
        scene.camera = scene.objects[label]
        if stem == "hero":
            scene.render.film_transparent = label == "concept"
            scene.objects["Studio Ground"].is_shadow_catcher = label == "concept"
        if label == "concept":
            scene.render.resolution_x, scene.render.resolution_y = ((560,840) if stem=="hero" else (840,735))
        scene.render.filepath = str(directory / f"{stem}-blender-{label}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    default = Path(__file__).resolve().parents[2] / "art-work" / "real"
    args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    render(Path(args[0]).resolve() if args else default,
           args[1:] or ("front", "three-quarter", "side", "head"))
