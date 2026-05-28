import { useCallback, useRef, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Slider,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useCapability } from '@embedpdf/core/react';
import { WatermarkPlugin } from '@embedpdf/plugin-watermark';

interface WatermarkPanelProps {
  documentId: string;
}

const FONT_OPTIONS = ['Helvetica', 'Times-Roman', 'Courier'];
type WatermarkVerticalAlignment = 'top' | 'center' | 'bottom';
type WatermarkHorizontalAlignment = 'left' | 'center' | 'right';
const VERTICAL_POSITION_OPTIONS: { value: WatermarkVerticalAlignment; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Centre' },
  { value: 'bottom', label: 'Bottom' },
];
const HORIZONTAL_POSITION_OPTIONS: { value: WatermarkHorizontalAlignment; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];
const DEFAULT_PAGE_SIZE = { width: 595, height: 842 };

function getAlignedOrigin(
  horizontal: WatermarkHorizontalAlignment,
  vertical: WatermarkVerticalAlignment,
  pageSize: { width: number; height: number },
  watermarkSize: { width: number; height: number },
): { x: number; y: number } {
  const x =
    horizontal === 'left'
      ? 0
      : horizontal === 'center'
        ? (pageSize.width - watermarkSize.width) / 2
        : pageSize.width - watermarkSize.width;

  const y =
    vertical === 'top'
      ? 0
      : vertical === 'center'
        ? (pageSize.height - watermarkSize.height) / 2
        : pageSize.height - watermarkSize.height;

  return { x, y };
}

