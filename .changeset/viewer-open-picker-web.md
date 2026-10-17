---
'@embedpdf/web': patch
---

The file dialog (`pickFile`, `pickImageFile`, `pickRequestedFile`) keeps the file the user picks. It took the window getting its focus back for a closed dialog and, 300 ms later, answered "no file", so a pick that came later than that (a file in iCloud Drive or on a network drive, an app's embedded browser) was dropped: the viewer's Open, the image tool and file attachments did nothing. It now goes by the dialog's own `change` and `cancel` events, which every supported browser fires.
