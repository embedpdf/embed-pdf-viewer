import type { ParamResolvers, Locale } from '@embedpdf/plugin-i18n';
import type { State } from './types';
import { ZOOM_PLUGIN_ID } from '@embedpdf/plugin-zoom';

export const englishTranslations: Locale = {
  code: 'en',
  name: 'English',
  translations: {
    zoom: {
      in: 'Zoom In',
      out: 'Zoom Out',
      fitWidth: 'Fit to Width',
      fitPage: 'Fit to Page',
      marquee: 'Marquee Zoom',
      automatic: 'Automatic',
      level: 'Zoom Level ({level}%)',
      inArea: 'Zoom In Area',
      menu: 'Zoom Menu',
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
      properties: 'Properties',
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
    tabs: {
      overflowMenu: 'More tabs',
    },
    annotation: {
      text: 'Text',
      highlight: 'Highlight',
      strikeout: 'Strikeout',
      underline: 'Underline',
      rectangle: 'Rectangle',
      circle: 'Circle',
      line: 'Line',
      arrow: 'Arrow',
      polygon: 'Polygon',
      polyline: 'Polyline',
      ink: 'Ink',
      stamp: 'Stamp',
      overflowTools: 'Overflow Tools',
      group: 'Group',
      ungroup: 'Ungroup',
      addLink: 'Add Link',
      removeLink: 'Remove Link',
      deleteAllSelected: 'Delete All',
    },
    link: {
      title: 'Insert Link',
      url: 'URL',
      page: 'Page',
      enterUrl: 'Enter URL',
      enterPage: 'Enter Page Number',
      pageRange: 'Page 1 to {totalPages}',
      link: 'Link',
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
    search: {
      title: 'Search',
      placeholder: 'Search',
      close: 'Close search',
      caseSensitive: 'Case sensitive',
      wholeWord: 'Whole word',
      resultsFound: '{count} results found',
      previousResult: 'Previous result',
      nextResult: 'Next result',
      page: 'Page {number}',
    },
    security: {
      protected: {
        title: 'Protected Document',
        description: 'This document has restricted permissions. Some features may be limited.',
        viewPermissions: 'View Permissions',
      },
      viewPermissions: {
        title: 'Document Permissions',
        description:
          'This document is protected. Enter the owner password to unlock all permissions.',
        restrictedActions: 'Document Permissions',
      },
      unlock: {
        label: 'Owner Password',
        placeholder: 'Enter owner password',
        button: 'Unlock',
        success: 'Full permissions unlocked successfully.',
        invalidPassword: 'Invalid owner password. Please try again.',
        failed: 'Failed to unlock permissions.',
      },
    },
    protect: {
      permissions: {
        print: 'Print',
        printHighQuality: 'High Quality Print',
        copy: 'Copy Contents',
        accessibility: 'Extract for Accessibility',
        modify: 'Modify Contents',
        annotations: 'Modify Annotations',
        fillForms: 'Fill Forms',
        assemble: 'Assemble Document',
      },
    },
    common: {
      close: 'Close',
      cancel: 'Cancel',
    },
  },
};

export const spanishTranslations: Locale = {
  code: 'es',
  name: 'Español',
  translations: {
    zoom: {
      in: 'Acercar',
      out: 'Alejar',
      fitWidth: 'Ajustar al ancho',
      fitPage: 'Ajustar a la página',
      marquee: 'Zoom de marquesina',
      automatic: 'Automático',
      level: 'Nivel de zoom ({level}%)',
      inArea: 'Acercar área',
      menu: 'Menú de zoom',
    },
    pan: {
      toggle: 'Alternar modo panorámico',
    },
    pointer: {
      toggle: 'Alternar modo puntero',
    },
    capture: {
      screenshot: 'Captura de pantalla',
    },
    document: {
      menu: 'Menú de documento',
      open: 'Abrir',
      close: 'Cerrar',
      print: 'Imprimir',
      export: 'Exportar',
      properties: 'Propiedades',
    },
    panel: {
      sidebar: 'Barra lateral',
      search: 'Buscar',
      comment: 'Comentario',
      thumbnails: 'Miniaturas',
      outline: 'Esquema',
    },
    page: {
      settings: 'Configuración de página',
      single: 'Página única',
      twoOdd: 'Dos páginas (impar)',
      twoEven: 'Dos páginas (par)',
      vertical: 'Vertical',
      horizontal: 'Horizontal',
      spreadMode: 'Modo de extensión',
      scrollLayout: 'Diseño de desplazamiento',
      rotation: 'Rotación de página',
    },
    rotate: {
      clockwise: 'Girar en sentido horario',
      counterClockwise: 'Girar en sentido antihorario',
    },
    mode: {
      view: 'Ver',
      annotate: 'Anotar',
      shapes: 'Formas',
      redact: 'Redactar',
    },
    tabs: {
      overflowMenu: 'Más pestañas',
    },
    annotation: {
      text: 'Texto',
      highlight: 'Resaltar',
      strikeout: 'Tachar',
      underline: 'Subrayar',
      rectangle: 'Rectángulo',
      circle: 'Círculo',
      line: 'Línea',
      arrow: 'Flecha',
      polygon: 'Polígono',
      polyline: 'Polilínea',
      ink: 'Tinta',
      stamp: 'Sello',
      overflowTools: 'Más herramientas',
      group: 'Agrupar',
      ungroup: 'Desagrupar',
      addLink: 'Agregar enlace',
      removeLink: 'Eliminar enlace',
      deleteAllSelected: 'Eliminar todo',
    },
    link: {
      title: 'Insertar enlace',
      url: 'URL',
      page: 'Página',
      enterUrl: 'Ingrese URL',
      enterPage: 'Ingrese número de página',
      pageRange: 'Página 1 a {totalPages}',
      link: 'Enlazar',
    },
    redaction: {
      area: 'Redactar área',
      text: 'Redactar texto',
      applyAll: 'Aplicar todo',
      clearAll: 'Borrar todo',
    },
    history: {
      undo: 'Deshacer',
      redo: 'Rehacer',
    },
    search: {
      title: 'Buscar',
      placeholder: 'Buscar',
      close: 'Cerrar búsqueda',
      caseSensitive: 'Distinguir mayúsculas',
      wholeWord: 'Palabra completa',
      resultsFound: '{count} resultados encontrados',
      previousResult: 'Resultado anterior',
      nextResult: 'Resultado siguiente',
      page: 'Página {number}',
    },
    security: {
      protected: {
        title: 'Documento Protegido',
        description:
          'Este documento tiene permisos restringidos. Algunas funciones pueden estar limitadas.',
        viewPermissions: 'Ver Permisos',
      },
      viewPermissions: {
        title: 'Permisos del Documento',
        description:
          'Este documento está protegido. Ingrese la contraseña del propietario para desbloquear todos los permisos.',
        restrictedActions: 'Permisos del Documento',
      },
      unlock: {
        label: 'Contraseña del Propietario',
        placeholder: 'Ingrese la contraseña del propietario',
        button: 'Desbloquear',
        success: 'Permisos completos desbloqueados exitosamente.',
        invalidPassword: 'Contraseña del propietario inválida. Por favor intente de nuevo.',
        failed: 'Error al desbloquear permisos.',
      },
    },
    protect: {
      permissions: {
        print: 'Imprimir',
        printHighQuality: 'Impresión de Alta Calidad',
        copy: 'Copiar Contenido',
        accessibility: 'Extraer para Accesibilidad',
        modify: 'Modificar Contenido',
        annotations: 'Modificar Anotaciones',
        fillForms: 'Rellenar Formularios',
        assemble: 'Ensamblar Documento',
      },
    },
    common: {
      close: 'Cerrar',
      cancel: 'Cancelar',
    },
  },
};

export const germanTranslations: Locale = {
  code: 'de',
  name: 'Deutsch',
  translations: {
    zoom: {
      in: 'Vergrößern',
      out: 'Verkleinern',
      fitWidth: 'An Breite anpassen',
      fitPage: 'An Seite anpassen',
      marquee: 'Auswahlzoom',
      automatic: 'Automatisch',
      level: 'Zoomstufe ({level}%)',
      inArea: 'Bereich vergrößern',
      menu: 'Zoom-Menü',
    },
    pan: {
      toggle: 'Schwenkmodus umschalten',
    },
    pointer: {
      toggle: 'Zeigermodus umschalten',
    },
    capture: {
      screenshot: 'Screenshot',
    },
    document: {
      menu: 'Dokumentmenü',
      open: 'Öffnen',
      close: 'Schließen',
      print: 'Drucken',
      export: 'Exportieren',
      properties: 'Eigenschaften',
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
      single: 'Einzelne Seite',
      twoOdd: 'Zwei Seiten (ungerade)',
      twoEven: 'Zwei Seiten (gerade)',
      vertical: 'Vertikal',
      horizontal: 'Horizontal',
      spreadMode: 'Seitenmodus',
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
    tabs: {
      overflowMenu: 'Weitere Tabs',
    },
    annotation: {
      text: 'Text',
      highlight: 'Hervorheben',
      strikeout: 'Durchstreichen',
      underline: 'Unterstreichen',
      rectangle: 'Rechteck',
      circle: 'Kreis',
      line: 'Linie',
      arrow: 'Pfeil',
      polygon: 'Polygon',
      polyline: 'Polylinie',
      ink: 'Stift',
      stamp: 'Stempel',
      overflowTools: 'Weitere Werkzeuge',
      group: 'Gruppieren',
      ungroup: 'Gruppierung aufheben',
      addLink: 'Link hinzufügen',
      removeLink: 'Link entfernen',
      deleteAllSelected: 'Alle löschen',
    },
    link: {
      title: 'Link einfügen',
      url: 'URL',
      page: 'Seite',
      enterUrl: 'URL eingeben',
      enterPage: 'Seitenzahl eingeben',
      pageRange: 'Seite 1 bis {totalPages}',
      link: 'Verlinken',
    },
    redaction: {
      area: 'Bereich schwärzen',
      text: 'Text schwärzen',
      applyAll: 'Alles anwenden',
      clearAll: 'Alles löschen',
    },
    history: {
      undo: 'Rückgängig',
      redo: 'Wiederholen',
    },
    search: {
      title: 'Suchen',
      placeholder: 'Suchen',
      close: 'Suche schließen',
      caseSensitive: 'Groß-/Kleinschreibung',
      wholeWord: 'Ganzes Wort',
      resultsFound: '{count} Ergebnisse gefunden',
      previousResult: 'Vorheriges Ergebnis',
      nextResult: 'Nächstes Ergebnis',
      page: 'Seite {number}',
    },
    security: {
      protected: {
        title: 'Geschütztes Dokument',
        description:
          'Dieses Dokument hat eingeschränkte Berechtigungen. Einige Funktionen können begrenzt sein.',
        viewPermissions: 'Berechtigungen anzeigen',
      },
      viewPermissions: {
        title: 'Dokumentberechtigungen',
        description:
          'Dieses Dokument ist geschützt. Geben Sie das Eigentümer-Passwort ein, um alle Berechtigungen freizuschalten.',
        restrictedActions: 'Dokumentberechtigungen',
      },
      unlock: {
        label: 'Eigentümer-Passwort',
        placeholder: 'Eigentümer-Passwort eingeben',
        button: 'Freischalten',
        success: 'Volle Berechtigungen erfolgreich freigeschaltet.',
        invalidPassword: 'Ungültiges Eigentümer-Passwort. Bitte versuchen Sie es erneut.',
        failed: 'Fehler beim Freischalten der Berechtigungen.',
      },
    },
    protect: {
      permissions: {
        print: 'Drucken',
        printHighQuality: 'Hochqualitativer Druck',
        copy: 'Inhalte kopieren',
        accessibility: 'Für Barrierefreiheit extrahieren',
        modify: 'Inhalte ändern',
        annotations: 'Anmerkungen ändern',
        fillForms: 'Formulare ausfüllen',
        assemble: 'Dokument zusammenstellen',
      },
    },
    common: {
      close: 'Schließen',
      cancel: 'Abbrechen',
    },
  },
};

export const dutchTranslations: Locale = {
  code: 'nl',
  name: 'Nederlands',
  translations: {
    zoom: {
      in: 'Inzoomen',
      out: 'Uitzoomen',
      fitWidth: 'Aan breedte aanpassen',
      fitPage: 'Aan pagina aanpassen',
      marquee: 'Selectiezoom',
      automatic: 'Automatisch',
      level: 'Zoomniveau ({level}%)',
      inArea: 'Gebied inzoomen',
      menu: 'Zoommenu',
    },
    pan: {
      toggle: 'Panbewegingsmodus schakelen',
    },
    pointer: {
      toggle: 'Aanwijzermodus schakelen',
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
      properties: 'Eigenschappen',
    },
    panel: {
      sidebar: 'Zijbalk',
      search: 'Zoeken',
      comment: 'Commentaar',
      thumbnails: 'Miniaturen',
      outline: 'Overzicht',
    },
    page: {
      settings: 'Pagina-instellingen',
      single: 'Enkele pagina',
      twoOdd: "Twee pagina's (oneven)",
      twoEven: "Twee pagina's (even)",
      vertical: 'Verticaal',
      horizontal: 'Horizontaal',
      spreadMode: 'Spreidmodus',
      scrollLayout: 'Scroll-indeling',
      rotation: 'Paginadraaiing',
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
    tabs: {
      overflowMenu: 'Meer tabbladen',
    },
    annotation: {
      text: 'Tekst',
      highlight: 'Markeren',
      strikeout: 'Doorhalen',
      underline: 'Onderstrepen',
      rectangle: 'Rechthoek',
      circle: 'Cirkel',
      line: 'Lijn',
      arrow: 'Pijl',
      polygon: 'Veelhoek',
      polyline: 'Polylijn',
      ink: 'Inkt',
      stamp: 'Stempel',
      overflowTools: 'Meer gereedschappen',
      group: 'Groeperen',
      ungroup: 'Degroeperen',
      addLink: 'Link toevoegen',
      removeLink: 'Link verwijderen',
      deleteAllSelected: 'Alles verwijderen',
    },
    link: {
      title: 'Link invoegen',
      url: 'URL',
      page: 'Pagina',
      enterUrl: 'Voer URL in',
      enterPage: 'Voer paginanummer in',
      pageRange: 'Pagina 1 tot {totalPages}',
      link: 'Koppelen',
    },
    redaction: {
      area: 'Gebied redigeren',
      text: 'Tekst redigeren',
      applyAll: 'Alles toepassen',
      clearAll: 'Alles wissen',
    },
    history: {
      undo: 'Ongedaan maken',
      redo: 'Opnieuw uitvoeren',
    },
    search: {
      title: 'Zoeken',
      placeholder: 'Zoeken',
      close: 'Zoekopdracht sluiten',
      caseSensitive: 'Hoofdlettergevoelig',
      wholeWord: 'Heel woord',
      resultsFound: '{count} resultaten gevonden',
      previousResult: 'Vorig resultaat',
      nextResult: 'Volgend resultaat',
      page: 'Pagina {number}',
    },
    security: {
      protected: {
        title: 'Beveiligd Document',
        description:
          'Dit document heeft beperkte machtigingen. Sommige functies kunnen beperkt zijn.',
        viewPermissions: 'Machtigingen bekijken',
      },
      viewPermissions: {
        title: 'Documentmachtigingen',
        description:
          'Dit document is beveiligd. Voer het eigenaarswachtwoord in om alle machtigingen te ontgrendelen.',
        restrictedActions: 'Documentmachtigingen',
      },
      unlock: {
        label: 'Eigenaarswachtwoord',
        placeholder: 'Voer eigenaarswachtwoord in',
        button: 'Ontgrendelen',
        success: 'Volledige machtigingen succesvol ontgrendeld.',
        invalidPassword: 'Ongeldig eigenaarswachtwoord. Probeer het opnieuw.',
        failed: 'Ontgrendelen van machtigingen mislukt.',
      },
    },
    protect: {
      permissions: {
        print: 'Afdrukken',
        printHighQuality: 'Hoge Kwaliteit Afdrukken',
        copy: 'Inhoud kopiëren',
        accessibility: 'Extraheren voor toegankelijkheid',
        modify: 'Inhoud wijzigen',
        annotations: 'Annotaties wijzigen',
        fillForms: 'Formulieren invullen',
        assemble: 'Document samenstellen',
      },
    },
    common: {
      close: 'Sluiten',
      cancel: 'Annuleren',
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
  'search.resultsFound': ({ state, documentId }) => {
    const searchState = documentId ? state.plugins['search']?.documents[documentId] : null;
    return {
      count: searchState?.total ?? 0,
    };
  },
};
