# Drawing the faces and the things' icons

The game shows the cast's faces on the screen, so you can tell who is who at a
glance:

- In the text box, by the name of whoever speaks to you.
- As the buttons when you choose whom to ask after (だれをさがしてるの？).
- On the marker that points you to whoever you were told of.

Anyone without a face shows their name instead.

The pouch shows each thing by its icon: on the bar along the bottom, in the
bag, and on the card about it. A thing you have drawn shows your drawing;
any other shows a render of its model.

## The files

- **Your drawings** go here in `art/icons/`, one square transparent PNG for each
  face, named by who it is: `chiikawa.png`. A name like `icon_01chiikawa.png`
  works too, because a leading `icon_` and a number are skipped.
- The names are `chiikawa`, `hachiware`, `usagi`, `momonga`, `kurimanju`,
  `rakko`, `shisa`, `furuhonya`, `hitoha` and `futaba`. An `islander.png` would
  be every islander's face (they show 島の子 until there is one).

Draw at any square size: the faces here are 346 × 346. Fill the square with
the face, ears and all, and leave the rest transparent. The game puts each
face on a small cream disc. Black lines become the film's dark brown, as on
the faces, the signs and the book.

## The things' icons

- One square transparent PNG for each thing, here in `art/icons/`, named
  `icon_thing_<name>.png`: `icon_thing_book.png`, `icon_thing_torch.png`.
- The names are the things' own in the game: `ringoame` りんごアメ,
  `chocobanana` チョコバナナ, `pine` 冷しパイン, `wataame` わたあめ,
  `tornado` トルネードポテト, `churros` チュロス, `karaage` からあげ,
  `frank` フランクフルト, `yakitori` やきとり, `kushiyaki` ジャンボ串焼,
  `gyukushi` 牛串, `ikayaki` いかやき, `hamayaki` 浜焼, `takoyaki` たこやき,
  `okonomiyaki` お好み焼き, `crepe` クレープ, `icecream`
  レインボーアイスクリーム, `shavedIce` かき氷, `kebab` ケバブ, `castella`
  ベビーカステラ, `obanyaki` 大判焼き, `steamer` じゃがバター, `juice`
  ジュース, `ramune` ラムネ, `beer` ビール, `torch` たいまつ, `seashell`
  貝がら, `starfish` ヒトデ, `book` 伝説の生物図鑑, `weapon01` バネのぶき,
  `weapon02` ピンクのさすまた, `weapon03` あおいさすまた, `can` 缶,
  `ukulele` ウクレレ, `sword` ラッコの剣, `mermaidScale` 人魚のうろこ.
  Capitals do not matter (`icon_thing_shavedice.png` works).
- A drawing of a thing the game does not have yet waits here; the build says
  so, and it shows once there is a thing of that name.

Draw at any square size, as the faces (these are 346 × 346), with a little
room round the thing: the pouch's slots fit the whole square. Black lines
become the film's dark brown here too.

## Into the game

    blender --background --factory-startup --disable-autoexec --python art/blender/build_icons.py

This copies each face into `public/ui/faces/` at 192 × 192 and lists them in
`faces.json`, and each thing's icon into `public/ui/things/` at 256 × 256,
listed in `things.json`. It never changes your drawings here. If one face or
thing has more than one drawing, the newest is used.
