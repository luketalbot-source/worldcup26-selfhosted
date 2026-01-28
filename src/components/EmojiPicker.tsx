import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Smile } from 'lucide-react';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  quickPicks?: string[];
}

// Lightweight built-in emoji set (keeps the app fast + avoids heavy emoji picker deps)
const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  {
    name: 'Faces',
    emojis: ['😀','😁','😂','🤣','😅','😊','😍','😎','🥳','😴','🤔','😮','😢','😭','😡','😇','🤩','😬','😶‍🌫️','🤯'],
  },
  {
    name: 'Sports',
    emojis: ['⚽','🏀','🏈','⚾','🎾','🏐','🏉','🏓','🏸','🥊','🥋','⛳','🏒','🏑','🏏','🛹','🏂','⛷️','🏊‍♂️','🚴‍♂️'],
  },
  {
    name: 'Awards',
    emojis: ['🏆','🏅','🥇','🥈','🥉','🎖️','🏵️','👑','🌟','✨','💫','🔥','⚡','💎','🎉','🎊','🎯','✅','💪','🙌'],
  },
  {
    name: 'Animals',
    emojis: ['🐶','🐱','🦁','🐯','🦊','🐻','🐼','🐨','🐸','🐵','🦅','🦉','🐺','🐗','🐮','🐷','🐴','🦄','🐙','🦈'],
  },
  {
    name: 'Food',
    emojis: ['🍕','🍔','🌮','🍟','🍿','🍣','🍜','🍱','🥗','🍦','🍩','🍪','🍫','🍎','🍉','🍌','🍓','🥑','☕','🍺'],
  },
  {
    name: 'Objects',
    emojis: ['🎮','📱','💻','⌚','🎧','📷','🎸','🎹','🎺','🧩','🧠','📌','📚','✏️','🖊️','🧭','🗺️','🚀','🛸','🪄'],
  },
];

export const EmojiPicker = ({ 
  value, 
  onChange, 
  quickPicks = ['👤', '⚽', '🏆', '🎯', '🌟', '🔥', '💪', '🦁', '🐯', '🦅', '👑', '⚡', '🎮', '🏅', '🥇']
}: EmojiPickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const allEmojis = useMemo(
    () => EMOJI_CATEGORIES.flatMap((c) => c.emojis),
    [],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allEmojis;
    // Simple search: match by known aliases we provide for common terms; otherwise fallback to no filter.
    const aliasMap: Record<string, string[]> = {
      ball: ['⚽','🏀','🏈','⚾','🎾','🏐'],
      trophy: ['🏆','🏅','🥇','🥈','🥉'],
      star: ['🌟','✨','💫'],
      fire: ['🔥'],
      lightning: ['⚡'],
      game: ['🎮'],
      phone: ['📱'],
      computer: ['💻'],
      rocket: ['🚀'],
      crown: ['👑'],
      lion: ['🦁'],
      eagle: ['🦅'],
      soccer: ['⚽'],
      football: ['🏈','⚽'],
    };
    const hits = Object.entries(aliasMap)
      .filter(([k]) => k.includes(q))
      .flatMap(([, v]) => v);
    return hits.length ? hits : allEmojis;
  }, [allEmojis, query]);

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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="bg-white/20 border-white/30 text-white hover:bg-white/30 hover:text-white"
              type="button"
            >
              <Smile className="w-4 h-4 mr-2" />
              Browse all emojis
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Pick an emoji</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search (e.g. trophy, ball, star)"
              />

              <div className="max-h-72 overflow-auto rounded-md border border-border bg-popover p-2">
                <div className="grid grid-cols-8 gap-1">
                  {filtered.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="h-9 w-9 rounded-md hover:bg-muted flex items-center justify-center text-xl"
                      onClick={() => {
                        onChange(emoji);
                        setOpen(false);
                        setQuery('');
                      }}
                      aria-label={`Select ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};
