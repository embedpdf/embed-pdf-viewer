---
'@embedpdf/core': minor
---

Plugins declare their state once with `defineState(token, { read, empty })`: `read(capability)` returns the plugin's state object from its getters, and `empty` is that object while no document is open. The types check `empty` against what `read` returns, so a missing field or a value of the wrong type is a type error, and so is an extra field written inline. The declaration names no framework, so every framework adapter builds its state hook from the same declaration. `empty` is frozen, because every reader shares it. `shallowEqual(left, right)` compares two objects or arrays field by field by identity, which is how adapters decide whether declared state changed. The type is exported as `StateDeclaration`.
