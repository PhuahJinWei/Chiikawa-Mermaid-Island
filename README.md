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
(Safari share menu on iPhone, Chrome menu on Android). The installed app
turns with the phone. An app installed before 2026-10-23 was held upright;
Chrome updates it by itself within a day or so, or reinstall it.

## Controls

You see the island out of your own eyes, as a nameless islander.

| Phone | Desktop | Action |
|---|---|---|
| Drag on the left half | WASD or arrow keys (they run; Shift sprints) | Move the way you look; push the stick to its edge to run, and hold it there a moment to sprint (the ring goes pink) |
| Drag on the right half | Drag with the mouse | Look around |
| Pinch on the right half | Mouse wheel | Narrow the view toward the film's lens, and back |
| Jump button | Space | Jump; hold it to jump higher (whoever is near may hop or wave back) |
| Action button (ひろう, かりる, おく, もどす, あげる, はなす, すわる, ねる, たつ, みせばん, わたす, たべきる, のみきる) | E or Enter | What you look at: pick it up (borrow it, if it is someone's), put down what you hold, put a torch's brand back on its pole, give it, talk, sit, sleep through the night in your own bed, get up; behind a stall's counter no one keeps today, keep it, and hand its goods to whoever lines up. What you have bitten into cannot be put down or given: たべきる / のみきる finishes it |
| Text box (what is said to you), or the action button (つぎ) | E or Enter | The rest of the line at once, or the next line; hold to skip through them. A line goes on its own a moment after it is all out |
| A choice in the text box | 1 to 9, 0 | Answer what you are asked. Talking with anyone, だれかさがしてる asks where one of the cast is: they tell you, and a marker points you to them a while |
| Use button (たべる, のむ, ひく, よむ, かまえる) | F | Eat, drink, play or read what you hold. A book comes up before your eyes and opens; press again (とじる) or walk off to shut it. A さすまた is held up ready before you in both paws, pointing ahead; you may walk so, and press again (おろす) to lower it |
| Held sideways, or on a computer: the bar along the bottom | 1 to 6 | Your paw (its paw mark on its corner) and your pouch of six slots, each a stack of one kind (up to 99, its count on its corner). Tap a slot: what is in your paw goes into the pouch (onto its own stack if there is one) and one thing of the slot comes into your paw, its name over the bar a moment. Tap your paw's slot to put what you hold away. Drag a slot onto another to move its things there or swap the two; onto your paw, one comes into it. Hold a slot (or right-click it) to open the bag with it picked. Something you have bitten into goes into no pouch: put away, it is gone, eaten up |
| Bag (ふくろ) button | Tab; Esc closes it | The bag, over the island: your paw's slot big and the six beside it. Tap a slot to see under them what it is: its name and how many, what it is for, a line about it, and whether it is borrowed, goes back to its place each morning or is bitten into. もつ (or tapping the picked slot again) takes one into your paw; for your paw's slot, しまう puts it away. Dragging works as on the bar. On a phone held upright the bag is the pouch's only place |
| きもち button (top right), then one of its nine | R, then 1 to 9 | Do something yourself: wave, bow, cheer, hop, dance, chat, look about, start, cry. Whoever is near may answer it |
| Camera (カメラ) button | | Take a photo |
| Your newest photo, under the camera button | | Your photos (しゃしん): open one to save, share or throw it away |
| Speaker button (top right, by きもち) | | The sound on or off (kept for your next visit) |
| Test (テスト) button | Test (テスト) button | Test panel: actions, expressions, lineup, whose eyes, the follow camera from behind (三人称カメラ) |

The buttons wear the look of the user's other Chiikawa game, Chiikawa-Hidamari: cream faces in a
brown ring with a white rim, the pink accent on what is on offer, paper cards for the bag, the album
and the text box, and the round Zen Maru Gothic type (`src/styles.css`). The type comes from Google
Fonts in slices of the letters used; the service worker keeps them, so after one visit online it shows
offline too (until then, the device's own type).

What the action button would act on is whatever is nearest the middle of your view within reach,
and it stays so until you clearly look at something else. A small cream ▽ floats over it, bobbing,
and glides to the next thing you look at; holding something, a see-through ghost of it shows where
おく would put it, as it would lie, the ▽ over that.

The island keeps itself as you left it (the hour and the day, where you stood, where everyone who
lives here stood, sat or slept, what you and they hold and keep, how fond each is of you, what lies
where) in the browser; open the game with `?fresh` to start anew, with the welcome on the beach.

## Things lying about

Everyone on the island, you and the islanders alike, can take up what lies about, keep it, give it,
eat it, play it or put it down. Everyone's paws are the same (`src/life/Hands.ts`): one thing in the
right paw and a pouch of six slots, each a stack of up to 99 things of one kind, each thing keeping
whose it is. A stall hands over nothing to someone with no room for it: its keeper says so. What lies
about comes from `public/data/things.json`:

- `kept`: things with a place of their own (the stage's ukulele, the torch by your door, the two torches
  lying in the forbidden cave's mouth, the one book, 伝説の生物図鑑, on the floor before Hitoha and Futaba's
  bookshelf, the spring weapon with a face beside it, and Chiikawa's pink さすまた and Hachiware's blue one on the
  trio's guest house floor under the hammock), back there each morning
  from wherever they are, your pouch and the islanders' too (the island tidies up overnight; what is
  yours to keep is what has no place of its own): an `id` of its own, the `item`, where (`x`, `z`),
  `y` if it lies on something above the ground's top (a deck, a porch) or `height` for just how high
  it lies (a shelf, the cave's floor), its turn (`yaw`, radians), and `owner` if it is someone's (the
  さすまた), so anyone else borrows it (かりる) and gives it back. A place added here shows its thing as
  soon as a saved island loads.
- `stands`: props that hold a thing each at their flame: the village's torches, each its brand
  (`prop`, `item`). Take one off its stake and the stake is dark until it is back (もどす, or the morning).
- `daily`: what each morning lays about an area, gone the next morning if no one took it up: how many
  of each thing (`items`), within a `box` (`[x from, x to, z from, z to]`), outside any of the `avoid`
  boxes, only on the sand's band above the water if `shore` gives one (`[from, to]` metres; else
  anywhere one can stand on dry ground), at least `apart` metres from one another.

Given something that is not food, an islander keeps it in their paw till they need the paw for
something else, and only then puts it in their pouch; a torch goes into the pouch after the thanks.
At bedtime an islander puts every keepsake they still carry down on their hut's floor, so nothing
sleeps in a pouch where no one can see it. A torch burns whenever it is held, day and night, its light
reaching what is round it after dark and in the forbidden cave, lighting your way there: bring your own, or take one of the two lying in its mouth.

The book is read as the film's Hachiware reads it: held open before the face, both paws under it.
Islanders read it too, when they have it, and 古本屋 most of all. Its spread's picture is loaded only
while someone reads it.

Nothing anyone holds goes into them (`src/characters/Holding.ts`): a thing is held out at their side,
by its own side, and each frame it is tipped out and pushed a little further out only as far as it must
be to stay 1.5 cm clear of their head, body, crown, ears, cape and skirt (spread on the ground too, as
they sit), whatever they are doing. Waving and talking use the free paw when the right one is full. A
new thing needs nothing for this: its shape is read from its model.

Nothing else needs changing: the islanders see whatever lies about each time they choose what to do,
and choose by what a thing is for (eaten, drunk, played or kept), never by its name. A new kind of
thing is built in `art/blender/build_items.py` (its icon comes with it) and named in
`src/locales/ja.json` as `item.<id>`, with a line about it for its card in the pouch as `about.<id>`. With no entry in `src/life/Items.ts` it is a keepsake that lies
on its side; give it one there to make it something eaten, drunk or played, or held flat. Its icon
in the pouch is a render of its model until you draw one: `art/icons/icon_thing_<id>.png`, copied
in by `art/blender/build_icons.py` (see [art/icons/README.md](art/icons/README.md)).

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
- `art/blender/build_items.py` builds the things one carries into
  `public/models/props/item_<id>.glb`, with their icons for the pouch.
  `art/blender/books.py` shapes the book, shut and open.
- `art/blender/build_books.py` draws the book's two templates into
  `art/books/_guides/`, its cover and its spread, and copies your paintings
  of them into the game. See [art/books/README.md](art/books/README.md).
- `art/blender/build_icons.py` copies the cast's faces you drew in
  `art/icons/` into `public/ui/faces/`, for the text box, the choices and
  the marker, and the things' icons you drew there into `public/ui/things/`,
  for the pouch. See [art/icons/README.md](art/icons/README.md).

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

The book's cover and its pages are painted by hand too: a template for
each is in `art/books/_guides/`, and your paintings go in `art/books/`. See
[art/books/README.md](art/books/README.md).

The faces the screen shows (by the speaker's name in the text box, as the
choices of whom to ask after, and on the marker) are drawn by hand too: one
square transparent PNG for each of the cast in `art/icons/`. Anyone without
one shows their name. So are the things' icons in the pouch, as
`art/icons/icon_thing_<id>.png`; a thing without one shows a render of its
model. See [art/icons/README.md](art/icons/README.md).

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

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python art/blender/build_books.py
```

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --disable-autoexec --python art/blender/build_icons.py
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
