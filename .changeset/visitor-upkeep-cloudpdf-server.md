---
'@cloudpdf/server': minor
---

Deleting share-link visitors' layers is now the link owner's choice. A link's `visitorIdleSeconds` is null by default, and a visitor's layer then stays until it is deleted on purpose, since what a visitor filled in is often the only copy; migration 039 moves links on the earlier 7-day default to it. A link that sets an idle time, for throwaway layers like examples, has the sweeper delete its visitors' layers nobody has seen for that long; a visitor with the document open renews and stays seen. A visit through a share link now counts as one view however often its session renews: the visitor handle carries the signed time it was issued, and an exchange whose handle is newer than the session lifetime plus five minutes continues the visit.
