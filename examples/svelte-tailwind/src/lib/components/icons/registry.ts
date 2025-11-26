import type { Component } from 'svelte';
import type { SVGAttributes } from 'svelte/elements';

// Import all icons
import AlertIcon from './AlertIcon.svelte';
import ArrowBackUpIcon from './ArrowBackUpIcon.svelte';
import ArrowForwardUpIcon from './ArrowForwardUpIcon.svelte';
import ArrowIcon from './ArrowIcon.svelte';
import BookOpenIcon from './BookOpenIcon.svelte';
import CheckIcon from './CheckIcon.svelte';
import ChevronDownIcon from './ChevronDownIcon.svelte';
import ChevronLeftIcon from './ChevronLeftIcon.svelte';
import ChevronRightIcon from './ChevronRightIcon.svelte';
import CircleIcon from './CircleIcon.svelte';
import CloseIcon from './CloseIcon.svelte';
import CommentIcon from './CommentIcon.svelte';
import CopyIcon from './CopyIcon.svelte';
import DocumentIcon from './DocumentIcon.svelte';
import DownloadIcon from './DownloadIcon.svelte';
import FitPageIcon from './FitPageIcon.svelte';
import FitWidthIcon from './FitWidthIcon.svelte';
import FullscreenExitIcon from './FullscreenExitIcon.svelte';
import FullscreenIcon from './FullscreenIcon.svelte';
import HandIcon from './HandIcon.svelte';
import HighlightIcon from './HighlightIcon.svelte';
import ItalicIcon from './ItalicIcon.svelte';
import LineIcon from './LineIcon.svelte';
import MarqueeIcon from './MarqueeIcon.svelte';
import MenuDotsIcon from './MenuDotsIcon.svelte';
import MenuIcon from './MenuIcon.svelte';
import PenIcon from './PenIcon.svelte';
import PhotoIcon from './PhotoIcon.svelte';
import PlusIcon from './PlusIcon.svelte';
import PointerIcon from './PointerIcon.svelte';
import PolygonIcon from './PolygonIcon.svelte';
import PolylineIcon from './PolylineIcon.svelte';
import PrintIcon from './PrintIcon.svelte';
import RedactAreaIcon from './RedactAreaIcon.svelte';
import RedactTextIcon from './RedactTextIcon.svelte';
import RedoIcon from './RedoIcon.svelte';
import RefreshIcon from './RefreshIcon.svelte';
import RotateLeftIcon from './RotateLeftIcon.svelte';
import RotateRightIcon from './RotateRightIcon.svelte';
import ScreenshotIcon from './ScreenshotIcon.svelte';
import SearchIcon from './SearchIcon.svelte';
import SearchMinusIcon from './SearchMinusIcon.svelte';
import SearchPlusIcon from './SearchPlusIcon.svelte';
import SettingsIcon from './SettingsIcon.svelte';
import SidebarIcon from './SidebarIcon.svelte';
import SinglePageIcon from './SinglePageIcon.svelte';
import SquareIcon from './SquareIcon.svelte';
import SquaresIcon from './SquaresIcon.svelte';
import SquigglyIcon from './SquigglyIcon.svelte';
import StrikethroughIcon from './StrikethroughIcon.svelte';
import TextIcon from './TextIcon.svelte';
import ThumbnailsIcon from './ThumbnailsIcon.svelte';
import TrashIcon from './TrashIcon.svelte';
import UnderlineIcon from './UnderlineIcon.svelte';
import UndoIcon from './UndoIcon.svelte';
import ZigzagIcon from './ZigzagIcon.svelte';
import ZoomChevronDownIcon from './ZoomChevronDownIcon.svelte';

// Define the standard Prop type for your icons for consistency
export interface IconProps extends SVGAttributes<SVGSVGElement> {
  title?: string;
}

// The Registry Object
export const iconRegistry = {
  alert: AlertIcon,
  'arrow-back-up': ArrowBackUpIcon,
  'arrow-forward-up': ArrowForwardUpIcon,
  arrow: ArrowIcon,
  'book-open': BookOpenIcon,
  check: CheckIcon,
  'chevron-down': ChevronDownIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  circle: CircleIcon,
  close: CloseIcon,
  comment: CommentIcon,
  copy: CopyIcon,
  document: DocumentIcon,
  download: DownloadIcon,
  'fit-page': FitPageIcon,
  'fit-width': FitWidthIcon,
  'fullscreen-exit': FullscreenExitIcon,
  fullscreen: FullscreenIcon,
  hand: HandIcon,
  highlight: HighlightIcon,
  italic: ItalicIcon,
  line: LineIcon,
  marquee: MarqueeIcon,
  'menu-dots': MenuDotsIcon,
  menu: MenuIcon,
  pen: PenIcon,
  photo: PhotoIcon,
  plus: PlusIcon,
  pointer: PointerIcon,
  polygon: PolygonIcon,
  polyline: PolylineIcon,
  print: PrintIcon,
  'redact-area': RedactAreaIcon,
  'redact-text': RedactTextIcon,
  redo: RedoIcon,
  refresh: RefreshIcon,
  'rotate-left': RotateLeftIcon,
  'rotate-right': RotateRightIcon,
  screenshot: ScreenshotIcon,
  search: SearchIcon,
  'search-minus': SearchMinusIcon,
  'search-plus': SearchPlusIcon,
  settings: SettingsIcon,
  sidebar: SidebarIcon,
  'single-page': SinglePageIcon,
  square: SquareIcon,
  squares: SquaresIcon,
  squiggly: SquigglyIcon,
  strikethrough: StrikethroughIcon,
  text: TextIcon,
  thumbnails: ThumbnailsIcon,
  trash: TrashIcon,
  underline: UnderlineIcon,
  undo: UndoIcon,
  zigzag: ZigzagIcon,
  'zoom-chevron-down': ZoomChevronDownIcon,
} as const;

// Extract valid keys for Type Safety
export type IconName = keyof typeof iconRegistry;
