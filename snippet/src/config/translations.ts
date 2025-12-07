import { ParamResolvers, Locale } from '@embedpdf/plugin-i18n';
import { State } from './types';
import { ZOOM_PLUGIN_ID } from '@embedpdf/plugin-zoom';

export const englishTranslations: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    search: {
      placeholder: 'Search',
      caseSensitive: 'Case sensitive',
      wholeWord: 'Whole word',
      resultsFound: '{count} results found',
      page: 'Page {page}',
    },
    zoom: {
      in: 'Zoom In',
      out: 'Zoom Out',
      fitWidth: 'Fit to Width',
      fitPage: 'Fit to Page',
      marquee: 'Marquee Zoom',
      menu: 'Zoom Menu',
      level: 'Zoom Level ({level}%)',
    },
    pan: {
      toggle: 'Toggle Pan Mode',
    },
    pointer: {
      toggle: 'Toggle Pointer Mode',
    },
    capture: {
      screenshot: 'Screenshot',
    },
    document: {
      menu: 'Document Menu',
      open: 'Open',
      close: 'Close',
      print: 'Print',
      export: 'Export',
      fullscreen: 'Fullscreen',
    },
    panel: {
      sidebar: 'Sidebar',
      search: 'Search',
      comment: 'Comment',
      thumbnails: 'Thumbnails',
      outline: 'Outline',
    },
    page: {
      settings: 'Page Settings',
      single: 'Single Page',
      twoOdd: 'Two Page (Odd)',
      twoEven: 'Two Page (Even)',
      vertical: 'Vertical',
      horizontal: 'Horizontal',
      spreadMode: 'Spread Mode',
      scrollLayout: 'Scroll Layout',
      rotation: 'Page Rotation',
    },
    rotate: {
      clockwise: 'Rotate Clockwise',
      counterClockwise: 'Rotate Counter-Clockwise',
    },
    mode: {
      view: 'View',
      annotate: 'Annotate',
      shapes: 'Shapes',
      redact: 'Redact',
    },
    annotation: {
      text: 'Text',
      highlight: 'Highlight',
      strikeout: 'Strikethrough',
      underline: 'Underline',
      squiggly: 'Squiggly',
      rectangle: 'Rectangle',
      circle: 'Circle',
      line: 'Line',
      arrow: 'Arrow',
      polygon: 'Polygon',
      polyline: 'Polyline',
      ink: 'Ink',
      stamp: 'Stamp',
    },
    redaction: {
      area: 'Redact Area',
      text: 'Redact Text',
      applyAll: 'Apply All',
      clearAll: 'Clear All',
    },
    history: {
      undo: 'Undo',
      redo: 'Redo',
    },
  },
};

export const germanTranslations: Locale = {
  code: 'de',
  name: 'Deutsch',
  translations: {
    search: {
      placeholder: 'Suchen',
      caseSensitive: 'Groß-/Kleinschreibung',
      wholeWord: 'Ganzes Wort',
      resultsFound: '{count} Ergebnisse gefunden',
      page: 'Seite {page}',
    },
    zoom: {
      in: 'Vergrößern',
      out: 'Verkleinern',
      fitWidth: 'An Breite anpassen',
      fitPage: 'An Seite anpassen',
      marquee: 'Laufrahmen-Zoom',
      menu: 'Zoom-Menü',
      level: 'Zoomstufe ({level}%)',
    },
    pan: {
      toggle: 'Verschieben-Modus umschalten',
    },
    pointer: {
      toggle: 'Zeiger-Modus umschalten',
    },
    capture: {
      screenshot: 'Screenshot',
    },
    document: {
      menu: 'Dokument-Menü',
      open: 'Öffnen',
      close: 'Schließen',
      print: 'Drucken',
      export: 'Exportieren',
      fullscreen: 'Vollbild',
    },
    panel: {
      sidebar: 'Seitenleiste',
      search: 'Suchen',
      comment: 'Kommentar',
      thumbnails: 'Miniaturansichten',
      outline: 'Gliederung',
    },
    page: {
      settings: 'Seiteneinstellungen',
      single: 'Einzelseite',
      twoOdd: 'Zwei Seiten (Ungerade)',
      twoEven: 'Zwei Seiten (Gerade)',
      vertical: 'Vertikal',
      horizontal: 'Horizontal',
      spreadMode: 'Doppelseiten-Modus',
      scrollLayout: 'Scroll-Layout',
      rotation: 'Seitendrehung',
    },
    rotate: {
      clockwise: 'Im Uhrzeigersinn drehen',
      counterClockwise: 'Gegen den Uhrzeigersinn drehen',
    },
    mode: {
      view: 'Ansicht',
      annotate: 'Annotieren',
      shapes: 'Formen',
      redact: 'Schwärzen',
    },
    annotation: {
      text: 'Text',
      highlight: 'Markieren',
      strikeout: 'Durchstreichen',
      underline: 'Unterstreichen',
      squiggly: 'Wellenlinie',
      rectangle: 'Rechteck',
      circle: 'Kreis',
      line: 'Linie',
      arrow: 'Pfeil',
      polygon: 'Polygon',
      polyline: 'Polylinie',
      ink: 'Freihand',
      stamp: 'Stempel',
    },
    redaction: {
      area: 'Bereich schwärzen',
      text: 'Text schwärzen',
      applyAll: 'Alle anwenden',
      clearAll: 'Alle löschen',
    },
    history: {
      undo: 'Rückgängig',
      redo: 'Wiederholen',
    },
  },
};

