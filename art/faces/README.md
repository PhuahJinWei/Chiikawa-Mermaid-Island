# Painting the faces

Each character has a folder here: `chiikawa`, `hachiware`, `usagi`,
`momonga`, `kurimanju`, `rakko` and `furuhonya` (all three started as
copies of Chiikawa's layers, to repaint), `shisa` (started as a copy of
Hachiware's, whose model Shisa is built from),
`siren`, the giant mermaid of the forbidden cave, and `mermaid`, her two
little mermaids, who share one face. `art/blender/build_siren.py`
drew the Siren's first layers as templates to draw over: the cast's whole
set of layers and all nine expressions, on Chiikawa's head, which is hers
too. `art/blender/build_mermaid.py` drew the little mermaids' one face the
same way: `eyes open` (two dots), `mouth open` (the round "O") and `eyes
closed` (two dashes, for their blinks). A folder holds that character's face as layers, each one a
transparent PNG painted in place on a 1536 × 1536 canvas. The canvas covers the
game's face area: two head radii wide, centred on the eye line. `_guide.png`
shows the bare head to paint over; the game never shows it.

## Layers

Every PNG in a folder is a layer, named by its file name: `eyes open.png` is
the layer `eyes open`. Start a layer's name with what kind of layer it is:

| Name starts with | What it is |
|---|---|
| `eyes` | Eyes: `eyes open`, `eyes closed`, `eyes teary`... |
| `brows` | Eyebrows: `brows 1`, `brows 2`... |
| `mouth` | Mouths: `mouth closed`, `mouth half-open`, `mouth open`... |
| `tears` | Tears: `tears eyes open`, `tears eyes closed` |
| anything else | Drawn on top of everything, like `sweat` |

The first word decides how the layer stacks (tears under the eyes, the mouth
over the face) and how far it follows where the character is looking.

## Expressions: expressions.txt

Each folder's `expressions.txt` says which layers make up each expression, one
line each:

```
Neutral: brows 1 + eyes open + mouth closed
Worried: brows 3 + eyes open + mouth half-open + sweat
```

- **The expressions** are Neutral, Smile, Happy, Determined, Worried, Teary,
  Sobbing, Shocked and Angry. An expression without a line shows the neutral
  face.
- **Names** ignore capital letters and extra spaces. Anything after a `#` is a
  note and is ignored.
- **`tears`** stands for `tears eyes open`.
- **A mistake stops the rebuild**, which names the line and what is wrong, such
  as a layer with no PNG of that name.

Where the game uses each expression:

| Expression | Shows when |
|---|---|
| Neutral | Standing, walking, looking around, sitting, talking, the hula, bowing, dozing |
| Happy | Waving, hopping, cheering, eating, jumping |
| Shocked | The first moment of being startled |
| Worried | After being startled |
| Sobbing | Crying |
| Angry | The Siren roused (the Test panel's セイレーン: おこる); the others show it only from the Test panel, as their neutral face until it has a line |
| Smile, Determined, Teary | Only from the Test panel, for now |

Each action always shows its own expression. An expression chosen in the Test
panel shows when no action is playing.

## What the game does by itself

- **Always on:** `cheeks.png`, and `skin.png` and `scar.png` (Rakko's star)
  if there are, show on every expression.
- **Blinking and bowing:** the expression's eyes become `eyes closed`, for a
  moment or for as long as the character bows. `tears eyes open` becomes
  `tears eyes closed` at the same time.
- **Dozing:** the eyes become `eyes sleep` if the folder has one (Usagi's),
  otherwise `eyes closed`.
- **Talking and eating:** the mouth goes back and forth between the
  expression's mouth and another one. `mouth closed` opens to `mouth
  half-open`, or to `mouth open` if there is no half-open one. Any other mouth
  closes to `mouth closed`.

## How to repaint

1. Open the layers you want as layers of one document, with `_guide.png` at the
   bottom. Any paint program with layers works, such as Krita (free), Clip
   Studio Paint, Procreate, ibisPaint or Photoshop.
2. Paint on the layer you are changing, and keep its background transparent.
3. Export each layer you changed back over its own file, or as a new file for a
   new layer:
   - PNG with transparency.
   - The whole 1536 × 1536 canvas. Don't trim or crop on export, because the
     position on the canvas is the position on the face.
4. If you added a layer, use it in `expressions.txt`.
5. Rebuild the models from the project folder, then reload the game. In
   PowerShell (Windows' own terminal), the `&` at the start runs the quoted
   program:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --disable-autoexec --python art/blender/import_characters.py -- --no-previews
```

In Git Bash the same command is:

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --disable-autoexec --python art/blender/import_characters.py -- --no-previews
```

Add `--only chiikawa` (or another name) to rebuild just one character. It
takes a minute or two. The Test panel lists every expression for checking.

The Siren is built by a script of her own, which takes about half a minute;
the Test panel's セイレーン section calms or rouses her and takes you to her.
In PowerShell:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --disable-autoexec --python art/blender/build_siren.py -- --no-previews
```

In Git Bash:

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --disable-autoexec --python art/blender/build_siren.py -- --no-previews
```

The little mermaids have a script of their own too, as quick. In PowerShell:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --disable-autoexec --python art/blender/build_mermaid.py -- --no-previews
```

In Git Bash:

```bash
"/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --disable-autoexec --python art/blender/build_mermaid.py -- --no-previews
```

A rebuild that worked ends with `BUILT` and `SAVED` lines naming the model.

## Good to know

- **Line colour:** face lines in the film are dark brown, `#3B2620`. Anything
  you paint in black or dark grey becomes that brown automatically.
- **Line weight:** about 24 px thick on this canvas, the weight of the
  eyebrows, so every face looks drawn with the same pen. The Siren's head is
  nearly three times the cast's, so the same pen is thinner on her canvas: her
  first layers draw it about 14 px. The little mermaids' first layers draw it
  about 34 px, as thick as the user's drawings of them.
- **Your files are never overwritten:** rebuilding reads the layers and
  `expressions.txt` and changes neither. Only `_guide.png` is redrawn, so don't
  paint on it.
- **Unused layers** are left out of the game; the rebuild lists them.
- **Subfolders are ignored:** keep old versions in one, such as `v1`.
- **A new character** without an `expressions.txt` gets one on its first
  rebuild, along with its model's own face art as layers to start from.
- **Where the face shows:** only on the front of the head. The guide's outline
  shows where the head is.
- **Licensing:** the starting art came from the downloaded models, which
  arrived without an author or a licence. See the main README before
  publishing.
