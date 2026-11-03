---
'@embedpdf/viewer-chrome': minor
---

The page number:

- The `pager` bar holds the previous and next page buttons around the page number, one group that never moves into "More". The number and the count are one button, "3 / 12", that turns the number into a field to type a page: `pageNumber.page` and `pageNumber.pages` say `{current} / {total}` and `{first}–{last} / {total}` in every language. It names the pages the buttons step past, the Stage's `listCurrentPages()`: "2–3 / 12" while a spread fits across the view, so Next goes to 4–5, and the one page once you zoom in past it. A document of one page has no page number, and `page:next`, `page:previous`, `page:first` and `page:last` don't show for it.
- A floating bar whose place says `hideWhenIdle: true`, and by default the bar with the page number, at every size, fades out once the pages and the pointer have been still for two seconds, and comes back when the pages move, the pointer moves over them or presses them, or the keyboard reaches it. It stays while the pointer is on it, while you're using it from the keyboard or typing in it, and while a menu from it is open. Out of sight it takes no clicks and keeps its place in the keyboard's order. `hideWhileScrolling` is gone.
- A floating bar's corners follow the theme's `radius`, like its buttons, instead of being round.
- A command's chevron to the next or previous page points the other way in a right-to-left language, in a bar, a menu and a strip bar, where the row mirrors.
