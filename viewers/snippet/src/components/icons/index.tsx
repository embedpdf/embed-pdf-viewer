import { DownloadIcon } from './download';
import { MenuIcon } from './menu';
import { FullscreenIcon } from './fullscreen';
import { FullscreenExitIcon } from './fullscreen-exit';
import { SaveIcon } from './save';
import { PrintIcon } from './print';
import { SettingsIcon } from './settings';
import { ViewSettingsIcon } from './view-settings';
import { RotateClockwiseIcon } from './rotate-clockwise';
import { RotateCounterClockwiseIcon } from './rotate-counter-clockwise';
import { SinglePageIcon } from './single-page';
import { DoublePageIcon } from './double-page';
import { ZoomInIcon } from './zoom-in';
import { ZoomOutIcon } from './zoom-out';
import { FitToWidthIcon } from './fit-to-width';
import { FitToPageIcon } from './fit-to-page';
import { ChevronRightIcon } from './chevron-right';
import { ChevronLeftIcon } from './chevron-left';
import { ChevronDownIcon } from './chevron-down';
import { SearchIcon } from './search';
import { CommentIcon } from './comment';
import { SidebarIcon } from './sidebar';
import { DotsIcon } from './dots';
import { XIcon } from './x';
import { CopyIcon } from './copy';
import { TrashIcon } from './trash';
import { VerticalIcon } from './vertical';
import { HorizontalIcon } from './horizontal';
import { BookIcon } from './book';
import { Book2Icon } from './book2';
import { SquaresIcon } from './squares';
import { ListTreeIcon } from './list-tree';
import { PaperclipIcon } from './paperclip';
import { UnderlineIcon } from './underline';
import { SquigglyIcon } from './squiggly';
import { StrikethroughIcon } from './strikethrough';
import { HighlightIcon } from './highlight';
import { PaletteIcon } from './palette';
import { FileImportIcon } from './file-import';
import { HandIcon } from './hand';
import { ZoomInAreaIcon } from './zoom-in-area';
import { ScreenshotIcon } from './screenshot';
import { ArrowBackUpIcon } from './arrow-back-up';
import { ArrowForwardUpIcon } from './arrow-forward-up';
import { DeviceFloppyIcon } from './device-floppy';
import { PencilMarkerIcon } from './pencil-marker';
import { CircleIcon } from './circle';
import { SquareIcon } from './square';
import { LineIcon } from './line';
import { LineArrowIcon } from './line-arrow';
import { PolygonIcon } from './polygon';
import { ZigzagIcon } from './zigzag';
import { TextIcon } from './text';
import { ItalicIcon } from './italic';
import { BoldIcon } from './bold';
import { AlignLeftIcon } from './align-left';
import { AlignCenterIcon } from './align-center';
import { AlignRightIcon } from './align-right';
import { AlignTopIcon } from './align-top';
import { AlignMiddleIcon } from './align-middle';
import { AlignBottomIcon } from './align-bottom';
import { PhotoIcon } from './photo';
import { PointerIcon } from './pointer';
import { RedactIcon } from './redact';
import { IconComponent } from './types';
import { RedactAreaIcon } from './redact-area';
import { CheckIcon } from './check';
import { FileIcon } from './file';
import { PlusIcon } from './plus';
import { LockIcon } from './lock';
import { AlertTriangleIcon } from './alert-triangle';

export type Icons = {
  [key: string]: IconComponent;
};

export const icons: Icons = {
  download: DownloadIcon,
  menu: MenuIcon,
  fullscreen: FullscreenIcon,
  fullscreenExit: FullscreenExitIcon,
  save: SaveIcon,
  print: PrintIcon,
  settings: SettingsIcon,
  viewSettings: ViewSettingsIcon,
  rotateClockwise: RotateClockwiseIcon,
  rotateCounterClockwise: RotateCounterClockwiseIcon,
  singlePage: SinglePageIcon,
  doublePage: DoublePageIcon,
  zoomIn: ZoomInIcon,
  zoomOut: ZoomOutIcon,
  fitToWidth: FitToWidthIcon,
  fitToPage: FitToPageIcon,
  chevronRight: ChevronRightIcon,
  chevronLeft: ChevronLeftIcon,
  chevronDown: ChevronDownIcon,
  search: SearchIcon,
  comment: CommentIcon,
  sidebar: SidebarIcon,
  dots: DotsIcon,
  vertical: VerticalIcon,
  horizontal: HorizontalIcon,
  book: BookIcon,
  book2: Book2Icon,
  squares: SquaresIcon,
  listTree: ListTreeIcon,
  paperclip: PaperclipIcon,
  copy: CopyIcon,
  underline: UnderlineIcon,
  squiggly: SquigglyIcon,
  strikethrough: StrikethroughIcon,
  highlight: HighlightIcon,
  palette: PaletteIcon,
  x: XIcon,
  fileImport: FileImportIcon,
  hand: HandIcon,
  zoomInArea: ZoomInAreaIcon,
  screenshot: ScreenshotIcon,
  arrowBackUp: ArrowBackUpIcon,
  arrowForwardUp: ArrowForwardUpIcon,
  trash: TrashIcon,
  deviceFloppy: DeviceFloppyIcon,
  pencilMarker: PencilMarkerIcon,
  circle: CircleIcon,
  square: SquareIcon,
  line: LineIcon,
  lineArrow: LineArrowIcon,
  polygon: PolygonIcon,
  zigzag: ZigzagIcon,
  text: TextIcon,
  italic: ItalicIcon,
  bold: BoldIcon,
  alignLeft: AlignLeftIcon,
  alignCenter: AlignCenterIcon,
  alignRight: AlignRightIcon,
  alignTop: AlignTopIcon,
  alignMiddle: AlignMiddleIcon,
  alignBottom: AlignBottomIcon,
  photo: PhotoIcon,
  pointer: PointerIcon,
  redact: RedactIcon,
  redactArea: RedactAreaIcon,
  check: CheckIcon,
  file: FileIcon,
  plus: PlusIcon,
  lock: LockIcon,
  alertTriangle: AlertTriangleIcon,
};
