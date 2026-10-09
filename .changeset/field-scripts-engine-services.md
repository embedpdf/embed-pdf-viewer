---
'@embedpdf/engine-services': minor
---

Field scripts and the calculation order are written: `writeActionTree` builds an action tree with the runtime's creators, `writeFieldScripts` sets a field's events (skipping one already as written), and the form mutator keeps `/AcroForm /CO` in step with the calculate scripts. `forms.reorderCalculations` moves fields by neighbour; a `calculations.restore` undo step takes back what a change did to the order, where nobody changed it since. An update's undo by value covers scripts. `createDestination` moved to the destinations feature.
