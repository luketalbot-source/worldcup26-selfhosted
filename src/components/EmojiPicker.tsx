import { useState } from 'react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Smile } from 'lucide-react';
import { useTheme } from 'next-themes';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  quickPicks?: string[];
}

export const EmojiPicker = ({ 
  value, 
  onChange, 
  quickPicks = ['👤', '⚽', '🏆', '🎯', '🌟', '🔥', '💪', '🦁', '🐯', '🦅', '👑', '⚡', '🎮', '🏅', '🥇']
}: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const { resolvedTheme } = useTheme();

  const handleEmojiSelect = (emoji: { native: string }) => {
    onChange(emoji.native);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      {/* Current selection display */}
      <div className="w-20 h-20 rounded-full bg-white/20 border-2 border-white/50 flex items-center justify-center mx-auto text-4xl">
        {value}
      </div>
      
      {/* Quick pick emojis */}
      <div className="space-y-2">
        <label className="text-xs text-white/70 block text-center">Tap to select</label>
        <div className="flex flex-wrap justify-center gap-2">
          {quickPicks.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange(emoji)}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
                value === emoji 
                  ? 'bg-white/40 ring-2 ring-white scale-110' 
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Emoji picker button */}
      <div className="text-center">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/20 border-white/30 text-white hover:bg-white/30 hover:text-white"
            >
              <Smile className="w-4 h-4 mr-2" />
              Browse all emojis
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            className="w-auto p-0 border-0 bg-transparent shadow-none" 
            side="bottom"
            align="center"
            sideOffset={8}
          >
            <Picker 
              data={data} 
              onEmojiSelect={handleEmojiSelect}
              theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
              previewPosition="none"
              skinTonePosition="search"
              maxFrequentRows={2}
            />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};
