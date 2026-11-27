"""Fetch the CC0 MakeHuman inputs used by the hero into the workspace cache."""
from hashlib import sha256
from pathlib import Path
import shutil
from urllib.request import urlopen
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / ".blender-work" / "round3" / "mh"
URL = "https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip"
CHECKSUM = "b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107"
SKIN = "skins/young_asian_male/young_lightskinned_male_diffuse3.png"
EYES = "eyes/high-poly/high-poly.mhclo"
BROWN = "eyes/materials/brown_eye.png"
TEETH = "teeth/teeth_base/teeth_base.mhclo"


def fetch():
    ASSETS.mkdir(parents=True,exist_ok=True)
    archive=ASSETS/"system.zip"
    if not archive.is_file():
        with urlopen(URL,timeout=90) as response, archive.open("wb") as output:
            shutil.copyfileobj(response,output)
    with archive.open("rb") as stream:
        checksum=sha256()
        while block:=stream.read(1024*1024):
            checksum.update(block)
    if checksum.hexdigest()!=CHECKSUM:
        raise RuntimeError(f"Unexpected MakeHuman archive checksum at {archive}")
    files=(SKIN,EYES,BROWN,TEETH,"eyes/high-poly/high-poly.obj","eyes/materials/brown.mhmat",
           "teeth/teeth_base/teeth_base.obj","teeth/teeth_base/teeth.mhmat","teeth/teeth_base/teeth.png",
           "skins/young_asian_male/young_asian_male.mhmat")
    with ZipFile(archive) as source:
        for name in files:
            source.extract(name,ASSETS)


if __name__=="__main__":
    fetch()
