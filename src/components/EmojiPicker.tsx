import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useTheme } from 'next-themes';

// emoji-mart is ~200KB gzipped — only load it when the user actually opens
// the picker. Keeps it out of the initial bundle so the matches view loads
// faster on first visit.
const EmojiMartPicker = lazy(async () => {
  const [{ default: data }, mod] = await Promise.all([
    import('@emoji-mart/data'),
    import('@emoji-mart/react'),
  ]);
  // Wrapper that already has the data + sensible defaults applied so the
  // outer Suspense boundary doesn't need to know about the emoji-mart shape.
  return {
    default: (props: { onSelect: (emoji: { native: string }) => void; theme: 'light' | 'dark' }) => {
      const Picker = mod.default;
      return (
        <Picker
          data={data}
          onEmojiSelect={props.onSelect}
          theme={props.theme}
          previewPosition="none"
          skinTonePosition="search"
        />
      );
    },
  };
});

interface EmojiPickerProps {
  /** Current selection, rendered as the trigger label. */
  value: string;
  /** Called when the user picks an emoji (fires once per selection, closes the dialog). */
  onChange: (emoji: string) => void;
  /**
   * Accepted for API compatibility — the old hand-rolled picker showed a
   * quick-picks row; the full emoji-mart picker superseded it (it has
   * frequents built in). LeaguesView still passes this.
   */
  quickPicks?: string[];
}

// Custom portal modal, NOT Radix Dialog. Two field-reported bugs forced
// the switch (June 2026):
//   1. Category scrolling was dead on touch devices — emoji-mart's
//      scroller lives inside a shadow root, so Radix's
//      react-remove-scroll couldn't recognise it as scrollable and
//      cancelled every touchmove. Same failure class as the player
//      picker (see PlayerPicker.tsx), same cure: plain portal + native
//      scrolling.
//   2. Radix DialogContent's built-in close X overlapped emoji-mart's
//      last category icon (flags). Here the X sits in its own bar above
//      the picker, so it can't collide.
export const EmojiPicker = ({ value, onChange }: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  // Manual body-scroll-lock while open — position-fix the body at its
  // current scrollY (mirrors PlayerPicker; overflow:hidden alone doesn't
  // stop iOS WebView rubber-band scrolling).
  const savedScrollYRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    savedScrollYRef.current = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollYRef.current}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, savedScrollYRef.current);
    };
  }, [open]);

  const handleSelect = (emoji: { native: string }) => {
    onChange(emoji.native);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Change avatar emoji"
        onClick={() => setOpen(true)}
        className="mx-auto w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-3xl"
      >
        {value || '👤'}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/80"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Choose an avatar emoji"
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-stretch"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close bar ABOVE the picker — can't overlap the category
                  icons the way the old overlaid X did. */}
              <div className="flex justify-end mb-2">
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-[75dvh] overflow-hidden rounded-lg" style={{ touchAction: 'pan-y' }}>
                <Suspense
                  fallback={
                    <div className="bg-popover text-popover-foreground rounded-lg w-[352px] h-[420px] flex items-center justify-center">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  }
                >
                  <EmojiMartPicker
                    onSelect={handleSelect}
                    theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
                  />
                </Suspense>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
