---
'@embedpdf/plugin-stage': patch
---

Double-tap from a pinched-in zoom returns to fit-width instead of climbing (the iOS rule). The zoom ladder previously picked "the first posture meaningfully above the current zoom," so a pinch to a level between fit-width and detail made a double-tap zoom IN further. The rule is now: the ladder ascends only from ON a rung (within ±10% of a posture) — a tap at a posture moves to the next, wrapping past the top — while a pinch to any other level is leaving the ladder, and a double-tap there RESETS to the base fit ("take me back to reading"), never a further zoom-in. Everything that already felt right is unchanged: zoomed-out → fit-width, fit-width → detail, detail → fit-width.
