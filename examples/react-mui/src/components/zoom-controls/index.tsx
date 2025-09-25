import { useZoom } from '@embedpdf/plugin-zoom/react';
import {
  IconButton,
  Typography,
  Box,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  SvgIconTypeMap,
} from '@mui/material';
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import RemoveCircleOutlineOutlinedIcon from '@mui/icons-material/RemoveCircleOutlineOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import WidthNormalIcon from '@mui/icons-material/WidthNormal';
import WidthFullIcon from '@mui/icons-material/WidthFull';
import CropFreeOutlinedIcon from '@mui/icons-material/CropFreeOutlined';
import ZoomInOutlinedIcon from '@mui/icons-material/ZoomInOutlined';
import ZoomOutOutlinedIcon from '@mui/icons-material/ZoomOutOutlined';
import { useState, MouseEvent, Fragment } from 'react';
import { ZoomLevel, ZoomMode } from '@embedpdf/plugin-zoom';
import { OverridableComponent } from '@mui/material/OverridableComponent';
import { useInteractionManager } from '@embedpdf/plugin-interaction-manager/react';
import { ToggleIconButton } from '../toggle-icon-button';
import { useIsMobile } from '../../hooks/use-is-mobile';

interface ZoomModeItem {
  value: ZoomLevel;
  label: string;
  icon: OverridableComponent<SvgIconTypeMap<{}, 'svg'>> & {
    muiName: string;
  };
}

interface ZoomPresetItem {
  value: number;
  label: string;
}

const ZOOM_PRESETS: ZoomPresetItem[] = [
  { value: 0.5, label: '50%' },
  { value: 1, label: '100%' },
  { value: 1.5, label: '150%' },
  { value: 2, label: '200%' },
  { value: 4, label: '400%' },
  { value: 8, label: '800%' },
  { value: 16, label: '1600%' },
];

const ZOOM_MODES: ZoomModeItem[] = [
  { value: ZoomMode.FitPage, label: 'Fit to Page', icon: WidthNormalIcon },
  { value: ZoomMode.FitWidth, label: 'Fit to Width', icon: WidthFullIcon },
] as const;

export const ZoomControls = () => {
  const { state, provides } = useZoom();
  const { state: interactionManagerState } = useInteractionManager();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);
  const isMobile = useIsMobile();

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleSelect = (value: ZoomLevel) => {
    provides?.requestZoom(value);
    handleClose();
  };

  const handleToggleMarqueeZoom = () => {
    provides?.toggleMarqueeZoom();
    handleClose();
  };

  const handleZoomIn = () => {
    provides?.zoomIn();
    handleClose();
  };

  const handleZoomOut = () => {
    provides?.zoomOut();
    handleClose();
  };

  const zoomPercentage = Math.round(state.currentZoomLevel * 100);

  return (
    <Fragment>
      {isMobile ? (
        <ToggleIconButton isOpen={open} sx={{ color: 'white', p: 0.4 }} onClick={handleClick}>
          <AddCircleOutlineOutlinedIcon fontSize="small" />
        </ToggleIconButton>
      ) : (
        <Box
          sx={{
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 1,
            pl: 1,
            pr: 0.3,
            py: 0.3,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          <Typography variant="body2" sx={{ color: 'white', fontWeight: 500 }}>
            {zoomPercentage}%
          </Typography>
          <ToggleIconButton isOpen={open} sx={{ color: 'white', p: 0.4 }} onClick={handleClick}>
            <KeyboardArrowDownIcon fontSize="small" />
          </ToggleIconButton>
          <IconButton
            onClick={handleZoomOut}
            edge="start"
            size="small"
            sx={{ color: 'white', p: 0.4 }}
            aria-label="zoom out"
          >
            <RemoveCircleOutlineOutlinedIcon fontSize="small" />
          </IconButton>
          <IconButton
            onClick={handleZoomIn}
            edge="start"
            size="small"
            sx={{ color: 'white', p: 0.4 }}
            aria-label="zoom in"
          >
            <AddCircleOutlineOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      )}
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
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
        <MenuItem onClick={handleZoomIn}>
          <ListItemIcon>
            <ZoomInOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Zoom In</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleZoomOut}>
          <ListItemIcon>
            <ZoomOutOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Zoom Out</ListItemText>
        </MenuItem>
        <Divider />
        {ZOOM_PRESETS.map(({ value, label }) => (
          <MenuItem
            key={value}
            onClick={() => handleSelect(value)}
            selected={Math.abs(state.currentZoomLevel - value) < 0.01}
          >
            {label}
          </MenuItem>
        ))}
        <Divider />
        {ZOOM_MODES.map(({ value, label, icon: Icon }) => (
          <MenuItem
            key={value}
            onClick={() => handleSelect(value)}
            selected={state.zoomLevel === value}
          >
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{label}</ListItemText>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem
          onClick={handleToggleMarqueeZoom}
          selected={interactionManagerState.activeMode === 'marqueeZoom'}
        >
          <ListItemIcon>
            <CropFreeOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Marquee Zoom</ListItemText>
        </MenuItem>
      </Menu>
    </Fragment>
  );
};
