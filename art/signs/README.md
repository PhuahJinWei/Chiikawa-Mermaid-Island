# Painting the signboards

The game types each signboard's words in the phone's rounded font. Any sign
can be hand-lettered instead, the way the film's are. A sign with a painting
shows the painting, and the rest keep their typed words.

## The files

- **`_guides/`** holds a template for every sign. Each template is a canvas the
  size of the sign's lettering area, in the board's colour. It also shows the
  game's typed words, faint, and a dashed margin. It is named after the sign,
  such as `stall.takoyaki たこ焼き.png`.
- **Your paintings** go here in `art/signs/`, one transparent PNG per sign,
  named like its template: `stall.takoyaki たこ焼き.png`. Only the part before
  the first space counts, so `stall.takoyaki.png` works too.

## The signs

| Sign | Canvas (pixels) |
|---|---|
| The 38 stalls' header boards (`stall.…`) | 1440 × 496 |
| The arch's board, `arch.welcome` 島へようこそ!! | 6256 × 880 |
| The arch's banner, `arch.banner` ウェルカム・トゥ・シマ | 4712 × 760 |
| The street's banners, `banner.welcome` いらっしゃいませ!! and `banner.enjoy` たのしんでね | 4856 × 600 |

`_guides/` lists every stall with its words and board colour. In the game the
arch's board and all three banners curve. Paint them flat, and the game bends
them.

## How to paint

1. Open a template from `_guides/` in any paint program with layers: Krita
   (free), Clip Studio Paint, Procreate, ibisPaint or Photoshop. Add a new
   layer above it.
2. Letter on the new layer. Pictures are welcome, as on the film's signs.
   For the background you can do either of these:
   - **Leave it transparent:** the board's own colour shows through, lit
     and shaded with the rest of the stall.
   - **Paint the whole board:** use your own colour, solid right to the
     canvas edges. On a stall, the board takes that colour too, the
     middling colour of your painting's edge, so the board round your
     sign matches it. This works for stalls only; the arch and banners
     keep their own colour round a painting.
3. Hide the template. Export your layer as a PNG with transparency, at the
   whole canvas size, with the template's name. Save it into `art/signs/`
   itself, the folder this README is in, not into `_guides/`. Don't trim or
   crop it on export, because the edges of the canvas are the edges of the
   lettering area.
4. Rebuild the signs from the project folder, then reload the game:

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --disable-autoexec --python art/blender/build_signs.py
```

It takes a few seconds and lists which signs are painted.

## The film's lettering

From its festival frames:

- **Stall boards:** chunky, rounded hand-lettering that fills the board, a
  little uneven, as if painted with a brush. On coloured boards the letters
  are white or pale with a dark brown outline (ケバブ, 大判焼き); on white
  boards they are coloured (冷しパイン in blue).
- **Pictures:** there is often a small picture of what the stall sells beside
  the words: a kebab, an octopus, a pineapple, a squid. Sometimes there is a
  small tag in a box, like the 特製 on 大判焼き.
- **The cloth banners:** wobbly, rounded pink writing, as if done with a
  felt-tip pen (いらっしゃいませ!!, たのしんでね, Welcome to Shima).
- **The arch's board:** brown hand-writing in among the flowers.

## Good to know

- **Line colour:** black or dark grey paint becomes the film's dark brown,
  `#3B2620`, as on the faces.
- **Line weight:** the game shows a sign at about a quarter of the
  template's size. Lines thinner than about 12 px on the canvas fade away, so
  draw outlines about 16 to 24 px thick.
- **Margins:** keep the words inside the dashed line. Anything out to the
  canvas edge still shows on the board.
- **Your files are never changed:** rebuilding only reads them, copies them
  into the game (`public/signs/`) and redraws the templates.
- **Templates are redrawn only if untouched:** if a template in `_guides/`
  has changed since the rebuild drew it, for example because a painting was
  saved over it, the rebuild leaves it alone and says so. Move the painting
  up into `art/signs/`. The rebuild keeps track of what it drew in
  `_guides/_drawn.json`, so leave that file alone.
- **Mistakes are listed when you rebuild:** that covers a file whose name
  matches no sign, and a painting whose proportions don't match its
  template. Such a painting, made for a board since reshaped, shows as you
  painted it, centred, and is never stretched. Repaint it on its template
  to fill the board.
- **Subfolders are ignored:** keep old versions of your paintings in one,
  such as `art/signs/v1/`. The templates need no backup, because every
  rebuild can draw them again.
- **Going back:** take a painting out, or move it into a subfolder, and the
  next rebuild brings back the typed words.
- **Changing words:** changing a sign's words in `src/locales/ja.json`
  changes only the typed words. A painting stays as you painted it.
