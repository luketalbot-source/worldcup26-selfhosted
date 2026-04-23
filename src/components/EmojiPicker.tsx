import { useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useTheme } from 'next-themes';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface EmojiPickerProps {
  /** Current selection, rendered as the trigger label. */
  value: string;
  /** Called when the user picks an emoji (fires once per selection, closes the dialog). */
  onChange: (emoji: string) => void;
}

// Thin wrapper around @emoji-mart/react. Preserves the { value, onChange }
// contract the old hand-rolled picker used, so ProfileView and any other
// consumer works unchanged. Picks up the app's light/dark theme so the
// picker's chrome doesn't clash with the surrounding card.
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

      {/* Override DialogContent padding so the picker extends edge-to-edge. */}
      <DialogContent className="p-0 bg-transparent border-0 shadow-none max-w-fit w-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Choose an avatar emoji</DialogTitle>
        </DialogHeader>
        <Picker
          data={data}
          onEmojiSelect={handleSelect}
          theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
          previewPosition="none"
          skinTonePosition="search"
        />
      </DialogContent>
    </Dialog>
  );
};
