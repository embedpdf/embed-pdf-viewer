---
'@embedpdf/plugin-stage': minor
---

The main stage lens registers `goto` and `named` action executors with the action engine when present: GoTo destinations reveal through the camera, NextPage/PrevPage/FirstPage/LastPage execute, unknown named verbs report inert.

The stage lens also reports placed/current/visible page state and user-versus-programmatic motion causes to the action lifecycle coordinator.

Publish a bundle-safe `/contract` entry and a focused `/destination` helper entry so camera consumers do not pull in stage reducer/effect/plugin wiring.
