import { Suspense, lazy, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

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
}

// Thin wrapper around @emoji-mart/react. Preserves the { value, onChange }
// contract the old hand-rolled picker used. Picks up the app's light/dark
// theme so the picker's chrome doesn't clash with the surrounding card.
export const EmojiPicker = ({ value, onChange }: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  const handleSelect = (emoji: { native: string }) => {
    onChange(emoji.native);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Change avatar emoji"
          className="mx-auto w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center text-3xl"
        >
          {value || '👤'}
        </button>
      </DialogTrigger>

      <DialogContent className="p-0 bg-transparent border-0 shadow-none max-w-fit w-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Choose an avatar emoji</DialogTitle>
        </DialogHeader>
        {/* Suspense boundary covers the lazy chunk download — shows a small
            spinner while the ~200KB emoji-mart bundle streams in on first
            open. Cached after that, so subsequent opens are instant. */}
        <Suspense
          fallback={
            <div className="bg-popover text-popover-foreground rounded-lg w-[352px] h-[420px] flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          {open && (
            <EmojiMartPicker
              onSelect={handleSelect}
              theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            />
          )}
        </Suspense>
      </DialogContent>
    </Dialog>
  );
};
