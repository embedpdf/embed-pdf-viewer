---
'@embedpdf/plugin-annotation': patch
---

`canDelete()` answers for everything a delete takes. Deleting an annotation deletes its replies, review states, grouped parts and popups with it, and `canDelete()` (on the plugin and on `comments`) now checks each of them: the annotation as before, and what goes with it by its `locked` flag and the permission to delete it. A delete button no longer offers a delete the engine refuses (a reply someone else wrote, under a grant that deletes only your own), or deletes a locked reply along with its parent. `comments.canDeleteThread()` and `comments.deleteThread()` use the same check, so a thread with a review status can be deleted again: the hidden annotation a status is stored in no longer blocks it.