export const WatermarkPanel = ({ documentId }: WatermarkPanelProps) => {
  void documentId;
  const { provides: watermarkCapability } = useCapability<WatermarkPlugin>(WatermarkPlugin.id);

  // Form state
  const [watermarkType, setWatermarkType] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [fontFamily, setFontFamily] = useState('Helvetica');
  const [colour, setColour] = useState('#FF0000');
  const [opacity, setOpacity] = useState(0.3);
  const [verticalPosition, setVerticalPosition] = useState<WatermarkVerticalAlignment>('center');
  const [horizontalPosition, setHorizontalPosition] =
    useState<WatermarkHorizontalAlignment>('center');
  const [width, setWidth] = useState(400);
  const [height, setHeight] = useState(80);
  const [rotation, setRotation] = useState(-45);
  const [imageData, setImageData] = useState<ArrayBuffer | null>(null);
  const [imageName, setImageName] = useState('');
  const [imageMimeType, setImageMimeType] = useState<'image/png' | 'image/jpeg'>('image/png');

  // Applied watermarks
  const [appliedWatermarks, setAppliedWatermarks] = useState<
    { id: string; label: string }[]
  >([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setImageData(reader.result as ArrayBuffer);
      setImageName(file.name);
      setImageMimeType(
        file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
      );
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleApplyWatermark = useCallback(() => {
    if (!watermarkCapability) return;

    if (watermarkType === 'text' && !text.trim()) return;
    if (watermarkType === 'image' && !imageData) return;

    const alignedOrigin = getAlignedOrigin(
      horizontalPosition,
      verticalPosition,
      DEFAULT_PAGE_SIZE,
      { width, height },
    );

    const input =
      watermarkType === 'text'
        ? {
            type: 'text' as const,
            textOptions: { text, fontSize, fontFamily, colour },
            position: alignedOrigin,
            alignment: { vertical: verticalPosition, horizontal: horizontalPosition },
            size: { width, height },
            opacity,
            rotation,
            pageRange: 'all' as const,
            readOnly: true,
            printable: true,
          }
        : {
            type: 'image' as const,
            imageOptions: { data: imageData!, mimeType: imageMimeType },
            position: alignedOrigin,
            alignment: { vertical: verticalPosition, horizontal: horizontalPosition },
            size: { width, height },
            opacity,
            rotation,
            pageRange: 'all' as const,
            readOnly: true,
            printable: true,
          };

    watermarkCapability.addWatermark(input).wait(
      (id) => {
        const label =
          watermarkType === 'text' ? `Text: "${text}"` : `Image: ${imageName}`;
        setAppliedWatermarks((prev) => [...prev, { id, label }]);
      },
      () => {
        // Failed silently
      },
    );
  }, [
    watermarkCapability,
    watermarkType,
    text,
    fontSize,
    fontFamily,
    colour,
    opacity,
    verticalPosition,
    horizontalPosition,
    width,
    height,
    rotation,
    imageData,
    imageName,
    imageMimeType,
  ]);

  return (
    <Box sx={{ p: 2, height: '100%', overflow: 'auto' }}>
      <Typography variant="h6" gutterBottom>
        Watermark
      </Typography>

      {/* Watermark type selection */}
      <FormControl component="fieldset" sx={{ mb: 2 }}>
        <RadioGroup
          row
          value={watermarkType}
          onChange={(e) => setWatermarkType(e.target.value as 'text' | 'image')}
        >
          <FormControlLabel value="text" control={<Radio size="small" />} label="Text" />
          <FormControlLabel value="image" control={<Radio size="small" />} label="Image" />
        </RadioGroup>
      </FormControl>

      {/* Text-specific options */}
      {watermarkType === 'text' && (
        <Stack spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            size="small"
            fullWidth
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Font</InputLabel>
            <Select
              value={fontFamily}
              label="Font"
              onChange={(e) => setFontFamily(e.target.value)}
            >
              {FONT_OPTIONS.map((f) => (
                <MenuItem key={f} value={f}>
                  {f}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Font Size"
            type="number"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            size="small"
            fullWidth
            slotProps={{ htmlInput: { min: 8, max: 200 } }}
          />
          <Box>
            <Typography variant="caption" color="text.secondary">
              Colour
            </Typography>
            <input
              type="color"
              value={colour}
              onChange={(e) => setColour(e.target.value)}
              style={{ width: '100%', height: 32, border: 'none', cursor: 'pointer' }}
            />
          </Box>
        </Stack>
      )}

      {/* Image-specific options */}
      {watermarkType === 'image' && (
        <Stack spacing={2} sx={{ mb: 2 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => fileInputRef.current?.click()}
          >
            {imageName || 'Choose Image…'}
          </Button>
          {imageName && (
            <Typography variant="caption" color="text.secondary">
              {imageName}
            </Typography>
          )}
        </Stack>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Common settings */}
      <Stack spacing={2}>
        <Box>
          <Typography variant="caption" color="text.secondary">
            Opacity: {Math.round(opacity * 100)}%
          </Typography>
          <Slider
            value={opacity}
            onChange={(_, v) => setOpacity(v as number)}
            min={0.05}
            max={1}
            step={0.05}
            size="small"
          />
        </Box>

        <Box>
          <Typography variant="caption" color="text.secondary">
            Rotation: {rotation}°
          </Typography>
          <Slider
            value={rotation}
            onChange={(_, v) => setRotation(v as number)}
            min={-180}
            max={180}
            step={5}
            size="small"
          />
        </Box>

        <Typography variant="subtitle2" color="text.secondary">
          Position
        </Typography>
        <Stack direction="row" spacing={1}>
          <FormControl size="small" fullWidth>
            <InputLabel>Vertical</InputLabel>
            <Select
              value={verticalPosition}
              label="Vertical"
              onChange={(e) => setVerticalPosition(e.target.value as WatermarkVerticalAlignment)}
            >
              {VERTICAL_POSITION_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel>Horizontal</InputLabel>
            <Select
              value={horizontalPosition}
              label="Horizontal"
              onChange={(e) =>
                setHorizontalPosition(e.target.value as WatermarkHorizontalAlignment)
              }
            >
              {HORIZONTAL_POSITION_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        <Typography variant="subtitle2" color="text.secondary">
          Size (PDF points)
        </Typography>
        <Stack direction="row" spacing={1}>
          <TextField
            label="Width"
            type="number"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
            size="small"
          />
          <TextField
            label="Height"
            type="number"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            size="small"
          />
        </Stack>
      </Stack>

      <Button
        variant="contained"
        fullWidth
        startIcon={<AddIcon />}
        onClick={handleApplyWatermark}
        disabled={
          !watermarkCapability ||
          (watermarkType === 'text' && !text.trim()) ||
          (watermarkType === 'image' && !imageData)
        }
        sx={{ mt: 3 }}
      >
        Apply Watermark
      </Button>

      {/* Applied watermarks list */}
      {appliedWatermarks.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Applied Watermarks
          </Typography>
          <Stack spacing={1}>
            {appliedWatermarks.map((w) => (
              <Box
                key={w.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                  {w.label}
                </Typography>
                <CheckCircleOutlineIcon fontSize="small" color="success" />
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
};



