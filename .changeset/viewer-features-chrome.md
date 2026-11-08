---
'@embedpdf/viewer-chrome': minor
---

A `features` prop says what people can do in the viewer, everywhere at once: a feature or a part
by its name, `true` or `false` (`{ measurement: true, 'documents.download': false }`). A feature
left out keeps its default, and a part wins over its feature, in any order, so
`{ annotations: false, 'annotations.highlight': true }` is highlighting and nothing else.
`readOnly` comes after it, so `features` never brings a tool back into a read-only viewer.
`features` follows its prop, and a name that is no feature or part warns once in the console.

Measuring, redaction, building forms and snapshots now start off: the Measure, Redact and Form tabs
and Take a Snapshot show once `features` turns them on
(`{ measurement: true, redaction: true, 'forms.building': true, snapshots: true }`). Until then,
measurement and redaction marks already in a document show but can't be changed by hand, and
people fill in forms but can't move their fields.

`disable` is deprecated and goes in 4.0. It still works: a feature in it counts as `false` under
`features`, and a command in it stays off. Turn a feature off with `features`, move or remove a
button with the layout, and take one button out everywhere with the commands plugin's
`disabledCommands`.
