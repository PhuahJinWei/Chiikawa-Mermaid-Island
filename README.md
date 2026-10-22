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

Open http://localhost:5280 on this PC.

## Play on your phone

1. Keep `npm run dev` running.
2. Connect the phone to the same Wi-Fi as the PC.
3. Open `http://<PC address>:5280` in the phone's browser. The PC's Wi-Fi
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

You see the island out of your own eyes, as a nameless islander.

| Phone | Desktop | Action |
|---|---|---|
| Drag on the left half | WASD or arrow keys (Shift to walk) | Move the way you look; push the stick to its edge to run |
| Drag on the right half | Drag with the mouse | Look around |
| Pinch on the right half | Mouse wheel | Narrow the view toward the film's lens, and back |
| Jump button | Space | Jump (whoever is near may hop or wave back) |
| Action button (ひろう, かりる, おく, あげる, はなす, すわる, ねる, たつ, みせばん, わたす, たべきる, のみきる) | E or Enter | What you look at: pick it up (borrow it, if it is someone's), put down what you hold, give it, talk, sit, sleep through the night in your own bed, get up; behind a stall's counter no one keeps today, keep it, and hand its goods to whoever lines up. What you have bitten into cannot be put down or given: たべきる / のみきる finishes it |
| Use button (たべる, のむ, ひく) | F | Eat, drink or play what you hold |
| Pouch (ふくろ) button, then a slot | Tab, or 1 to 6 | Your pouch of six slots, each a stack of one kind (up to 99, its count on its corner): what is in your paw goes into the pouch (onto its own stack if there is one) and one thing of the slot comes into your paw. Something you have bitten into goes into no pouch: put away, it is gone, eaten up |
| きもち button (top right), then one of its nine | R, then 1 to 9 | Do something yourself: wave, bow, cheer, hop, dance, chat, look about, start, cry. Whoever is near may answer it |
| Camera (カメラ) button | | Take a photo |
| Notebook (ノート) button | | Where everyone is and what they are doing (みんな), your photos (しゃしん), the sound on or off |
| Test (テスト) button | Test (テスト) button | Test panel: actions, expressions, lineup, whose eyes, the follow camera from behind (三人称カメラ) |

What the action button would act on is whatever is nearest the middle of your view within reach,
and it stays so until you clearly look at something else. A small cream ▽ floats over it, bobbing,
and glides to the next thing you look at; holding something, a paper sketch of it lies where おく
would put it, as it would lie, the ▽ over that.

The island keeps itself as you left it (the hour and the day, where you stood, where everyone who
lives here stood, sat or slept, what you and they hold and keep, how fond each is of you, what lies
where) in the browser; open the game with `?fresh` to start anew, with the welcome on the beach.

## Things lying about

Everyone on the island, you and the islanders alike, can take up what lies about, keep it, give it,
eat it, play it or put it down. Everyone's paws are the same (`src/life/Hands.ts`): one thing in the
right paw and a pouch of six slots, each a stack of up to 99 things of one kind, each thing keeping
whose it is. A stall hands over nothing to someone with no room for it: its keeper says so. What lies
about comes from `public/data/things.json`:

- `kept`: things with a place of their own, back there each morning from wherever they lie (or made
  anew if no one has one): an `id` of its own, the `item`, where (`x`, `z`), `y` if it lies on
  something above the ground's top (a deck, a porch), and its turn (`yaw`, radians).
- `daily`: what each morning lays about an area, gone the next morning if no one took it up: how many
  of each thing (`items`), within a `box` (`[x from, x to, z from, z to]`), outside any of the `avoid`
  boxes, only on the sand's band above the water if `shore` gives one (`[from, to]` metres; else
  anywhere one can stand on dry ground), at least `apart` metres from one another.

Nothing else needs changing: the islanders see whatever lies about each time they choose what to do,
and choose by what a thing is for (eaten, drunk, played or kept), never by its name. A new kind of
thing is built in `art/blender/build_items.py` (its icon comes with it) and named in
`src/locales/ja.json` as `item.<id>`. With no entry in `src/life/Items.ts` it is a keepsake that lies
on its side; give it one there to make it something eaten, drunk or played, or held flat.

## Rebuild the models

Every model comes out of Blender, driven by a Python script:

- `art/blender/import_characters.py` converts the downloaded rigged models of
  Chiikawa, Hachiware, Usagi and Momonga (from `Chiikawa Models-*/`) into
  `public/models/`. It also packs each face's artwork into
  `public/models/faces/`, writes the cap and inner-ear masks to
  `public/models/masks/`, and fits each character's island outfit. The
  islanders are converted from the cast's models as well: grey, with a
  grass skirt of their own. Hitoha and Futaba, one of each, are the only
  ones with leaves. The generic islanders in the crowd have round, cat or
  bunny ears (from Chiikawa's, Hachiware's and Usagi's models) and a grey
  flower crown, and are light copies (`islander_*_crowd`), simplified for
  being seen from a distance.
- `art/blender/build_characters.py` is the parts kit for characters that have
  no downloaded model. None is in the game yet, so it builds nothing for
  now.
- `art/blender/build_island.py` builds the island into
  `public/models/island/`: the ground's mesh, its painted colour map and the
  height grid the game walks on, and the rock landmarks, the jungle
  waterfall with its pool and the sea cliffs
  (`art/blender/karst.py` shapes the rocks). `art/previews/island_map.png`
  shows the colour map with each rock's foot outlined, for checking the
  layout.
  It also grows the jungle, the fields' crops and the flowers round the
  village (`art/blender/plants.py` shapes the plants), keeping them clear of
  the props placed in `public/data/layout.json`.
- `art/blender/build_props.py` builds the palm, log, starfish, the No Entry
  sign and the butterfly into `public/models/props/`.
- `art/blender/build_village.py` builds the village and the festival into
  `public/models/props/`: the huts you can walk into, the stage, torches,
  round thatched huts, the festival's stalls, arch, banners, bunting and
  lantern poles, the pier, the duck ferry, baskets and potted plants.
  `art/blender/houses.py` holds the houses, the stage, the arch and the
  banners.
- `art/blender/build_signs.py` draws a template for every signboard into
  `art/signs/_guides/`, and copies the hand-lettered signs painted over
  them into `public/signs/`, at the game's own sharpness.

Where everything stands is in `public/data/layout.json`: each prop's kind,
place, turn and painted words (a key into `ja.json`), and the island's named
places. Edit it and reload; rebuild the island too if props moved, so the
jungle keeps clear of them.
- `art/blender/outfits.py` holds the island outfit (flower crown and grass
  skirt) that both character scripts use.

The faces are painted by hand. Each character's folder in
`art/faces/<id>/` holds its face as full-size layers, and an
`expressions.txt` that says which layers make up each expression. Repaint or
add layers, change the combinations, and rebuild. See
[art/faces/README.md](art/faces/README.md). Rebuilding never changes those
files.

The signboards can be hand-lettered too: each stall's header boards (one
painting shows across its front and down both its sides), the arch's board
and banner, and the street's banners. Each has a template in
`art/signs/_guides/`. A transparent PNG painted over a template and saved in
`art/signs/` takes the place of that sign's typed words. See
[art/signs/README.md](art/signs/README.md). Rebuilding never changes those
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
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python art/blender/build_island.py
```

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python art/blender/build_props.py
```

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python art/blender/build_village.py
```

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --disable-autoexec --python art/blender/build_signs.py
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