export const dutchTranslations: Locale = {
  code: 'nl',
  name: 'Nederlands',
  translations: {
    search: {
      placeholder: 'Zoeken',
      caseSensitive: 'Hoofdlettergevoelig',
      wholeWord: 'Heel woord',
      resultsFound: '{count} resultaten gevonden',
      page: 'Pagina {page}',
    },
    zoom: {
      in: 'Inzoomen',
      out: 'Uitzoomen',
      fitWidth: 'Aanbreedte aanpassen',
      fitPage: 'Aan pagina aanpassen',
      marquee: 'Lijstzoom',
      menu: 'Zoommenu',
      level: 'Zoomniveau ({level}%)',
    },
    pan: {
      toggle: 'Pan-modus wisselen',
    },
    pointer: {
      toggle: 'Aanwijzermodus wisselen',
    },
    capture: {
      screenshot: 'Schermafbeelding',
    },
    document: {
      menu: 'Documentmenu',
      open: 'Openen',
      close: 'Sluiten',
      print: 'Afdrukken',
      export: 'Exporteren',
      fullscreen: 'Volledig scherm',
    },
    panel: {
      sidebar: 'Zijbalk',
      search: 'Zoeken',
      comment: 'Opmerking',
      thumbnails: 'Miniaturen',
      outline: 'Overzicht',
    },
    page: {
      settings: 'Pagina-instellingen',
      single: 'Enkele pagina',
      twoOdd: "Twee pagina's (Oneven)",
      twoEven: "Twee pagina's (Even)",
      vertical: 'Verticaal',
      horizontal: 'Horizontaal',
      spreadMode: 'Spreidingsmodus',
      scrollLayout: 'Scrollindeling',
      rotation: 'Paginarotatie',
    },
    rotate: {
      clockwise: 'Met de klok mee draaien',
      counterClockwise: 'Tegen de klok in draaien',
    },
    mode: {
      view: 'Weergave',
      annotate: 'Annoteren',
      shapes: 'Vormen',
      redact: 'Redigeren',
    },
    annotation: {
      text: 'Tekst',
      highlight: 'Markeren',
      strikeout: 'Doorhalen',
      underline: 'Onderstrepen',
      squiggly: 'Golflijn',
      rectangle: 'Rechthoek',
      circle: 'Cirkel',
      line: 'Lijn',
      arrow: 'Pijl',
      polygon: 'Veelhoek',
      polyline: 'Polylijn',
      ink: 'Inkt',
      stamp: 'Stempel',
    },
    redaction: {
      area: 'Gebied redigeren',
      text: 'Tekst redigeren',
      applyAll: 'Alles toepassen',
      clearAll: 'Alles wissen',
    },
    history: {
      undo: 'Ongedaan maken',
      redo: 'Opnieuw doen',
    },
  },
};

export const frenchTranslations: Locale = {
  code: 'fr',
  name: 'Français',
  translations: {
    search: {
      placeholder: 'Rechercher',
      caseSensitive: 'Respecter la casse',
      wholeWord: 'Mot entier',
      resultsFound: '{count} résultats trouvés',
      page: 'Page {page}',
    },
    zoom: {
      in: 'Zoom avant',
      out: 'Zoom arrière',
      fitWidth: 'Ajuster à la largeur',
      fitPage: 'Ajuster à la page',
      marquee: 'Zoom de sélection',
      menu: 'Menu Zoom',
      level: 'Niveau de zoom ({level}%)',
    },
    pan: {
      toggle: 'Basculer le mode déplacement',
    },
    pointer: {
      toggle: 'Basculer le mode pointeur',
    },
    capture: {
      screenshot: "Capture d'écran",
    },
    document: {
      menu: 'Menu Document',
      open: 'Ouvrir',
      close: 'Fermer',
      print: 'Imprimer',
      export: 'Exporter',
      fullscreen: 'Plein écran',
    },
    panel: {
      sidebar: 'Barre latérale',
      search: 'Rechercher',
      comment: 'Commentaire',
      thumbnails: 'Miniatures',
      outline: 'Plan',
    },
    page: {
      settings: 'Paramètres de page',
      single: 'Page unique',
      twoOdd: 'Deux pages (Impair)',
      twoEven: 'Deux pages (Pair)',
      vertical: 'Vertical',
      horizontal: 'Horizontal',
      spreadMode: 'Mode double page',
      scrollLayout: 'Disposition de défilement',
      rotation: 'Rotation de page',
    },
    rotate: {
      clockwise: 'Tourner dans le sens horaire',
      counterClockwise: 'Tourner dans le sens antihoraire',
    },
    mode: {
      view: 'Affichage',
      annotate: 'Annoter',
      shapes: 'Formes',
      redact: 'Caviarder',
    },
    annotation: {
      text: 'Texte',
      highlight: 'Surligner',
      strikeout: 'Barrer',
      underline: 'Souligner',
      squiggly: 'Ondulé',
      rectangle: 'Rectangle',
      circle: 'Cercle',
      line: 'Ligne',
      arrow: 'Flèche',
      polygon: 'Polygone',
      polyline: 'Polyligne',
      ink: 'Encre',
      stamp: 'Tampon',
    },
    redaction: {
      area: 'Caviarder la zone',
      text: 'Caviarder le texte',
      applyAll: 'Tout appliquer',
      clearAll: 'Tout effacer',
    },
    history: {
      undo: 'Annuler',
      redo: 'Refaire',
    },
  },
};

export const paramResolvers: ParamResolvers<State> = {
  'zoom.level': ({ state, documentId }) => {
    const zoomLevel = documentId
      ? (state.plugins[ZOOM_PLUGIN_ID]?.documents[documentId]?.currentZoomLevel ?? 1)
      : 1;
    return {
      level: Math.round(zoomLevel * 100),
    };
  },
};
