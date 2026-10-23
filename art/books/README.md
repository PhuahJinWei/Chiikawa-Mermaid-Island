# Painting the book

The island has one book you can read: 伝説の生物図鑑, the big picture
encyclopedia from the film. You paint two pictures for it, and the game
wraps them onto the book:

- **The cover:** one picture wrapped round the book: the back cover, the
  spine and the front cover side by side.
- **The pages:** the spread you see when you read it, both pages side by
  side. There is only this one spread; the book never turns a page.

Until you paint them, the cover is plain rust cloth and the pages have faint
lines of writing on them.

## The files

- **`_guides/`** holds the two templates, `cover.png` and `pages.png`. Each
  shows where everything goes, with dashed lines and faint labels.
- **Your paintings** go here in `art/books/`, named like their templates:
  `cover.png` and `pages.png`.

| Picture | Canvas (pixels) | What is where |
|---|---|---|
| `cover.png` | 2048 × 1192 | Back cover on the left, the spine in the middle (between the dashed folds), the front cover on the right |
| `pages.png` | 3712 × 2048 | Left page, then right page; the grey band in the middle is the gutter |

The book is bound on the left, as a picture encyclopedia written across is.
So the front cover is the right-hand part of the cover picture. When someone
reads the book, you see the outside of its covers from in front of them: the
back cover on your left, the front cover on your right and the spine in the
middle, just as you painted them.

## How to paint

1. Open a template from `_guides/` in a paint program with layers (Krita,
   Clip Studio Paint, Procreate, ibisPaint or Photoshop). Add a new layer
   above it.
2. Paint on the new layer. For the background you can do either of these:
   - **Leave it transparent:** the cloth's rust (on the cover) or the
     paper (on the pages) shows through.
   - **Paint it all:** your own colours, right to the canvas edges.
3. Hide the template. Export your layer as a PNG with transparency, at the
   whole canvas size, named `cover.png` or `pages.png`. Save it into
   `art/books/` itself, the folder this README is in, not into `_guides/`.
   Don't trim or crop it on export.
4. Rebuild the book from the project folder, then reload the game:

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python art/blender/build_books.py
```

It takes a few seconds and lists which pictures are painted. It also draws
the book's icon in the pouch again, with your cover on it.

## The film's book

From its frames:

- **The cover:** rust-brown cloth with dark brown outlines, a pale
  creature drawn on the front.
- **The spine:** on Hitoha and Futaba's shelf it reads 伝説の!! 生物図鑑,
  written down it in round hand-lettering, with a small white creature at
  its foot, like the shelf's other books (おいしいごはん, お花いろいろ,
  たき火, あまいもの図鑑).
- **The pages:** pale paper. The mermaid's spread has 人魚 lettered big at
  the top of the right page, a drawing of her with notes round it, and a
  豆知識コーナー box at the bottom. The left page is lines of writing.

## Good to know

- **Line colour:** black or dark grey paint becomes the film's dark brown,
  `#3B2620`, as on the faces and the signs.
- **Line weight:** the game shows each picture at half the template's size,
  so lines thinner than about 6 px on the canvas fade away. The spread is
  read close and fills most of the screen, so writing reads well at 8 to
  12 px. The cover is seen smaller, so give it bolder lines, 12 to 20 px.
- **The spine is narrow:** about 286 px across on the template. Write its title
  down it, a character a line, as the shelf's books are.
- **The gutter:** the pages curve down into the spine there, so what is
  painted in the grey band is seen edge on, if at all. Keep words out of it.
- **Margins:** keep words inside the dashed lines. The book's edges and the
  pen's outline round them cover a little of each edge.
- **Your files are never changed:** rebuilding only reads them, copies them
  into the game (`public/models/props/book_cover.webp`, `book_pages.webp`
  and a small `book_pages_far.webp` for books read by others) and redraws
  the templates.
- **Templates are redrawn only if untouched:** if a template in `_guides/`
  changed since the rebuild drew it, for example because a painting was
  saved over it, the rebuild leaves it alone and says so. Move the painting
  up into `art/books/`. The rebuild keeps track of what it drew in
  `_guides/_drawn.json`, so leave that file alone.
- **A picture of other proportions** is shown as you painted it, centred,
  never stretched, and the rebuild says so. Repaint it on its template to
  fill the cover or the spread.
- **Going back:** take a painting out, or move it into a subfolder, and the
  next rebuild brings back the plain cover or the lines of writing.
- **Light on the phone:** the spread's picture is loaded only while someone
  reads the book, and let go of a few seconds after.
