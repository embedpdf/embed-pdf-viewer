---
'@embedpdf/plugin-commands': minor
---

A command that changes a setting can say so with `locked: (context) => owner.getLock(key)`. While a lock holds that setting, the command shows disabled, whatever the `notAllowed` setting says, stays `active` for its own value, and gives the lock's sentence (its `reasonKey`, else `commands.locked.default`) as `disabledReason`. `getRefusal()` reports it with a third reason, `'locked'`, and `execute()` refuses it.
