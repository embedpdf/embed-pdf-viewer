import { h } from 'preact';
import { useInteractionManagerCapability } from '@embedpdf/plugin-interaction-manager/preact';
import { useEffect, useState } from 'preact/hooks';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';

interface HintState {
  show: boolean;
  mode: 'marqueeZoom' | 'marqueeCapture' | null;
  isAnimating: boolean;
}

export interface HintLayerProps {
  documentId: string;
}

export const HintLayer = ({ documentId }: HintLayerProps) => {
  const { provides: interactionManager } = useInteractionManagerCapability();
  const [hint, setHint] = useState<HintState>({
    show: false,
    mode: null,
    isAnimating: false,
  });
  const { translate } = useTranslations(documentId);

  useEffect(() => {
    if (!interactionManager) return;

    return interactionManager.onModeChange(({ activeMode }) => {
      if (activeMode === 'marqueeZoom' || activeMode === 'marqueeCapture') {
        // Show hint for these modes
        setHint({
          show: true,
          mode: activeMode,
          isAnimating: true,
        });

        // Hide hint after 3 seconds
        const timeout = setTimeout(() => {
          setHint((prev) => ({ ...prev, show: false }));
        }, 3000);

        return () => clearTimeout(timeout);
      } else {
        // Hide hint immediately when switching away from these modes
        setHint({
          show: false,
          mode: null,
          isAnimating: false,
        });
      }
    });
  }, [interactionManager]);

  const handleAnimationEnd = () => {
    if (!hint.show) {
      setHint((prev) => ({ ...prev, isAnimating: false, mode: null }));
    }
  };

  if (!hint.show && !hint.isAnimating) return null;

  const hintText =
    hint.mode === 'marqueeZoom' ? translate('zoom.dragTip') : translate('capture.dragTip');

  const hintColor = hint.mode === 'marqueeZoom' ? 'rgba(33,150,243,0.8)' : 'rgba(76,175,80,0.8)';

  return (
    <div
      className={`hint-overlay ${hint.show ? 'hint-show' : 'hint-hide'}`}
      onAnimationEnd={handleAnimationEnd}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Animated hint text */}
      <div
        className="hint-text"
        style={{
          background: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          textAlign: 'center',
          maxWidth: '250px',
        }}
      >
        {hintText}
      </div>

      {/* Animated drag demonstration */}
      <div
        className="drag-demo"
        style={{
          position: 'relative',
          width: '150px',
          height: '100px',
        }}
      >
        {/* Static rectangle outline */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            width: '110px',
            height: '60px',
            border: `2px dashed ${hintColor}`,
            borderRadius: '4px',
            opacity: 0.6,
          }}
        />

        {/* Animated growing rectangle */}
        <div
          className="animated-rect"
          style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            border: `2px solid ${hintColor}`,
            backgroundColor: `${hintColor.replace('0.8', '0.15')}`,
            borderRadius: '4px',
          }}
        />

        {/* Realistic mouse cursor */}
        <div
          className="cursor-demo"
          style={{
            position: 'absolute',
            width: '20px',
            height: '20px',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Cursor shadow */}
            <path
              d="M3.5 2.5L16.5 10L10 11.5L7.5 16.5L3.5 2.5Z"
              fill="rgba(0,0,0,0.3)"
              transform="translate(1,1)"
            />
            {/* Main cursor */}
            <path d="M3 2L16 10L10 11.5L7.5 16L3 2Z" fill="white" stroke="black" strokeWidth="1" />
            {/* Cursor highlight */}
            <path d="M4 3.5L13.5 9.5L9.5 10.5L7.5 14L4 3.5Z" fill="rgba(255,255,255,0.8)" />
          </svg>
        </div>
      </div>

      <style jsx>{`
        .hint-overlay {
          animation-duration: 0.3s;
          animation-fill-mode: both;
        }

        .hint-show {
          animation-name: hintFadeIn;
        }

        .hint-hide {
          animation-name: hintFadeOut;
        }

        @keyframes hintFadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes hintFadeOut {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(-10px);
          }
        }

        .animated-rect {
          animation: rectGrow 2s ease-in-out infinite;
        }

        @keyframes rectGrow {
          0% {
            width: 0;
            height: 0;
          }
          50% {
            width: 110px;
            height: 60px;
          }
          100% {
            width: 110px;
            height: 60px;
            opacity: 0.7;
          }
        }

        .cursor-demo {
          animation: cursorMove 2s ease-in-out infinite;
        }

        @keyframes cursorMove {
          0% {
            top: 20px;
            left: 20px;
          }
          50% {
            top: 50px;
            left: 80px;
          }
          100% {
            top: 80px;
            left: 130px;
          }
        }

        .hint-text {
          animation: textPulse 0.6s ease-in-out;
        }

        @keyframes textPulse {
          0% {
            transform: scale(0.9);
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
