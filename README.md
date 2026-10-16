# ちいかわ 人魚の島ぐらし — Mermaid Island Life

A small, comfy, mobile-first fan game set on the island from
*Chiikawa: The Secret of the Mermaid Island* (2026). Personal and
non-commercial. Characters and world belong to Nagano.

- **Design:** [PLAN.md](PLAN.md)
- **Visual reference:** [STYLE_GUIDE.md](STYLE_GUIDE.md)
- **Progress:** [CHANGELOG.md](CHANGELOG.md)

## Requirements

- Node.js 20 or newer.
- Blender 5.2, only to rebuild the character models.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5173 on this PC.

## Play on your phone

1. Keep `npm run dev` running.
2. Connect the phone to the same Wi-Fi as the PC.
3. Open `http://<PC address>:5173` in the phone's browser. The PC's Wi-Fi
   address was 192.168.100.4 when this was written; `ipconfig` shows the
   current one.

If the page never loads, Windows Firewall is probably blocking it. Windows
treats this Wi-Fi as a Public network, which blocks incoming connections.
Either allow Node.js when Windows asks, or set the Wi-Fi network to Private
in Windows settings. Work laptops may block this entirely; the published
GitHub Pages site avoids the problem.

To install it like an app, open the page and use **Add to Home Screen**
(Safari share menu on iPhone, Chrome menu on Android).

## Controls

| Phone | Desktop | Action |
|---|---|---|
| Drag on the left half | WASD or arrow keys (Shift to walk) | Move; push the stick to its edge to run |
| Drag on the right half | Drag with the mouse | Turn the camera |
| Pinch on the right half | Mouse wheel | Zoom |
| Jump button | Space | Jump |
| Test (テスト) button | Test (テスト) button | Test panel: actions, expressions, lineup, language |

## Rebuild the models

Every model comes out of Blender, driven by a Python script:

- `art/blender/import_characters.py` converts the downloaded rigged models of
  Chiikawa, Hachiware, Usagi and Momonga (from `Chiikawa Models-*/`) into
  `public/models/`. It also packs each face's artwork into
  `public/models/faces/`, writes the cap and inner-ear masks to
  `public/models/masks/`, and fits each character's island outfit. The
  islanders are converted from Chiikawa's model as well: grey, with a grass
  skirt of their own, and leaves (Hitoha and Futaba) or round ears and a
  grey flower crown (the generic islanders in the crowd).
- `art/blender/build_characters.py` is the parts kit for characters that have
  no downloaded model. None is in the game yet, so it builds nothing for
  now.
- `art/blender/build_props.py` builds the palm, log, starfish and onigiri
  into `public/models/props/`.
- `art/blender/outfits.py` holds the island outfit (flower crown and grass
  skirt) that both character scripts use.

The faces are painted by hand. Each character's folder in
`art/faces/<id>/` holds its face as full-size layers, and an
`expressions.txt` that says which layers make up each expression. Repaint or
add layers, change the combinations, and rebuild. See
[art/faces/README.md](art/faces/README.md). Rebuilding never changes those
files.

The island outfit is never part of a character model. Each wearer gets its
own `public/models/outfits/island_<id>.glb`, fitted to its head and body,
and the game dresses the character at runtime. The **Island outfit** chip in
the Test panel takes the outfits off and puts them back on.

Run a script from the project folder:

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --disable-autoexec --python art/blender/import_characters.py
```

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python art/blender/build_props.py
```

`--disable-autoexec` matters for the import: the downloaded .blend files
come from an unknown source, so they are opened with their scripts turned
off.

Each run writes preview renders to `art/previews/` and saves a .blend file in
`art/blender/` (`cast.blend`, `props.blend`) that you can
open in Blender to look at the models. Those files are regenerated on every
build, so change the scripts, not the .blend.

Add `-- --only chiikawa` (or `-- --only palm`) to rebuild one model, or
`-- --no-previews` to skip the renders. The import also takes
`-- --source <folder>` if the downloaded models live somewhere else.

## Other commands

```bash
npm run build
```

Type-checks and builds the installable site into `dist/`.

```bash
npm run preview
```

Serves the built site at http://localhost:4173, including offline support.

```bash
npm run icons
```

Redraws the app icons in `public/`.

## Reference material and credits

`reference images/` and `images that can be use/` hold film artwork for
reference only. `Chiikawa Models-*/` holds the downloaded character models.
All three are excluded from git and are never published.

The converted models in `public/models/` (the cast, their faces and masks)
and the starting face layers in `art/faces/` are made from those downloaded
models, which came without an author or a licence. Before the repository goes public, find the models' author and
credit them here, or keep the repository private.
