import {
  IconButtonProps as MuiIconButtonProps,
  IconButton as MuiIconButton,
  alpha,
} from '@mui/material';

interface ToggleIconButtonProps extends MuiIconButtonProps {
  isOpen: boolean;
  // Extend with MUI's IconButton props if needed
  children: React.ReactNode;
  tone?: 'dark' | 'light';
}

export const ToggleIconButton: React.FC<ToggleIconButtonProps> = ({
  isOpen,
  tone = 'dark',
  children,
  ...props
}) => {
  return (
    <MuiIconButton
      edge="start"
      size={'small'}
      aria-pressed={isOpen}
      {...props}
      sx={{
        ...(tone === 'dark'
          ? {
              bgcolor: isOpen ? (theme) => alpha(theme.palette.common.white, 0.24) : 'transparent',
              '&:hover': {
                bgcolor: (theme) => alpha(theme.palette.common.white, 0.16),
              },
              color: 'white',
            }
          : {
              bgcolor: isOpen ? (theme) => alpha(theme.palette.text.primary, 0.1) : 'transparent',
              '&:hover': {
                bgcolor: (theme) => alpha(theme.palette.text.primary, 0.06),
              },
              color: (theme) => theme.palette.text.primary,
            }),
        transition: 'background-color 120ms',
        ...props.sx,
      }}
    >
      {children}
    </MuiIconButton>
  );
};
