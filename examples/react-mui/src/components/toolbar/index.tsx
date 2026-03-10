import { usePan } from '@embedpdf/plugin-pan/react';
import { useRotate } from '@embedpdf/plugin-rotate/react';
import { useSpread } from '@embedpdf/plugin-spread/react';
import MenuIcon from '@mui/icons-material/Menu';
import BackHandOutlinedIcon from '@mui/icons-material/BackHandOutlined';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import BookOutlinedIcon from '@mui/icons-material/BookOutlined';
import FullscreenOutlinedIcon from '@mui/icons-material/FullscreenOutlined';
import FullscreenExitOutlinedIcon from '@mui/icons-material/FullscreenExitOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import FileOpenOutlinedIcon from '@mui/icons-material/FileOpenOutlined';
import {
  Box,
  Divider,
  AppBar,
  Toolbar as MuiToolbar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Tabs,
  Tab,
} from '@mui/material';
import { useState, MouseEvent, SyntheticEvent } from 'react';

import { ZoomControls } from '../zoom-controls';
import { PageSettingsIcon } from '../../icons';
import { DrawerToggleButton } from '../drawer-system';
import { ToggleIconButton } from '../toggle-icon-button';
import { AnnotationToolbar } from './annotation-toolbar';
import { SpreadMode } from '@embedpdf/plugin-spread';
import { useFullscreen } from '@embedpdf/plugin-fullscreen/react';
import { useExportCapability } from '@embedpdf/plugin-export/react';
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react';
import { useIsMobile } from '../../hooks/use-is-mobile';
import { RedactToolbar } from './redact-toolbar';

interface ToolbarProps {
  documentId: string;
  onOpenSearchRedactionModal?: () => void;
}

