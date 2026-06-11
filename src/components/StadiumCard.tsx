// Stadium info popup — opened by tapping the venue pill on a match
// card. Variant A from the mockup (/tmp/stadium-card.html, June 2026):
// full-bleed photo hero with the name overlaid, stat chips, short
// description, and the CC photo credit (license requirement for the
// vendored Wikimedia images).
//
// Radix Dialog per the Navigation.tsx terms-dialog pattern: native
// overflow scrolling (never ScrollArea — it swallows touch events in
// the iOS WebView), touchAction pan-y. The photo lazy-loads only when
// the dialog mounts, so the match list never fetches stadium images.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, CalendarDays } from 'lucide-react';
import type { Stadium } from '@/data/stadiums';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface StadiumCardProps {
  stadium: Stadium;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StadiumCard = ({ stadium, open, onOpenChange }: StadiumCardProps) => {
  const { t, i18n } = useTranslation();
  const [imgFailed, setImgFailed] = useState(false);

  const description = t(`stadium.descriptions.${stadium.slug}`, { defaultValue: '' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] p-0 gap-0 !flex flex-col overflow-hidden">
        {/* Photo hero. The name overlays a bottom gradient so it stays
            readable on any image; if the photo fails (or is missing)
            we keep the same header block on a navy gradient with a
            stadium glyph — the card must work photo-less. */}
        <div className="relative h-44 shrink-0 bg-gradient-to-br from-slate-800 to-slate-950">
          {!imgFailed && (
            <img
              src={stadium.image}
              alt={stadium.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {imgFailed && (
            <div className="absolute inset-0 flex items-center justify-center text-6xl" aria-hidden>
              🏟️
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <DialogHeader className="absolute bottom-3 left-4 right-4 space-y-0.5 text-left">
            <DialogTitle className="text-xl font-extrabold text-white drop-shadow" translate="no">
              {stadium.name}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-200">
              📍 {stadium.city}, {t(`stadium.country.${stadium.country}`)}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Facts + description — native scroll for short screens. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3"
          style={{ touchAction: 'pan-y' }}
        >
          <div className="flex gap-2 text-xs flex-wrap">
            <span className="inline-flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-foreground">
              <Users className="w-3.5 h-3.5 text-primary" />
              {stadium.capacity.toLocaleString(i18n.language)}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-foreground">
              <CalendarDays className="w-3.5 h-3.5 text-primary" />
              {t('stadium.opened')} {stadium.opened}
            </span>
          </div>

          {description && (
            <p className="text-sm text-foreground/90 leading-relaxed">{description}</p>
          )}

          <p className="text-[10px] text-muted-foreground/70">
            {t('stadium.photoCredit')}: {stadium.photoCredit}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};
