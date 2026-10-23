"""The book's cover and pages: their templates to paint over, and the paintings for the game (see books.py).

    blender --background --factory-startup --python art/blender/build_books.py

Draws the templates into art/books/_guides/ (cover.png: the cover wrapped round the book, back, spine and front;
pages.png: the spread read open), redrawing one only while it is still as it drew it. Copies the paintings saved
over them as art/books/cover.png and art/books/pages.png into the game's two pictures
(public/models/props/book_cover.webp and book_pages.webp), with black paint turned to the film's dark brown as on
the faces and the signs. Builds the book afresh (item_book.glb) and draws its icon in the pouch's sheet with its
cover. It never changes the paintings. How to paint them: art/books/README.md.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import books as B  # noqa: E402
import build_items as BI  # noqa: E402


def main():
    problems, painted = B.pictures()
    BI.run(only={"book"})
    for problem in problems:
        print("WARNING", problem)
    print(f"BOOK: templates in art/books/_guides (cover {B.COVER_SIZE[0] * B.PAINT_SCALE} x "
          f"{B.WRAP_ROWS * B.PAINT_SCALE}, pages {B.PAGES_SIZE[0] * B.PAINT_SCALE} x {B.PAGES_SIZE[1] * B.PAINT_SCALE}); "
          f"painted: {', '.join(painted) if painted else 'none yet'}")


if __name__ == "__main__":
    main()