export const Toolbar = ({ documentId, onOpenSearchRedactionModal }: ToolbarProps) => {
  const { provides: panProvider, isPanning } = usePan(documentId);
  const { provides: rotateProvider } = useRotate(documentId);
  const { spreadMode, provides: spreadProvider } = useSpread(documentId);
  const { provides: fullscreenProvider, state: fullscreenState } = useFullscreen();
  const { provides: exportCapability } = useExportCapability();
  const { provides: documentManager } = useDocumentManagerCapability();
  const isMobile = useIsMobile();

  // Get document-scoped API for export
  const exportProvider = exportCapability?.forDocument(documentId);

  // Menu state for page settings
  const [pageSettingsAnchorEl, setPageSettingsAnchorEl] = useState<null | HTMLElement>(null);
  const pageSettingsOpen = Boolean(pageSettingsAnchorEl);

  // Menu state for main menu
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchorEl);

  // View/Annotate mode
  const [mode, setMode] = useState<'view' | 'annotate' | 'redact'>('view');
  const handleModeChange = (_event: SyntheticEvent, value: 'view' | 'annotate' | 'redact') => {
    setMode(value);
  };

  const handleTogglePanMode = () => {
    panProvider?.togglePan();
  };

  const handleRotateForward = () => {
    rotateProvider?.rotateForward();
    setPageSettingsAnchorEl(null); // Close menu after action
  };

  const handleRotateBackward = () => {
    rotateProvider?.rotateBackward();
    setPageSettingsAnchorEl(null); // Close menu after action
  };

  const handlePageSettingsClick = (event: MouseEvent<HTMLElement>) => {
    setPageSettingsAnchorEl(event.currentTarget);
  };

  const handlePageSettingsClose = () => {
    setPageSettingsAnchorEl(null);
  };

  const handleMenuClick = (event: MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleSpreadModeChange = (mode: SpreadMode) => {
    spreadProvider?.setSpreadMode(mode);
    handlePageSettingsClose();
  };

  const handleFullscreenToggle = () => {
    fullscreenProvider?.toggleFullscreen();
    handlePageSettingsClose();
    handleMenuClose();
  };

  const handleDownload = () => {
    exportProvider?.download();
    handleMenuClose();
  };

  const handleOpenFilePicker = () => {
    documentManager?.openFileDialog();
    handleMenuClose();
  };

  return (
    <>
      <AppBar position="static">
        <MuiToolbar variant="dense" disableGutters sx={{ gap: 1.5, px: 1.5 }}>
          <ToggleIconButton isOpen={menuOpen} onClick={handleMenuClick}>
            <MenuIcon fontSize="small" />
          </ToggleIconButton>
          <Menu
            anchorEl={menuAnchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            disablePortal
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'left',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'left',
            }}
          >
            <MenuItem onClick={handleOpenFilePicker}>
              <ListItemIcon>
                <FileOpenOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Open File</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleDownload}>
              <ListItemIcon>
                <DownloadOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Download</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleFullscreenToggle}>
              <ListItemIcon>
                {fullscreenState.isFullscreen ? (
                  <FullscreenExitOutlinedIcon fontSize="small" />
                ) : (
                  <FullscreenOutlinedIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>
                {fullscreenState.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </ListItemText>
            </MenuItem>
          </Menu>
          <Divider
            orientation="vertical"
            flexItem
            sx={{ backgroundColor: 'white', my: 1.2, opacity: 0.5 }}
          />
          <DrawerToggleButton componentId="sidebar" />
          <ToggleIconButton isOpen={pageSettingsOpen} onClick={handlePageSettingsClick}>
            <PageSettingsIcon fontSize="small" />
          </ToggleIconButton>
          <Menu
            anchorEl={pageSettingsAnchorEl}
            open={pageSettingsOpen}
            onClose={handlePageSettingsClose}
            disablePortal
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'left',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'left',
            }}
          >
            <ListSubheader>Page Orientation</ListSubheader>
            <MenuItem onClick={handleRotateForward}>
              <ListItemIcon>
                <RotateRightIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Rotate Clockwise</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleRotateBackward}>
              <ListItemIcon>
                <RotateLeftIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Rotate Counter-clockwise</ListItemText>
            </MenuItem>
            <Divider />
            <ListSubheader>Page Layout</ListSubheader>
            <MenuItem
              onClick={() => handleSpreadModeChange(SpreadMode.None)}
              selected={spreadMode === SpreadMode.None}
            >
              <ListItemIcon>
                <DescriptionOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Single Page</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => handleSpreadModeChange(SpreadMode.Odd)}
              selected={spreadMode === SpreadMode.Odd}
            >
              <ListItemIcon>
                <MenuBookOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Odd Pages</ListItemText>
            </MenuItem>
            <MenuItem
              onClick={() => handleSpreadModeChange(SpreadMode.Even)}
              selected={spreadMode === SpreadMode.Even}
            >
              <ListItemIcon>
                <BookOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Even Pages</ListItemText>
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleFullscreenToggle}>
              <ListItemIcon>
                {fullscreenState.isFullscreen ? (
                  <FullscreenExitOutlinedIcon fontSize="small" />
                ) : (
                  <FullscreenOutlinedIcon fontSize="small" />
                )}
              </ListItemIcon>
              <ListItemText>
                {fullscreenState.isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </ListItemText>
            </MenuItem>
          </Menu>
          <Divider
            orientation="vertical"
            flexItem
            sx={{ backgroundColor: 'white', my: 1.2, opacity: 0.5 }}
          />
          <ZoomControls documentId={documentId} />
          {!isMobile && (
            <>
              <Divider
                orientation="vertical"
                flexItem
                sx={{ backgroundColor: 'white', my: 1.2, opacity: 0.5 }}
              />
              <ToggleIconButton isOpen={isPanning} onClick={handleTogglePanMode}>
                <BackHandOutlinedIcon fontSize="small" />
              </ToggleIconButton>
            </>
          )}
          <Box
            sx={{
              flexGrow: 1,
              display: 'flex',
              justifyContent: 'center',
              minWidth: 0, // Allow shrinking below content size
              overflow: 'hidden', // Prevent overflow
            }}
          >
            <Tabs
              value={mode}
              onChange={handleModeChange}
              textColor="inherit"
              variant="scrollable"
              scrollButtons="auto"
              allowScrollButtonsMobile
              slotProps={{
                indicator: { style: { backgroundColor: 'white', opacity: 0.7 } },
              }}
              sx={{
                minHeight: 32,
                maxWidth: '100%',
                '& .MuiTab-root': {
                  minHeight: 32,
                  paddingY: 0.5,
                  minWidth: 'auto',
                  fontSize: '0.875rem',
                },
                '& .MuiTabs-scrollButtons': {
                  '&.Mui-disabled': {
                    opacity: 0.3,
                  },
                },
              }}
            >
              <Tab label="View" value="view" />
              <Tab label="Annotate" value="annotate" />
              <Tab label="Redact" value="redact" />
            </Tabs>
          </Box>
          <DrawerToggleButton componentId="search" />
        </MuiToolbar>
      </AppBar>
      {mode === 'annotate' && documentId && <AnnotationToolbar documentId={documentId} />}
      {mode === 'redact' && documentId && <RedactToolbar documentId={documentId} onOpenSearchRedactionModal={onOpenSearchRedactionModal} />}
    </>
  );
};
