import { AppBar, Toolbar as MuiToolbar } from '@mui/material';
import TextFieldsOutlinedIcon from '@mui/icons-material/TextFieldsOutlined';
import GestureOutlinedIcon from '@mui/icons-material/GestureOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CircleOutlinedIcon from '@mui/icons-material/CircleOutlined';
import SquareOutlinedIcon from '@mui/icons-material/SquareOutlined';
import NorthEastOutlinedIcon from '@mui/icons-material/NorthEastOutlined';
import { AnnotationTool, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useEffect, useState } from 'react';
import { ToggleIconButton } from '../toggle-icon-button';

export const AnnotationToolbar = () => {
  const { provides: annotationProvider } = useAnnotationCapability();
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);

  useEffect(() => {
    if (!annotationProvider) return;

    // Initialize current tool on mount
    setActiveTool(annotationProvider.getActiveTool());

    // Subscribe to changes
    return annotationProvider.onActiveToolChange((tool) => {
      setActiveTool(tool);
    });
  }, [annotationProvider]);

  const handleFreeTextAnnotation = () => {
    if (!annotationProvider) return;
    const currentId = activeTool?.id ?? null;
    annotationProvider.setActiveTool(currentId === 'freeText' ? null : 'freeText');
  };

  const handleInkAnnotation = () => {
    if (!annotationProvider) return;
    const currentId = activeTool?.id ?? null;
    annotationProvider.setActiveTool(currentId === 'ink' ? null : 'ink');
  };

  const handleCircleAnnotation = () => {
    if (!annotationProvider) return;
    const currentId = activeTool?.id ?? null;
    annotationProvider.setActiveTool(currentId === 'circle' ? null : 'circle');
  };

  const handleSquareAnnotation = () => {
    if (!annotationProvider) return;
    const currentId = activeTool?.id ?? null;
    annotationProvider.setActiveTool(currentId === 'square' ? null : 'square');
  };

  const handleLineArrowAnnotation = () => {
    if (!annotationProvider) return;
    const currentId = activeTool?.id ?? null;
    annotationProvider.setActiveTool(currentId === 'lineArrow' ? null : 'lineArrow');
  };

  const handleStampApprovedAnnotation = () => {
    if (!annotationProvider) return;
    const currentId = activeTool?.id ?? null;
    annotationProvider.setActiveTool(currentId === 'stampApproved' ? null : 'stampApproved');
  };

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      sx={{ borderBottom: '1px solid #cfd4da' }}
    >
      <MuiToolbar
        variant="dense"
        disableGutters
        sx={{ gap: 1.5, px: 1.5, justifyContent: 'center' }}
      >
        <ToggleIconButton
          tone="light"
          isOpen={activeTool?.id === 'freeText'}
          onClick={handleFreeTextAnnotation}
          aria-label="Text annotation"
        >
          <TextFieldsOutlinedIcon fontSize="small" />
        </ToggleIconButton>
        <ToggleIconButton
          tone="light"
          isOpen={activeTool?.id === 'ink'}
          onClick={handleInkAnnotation}
          aria-label="Freehand annotation"
        >
          <GestureOutlinedIcon fontSize="small" />
        </ToggleIconButton>
        <ToggleIconButton
          tone="light"
          isOpen={activeTool?.id === 'circle'}
          onClick={handleCircleAnnotation}
          aria-label="Circle annotation"
        >
          <CircleOutlinedIcon fontSize="small" />
        </ToggleIconButton>
        <ToggleIconButton
          tone="light"
          isOpen={activeTool?.id === 'square'}
          onClick={handleSquareAnnotation}
          aria-label="Square annotation"
        >
          <SquareOutlinedIcon fontSize="small" />
        </ToggleIconButton>
        <ToggleIconButton
          tone="light"
          isOpen={activeTool?.id === 'lineArrow'}
          onClick={handleLineArrowAnnotation}
          aria-label="Line arrow annotation"
        >
          <NorthEastOutlinedIcon fontSize="small" />
        </ToggleIconButton>
        <ToggleIconButton
          tone="light"
          isOpen={activeTool?.id === 'stampApproved'}
          onClick={handleStampApprovedAnnotation}
          aria-label="Stamp approved"
        >
          <CheckCircleOutlinedIcon fontSize="small" />
        </ToggleIconButton>
      </MuiToolbar>
    </AppBar>
  );
};
