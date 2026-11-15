---
'@embedpdf/react': minor
'@embedpdf/vue': minor
'@embedpdf/svelte': minor
'@embedpdf/angular': minor
---

Each feature entry exports its plugin's commands as a list: `stageCommands` from `/stage`, `interactionCommands` from `/interaction`, `selectionCommands` from `/selection`, `annotationCommands` from `/annotation`, `historyCommands` from `/history`, `renderCommands` from `/render` and `documentCommands` from `/runtime`. `standardCommands` is these lists joined, with the commands it had. To leave some out, spread the lists you want in place of `standardCommands`.
