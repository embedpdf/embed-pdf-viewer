---
'@embedpdf/engine-runtime': minor
---

Add action-payload getters to the fork's detached action model: unified Hide `/T` / ResetForm `/Fields` target accessors (`EPDFAction_GetNodeTargetCount`/`Name`/`ObjectNumber`, with `-1` marking a target list that could not be fully represented — a partial list must never execute), `EPDFAction_GetNodeHideFlag` (`/H`, spec default hide), `EPDFAction_GetNodeResetForm` (`/Fields` presence + `/Flags` exclude bit — absent and empty are different states), `EPDFAction_GetNodeURIIsMap`, and `EPDFDoc_GetOpenActionDest` for the destination-form catalog `/OpenAction`. Payload capture stays inside the build-time snapshot (nothing lazy, nothing stateful), guarded by new cumulative per-model budgets for target entries and payload bytes plus a destination-array element cap.
