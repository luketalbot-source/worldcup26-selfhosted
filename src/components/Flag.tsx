// Drop-in replacement for the per-team flag *emoji*.
//
// Background: flag emojis (🇩🇪 etc.) are encoded as Regional Indicator
// pairs. They render natively on iOS/macOS as actual flags, on Android
// as flags (Noto font), and on Windows as two grey letters because
// Microsoft refused to ship flag glyphs for political reasons. That
// breakage was visible to ~30% of our customer base. Picker dropdowns
// listing "BR Brazil", "AR Argentina" instead of flags wasn't OK.
//
// Solution: `country-flag-icons` SVGs — same flag on every device, tiny
// (~2KB per flag), tree-shakeable since we import each one individually.
// All 48 WC qualifiers are mapped explicitly via TLA_TO_FLAG_ICONS_CODE
// (see lib/teamFlagCode.ts) including UK constituent nations
// (England → GB-ENG, Scotland → GB-SCT).

import { useState } from 'react';
import type { SVGProps } from 'react';
import { getFlagIconCode } from '@/lib/teamFlagCode';
import { getLocalFlagUrl } from '@/lib/flagAssets';

// 48 WC2026 qualifiers + a few legacy codes. Each import resolves to a
// React component for that flag's SVG. Tree-shaking keeps the bundle
// to only what's referenced from this file.
import AR from 'country-flag-icons/react/3x2/AR';
import AT from 'country-flag-icons/react/3x2/AT';
import AU from 'country-flag-icons/react/3x2/AU';
import BA from 'country-flag-icons/react/3x2/BA';
import BE from 'country-flag-icons/react/3x2/BE';
import BO from 'country-flag-icons/react/3x2/BO';
import BR from 'country-flag-icons/react/3x2/BR';
import CA from 'country-flag-icons/react/3x2/CA';
import CD from 'country-flag-icons/react/3x2/CD';
import CH from 'country-flag-icons/react/3x2/CH';
import CI from 'country-flag-icons/react/3x2/CI';
import CO from 'country-flag-icons/react/3x2/CO';
import CV from 'country-flag-icons/react/3x2/CV';
import CW from 'country-flag-icons/react/3x2/CW';
import CZ from 'country-flag-icons/react/3x2/CZ';
import DE from 'country-flag-icons/react/3x2/DE';
import DK from 'country-flag-icons/react/3x2/DK';
import DZ from 'country-flag-icons/react/3x2/DZ';
import EC from 'country-flag-icons/react/3x2/EC';
import EG from 'country-flag-icons/react/3x2/EG';
import ES from 'country-flag-icons/react/3x2/ES';
import FR from 'country-flag-icons/react/3x2/FR';
import GB_ENG from 'country-flag-icons/react/3x2/GB-ENG';
import GB_SCT from 'country-flag-icons/react/3x2/GB-SCT';
import GB_WLS from 'country-flag-icons/react/3x2/GB-WLS';
import GH from 'country-flag-icons/react/3x2/GH';
import HR from 'country-flag-icons/react/3x2/HR';
import HT from 'country-flag-icons/react/3x2/HT';
import IQ from 'country-flag-icons/react/3x2/IQ';
import IR from 'country-flag-icons/react/3x2/IR';
import IT from 'country-flag-icons/react/3x2/IT';
import JM from 'country-flag-icons/react/3x2/JM';
import JO from 'country-flag-icons/react/3x2/JO';
import JP from 'country-flag-icons/react/3x2/JP';
import KR from 'country-flag-icons/react/3x2/KR';
import MA from 'country-flag-icons/react/3x2/MA';
import MX from 'country-flag-icons/react/3x2/MX';
import NL from 'country-flag-icons/react/3x2/NL';
import NO from 'country-flag-icons/react/3x2/NO';
import NZ from 'country-flag-icons/react/3x2/NZ';
import PA from 'country-flag-icons/react/3x2/PA';
import PT from 'country-flag-icons/react/3x2/PT';
import PY from 'country-flag-icons/react/3x2/PY';
import QA from 'country-flag-icons/react/3x2/QA';
import SA from 'country-flag-icons/react/3x2/SA';
import SE from 'country-flag-icons/react/3x2/SE';
import SN from 'country-flag-icons/react/3x2/SN';
import TN from 'country-flag-icons/react/3x2/TN';
import TR from 'country-flag-icons/react/3x2/TR';
import UA from 'country-flag-icons/react/3x2/UA';
import US from 'country-flag-icons/react/3x2/US';
import UY from 'country-flag-icons/react/3x2/UY';
import UZ from 'country-flag-icons/react/3x2/UZ';
import ZA from 'country-flag-icons/react/3x2/ZA';

type FlagComponent = React.ComponentType<SVGProps<SVGSVGElement>>;

const FLAG_COMPONENTS: Record<string, FlagComponent> = {
  AR, AT, AU, BA, BE, BO, BR, CA, CD, CH, CI, CO, CV, CW, CZ, DE, DK, DZ,
  EC, EG, ES, FR, 'GB-ENG': GB_ENG, 'GB-SCT': GB_SCT, 'GB-WLS': GB_WLS,
  GH, HR, HT, IQ, IR, IT, JM, JO, JP, KR, MA, MX, NL, NO, NZ, PA, PT, PY,
  QA, SA, SE, SN, TN, TR, UA, US, UY, UZ, ZA,
};

interface FlagProps {
  /**
   * FIFA TLA code from `live_matches` / `useQualifiedTeams` (BRA, ENG,
   * GER, etc.). Mapped internally to the flag-icons key.
   */
  code: string | null | undefined;
  /**
   * Tailwind size class — explicit because SVG's natural size is huge
   * by default and would blow out picker layouts. Recommend something
   * like `w-4` (16px), `w-5` (20px), `w-6` (24px). Aspect 3:2.
   */
  className?: string;
  /**
   * Accessible label, falls back to the team code. The flag itself is
   * decorative when shown next to the team name, so this is `aria-label`
   * not a visible label.
   */
  label?: string;
  /**
   * Fill the parent container like CSS `object-fit: cover` — crops the
   * flag instead of letterboxing. Used by the match-card background
   * watermark, where the flag bleeds across half the card. (SVG
   * equivalent: preserveAspectRatio="xMidYMid slice".)
   */
  cover?: boolean;
  /**
   * Club crest URL (from teams.crest_url). When set, renders an <img>
   * instead of a country SVG. Club competitions pass this through
   * teamVisualProps().
   */
  crestUrl?: string | null;
  /**
   * 'country' (default) = bundled flag SVG with grey-flag fallback.
   * 'club' = crest image with an INITIALS-BADGE fallback — clubs must
   * NEVER fall back to a country flag: FD's TLA for FC Porto is 'POR',
   * which is Portugal's code, and a wrong national flag on a club card
   * is worse than no image. The kind comes from the competition's format
   * profile (teamKind), not from guessing by code.
   */
  kind?: 'country' | 'club';
}

/**
 * Render a country flag as a 3:2 SVG. Renders a neutral grey
 * placeholder for codes we don't have a flag for, so missing mappings
 * never crash the picker.
 *
 * These SVGs ship in the JS bundle (~1-3 KB each), so unlike the old
 * flagcdn.com <img> approach they can never fail to load — relevant for
 * frontline tenants whose corporate proxies block third-party CDNs.
 */
export const Flag = ({ code, className = 'w-5', label, cover = false, crestUrl, kind = 'country' }: FlagProps) => {
  const [crestFailed, setCrestFailed] = useState(false);

  // Club branch: crest image → initials badge. Never a country flag.
  if (kind === 'club') {
    if (crestUrl && !crestFailed) {
      return (
        <img
          src={crestUrl}
          alt=""
          role="img"
          aria-label={label ?? code ?? 'crest'}
          loading="lazy"
          decoding="async"
          onError={() => setCrestFailed(true)}
          // Crests are ~square; object-contain letterboxes non-square art
          // inside the box instead of stretching it.
          className={`inline-block ${cover ? 'object-cover' : 'object-contain'} ${className}`}
          style={cover ? undefined : { aspectRatio: '1 / 1' }}
        />
      );
    }
    // Initials badge — always works, even behind crest-blocking corporate
    // proxies (the exact failure mode that killed flagcdn.com here).
    return (
      <span
        role="img"
        aria-label={label ?? code ?? 'crest'}
        className={`inline-flex items-center justify-center rounded-full bg-muted font-bold text-muted-foreground select-none ${className}`}
        style={{ aspectRatio: '1 / 1', fontSize: '0.55em' }}
      >
        {(code ?? '?').slice(0, 3).toUpperCase()}
      </span>
    );
  }

  const iconCode = getFlagIconCode(code);
  const Component = iconCode ? FLAG_COMPONENTS[iconCode] : null;

  if (!Component) {
    return (
      <span
        role="img"
        aria-label={label ?? code ?? 'flag'}
        className={`inline-block bg-muted rounded-[2px] ${className}`}
        style={cover ? undefined : { aspectRatio: '3 / 2' }}
      />
    );
  }

  if (cover) {
    return (
      <Component
        role="img"
        aria-label={label ?? code ?? 'flag'}
        preserveAspectRatio="xMidYMid slice"
        className={className}
      />
    );
  }

  return (
    <Component
      role="img"
      aria-label={label ?? code ?? 'flag'}
      // rounded-[2px] mirrors how flag emojis read at small sizes —
      // crisp corners would look out of place next to the rest of the
      // (rounded) UI chrome. shadow-sm picks up the card outline lightly
      // so the SVG doesn't visually float when set against a coloured bg.
      className={`inline-block rounded-[2px] ${className}`}
    />
  );
};

/**
 * Match-card background flag: the detailed self-hosted PNG layered over
 * the bundled SVG. The SVG paints instantly (it's in the JS bundle) and
 * the PNG — same artwork the cards had in the flagcdn era, now served
 * from our own origin — replaces it seamlessly once streamed. If the
 * PNG somehow fails (or the code has no PNG), the SVG simply stays.
 * Both layers carry the same opacity so the swap is invisible.
 */
export const CardFlagBackground = ({
  code,
  label,
  crestUrl,
  kind = 'country',
}: {
  code: string | null | undefined;
  label?: string;
  crestUrl?: string | null;
  kind?: 'country' | 'club';
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const url = code ? getLocalFlagUrl(code) : null;

  // Club watermark: a full-bleed `cover` crest looks broken (transparent
  // PNGs stretched across half a card), so clubs get a large centered
  // crest at low opacity instead — cheap to composite on low-end frontline
  // devices (no blur), and nothing renders if the crest is missing (the
  // card just keeps its gradient).
  if (kind === 'club') {
    if (!crestUrl || imgFailed) return null;
    return (
      <div className="absolute inset-0 overflow-hidden flex items-center justify-center">
        <img
          src={crestUrl}
          alt=""
          aria-hidden
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="h-[140%] w-auto max-w-none object-contain opacity-[0.08] dark:opacity-[0.12]"
        />
      </div>
    );
  }

  // The 60% wash lives on the CONTAINER, not the layers. When each
  // layer carried its own opacity-60, the PNG was 40% see-through and
  // the simplified SVG ghosted through it (doubled Morocco star,
  // mismatched Haiti crest — customer screenshot, June 2026). With
  // full-opacity layers inside a translucent wrapper, the opaque PNG
  // completely hides the SVG underneath once it paints.
  return (
    <div className="absolute inset-0 opacity-60">
      <Flag code={code} label={label} cover className="absolute inset-0 w-full h-full" />
      {url && !imgFailed && (
        <img
          src={url}
          alt=""
          aria-hidden
          loading="lazy"
          onError={() => setImgFailed(true)}
          className="absolute inset-0 w-full h-full object-cover object-center"
        />
      )}
    </div>
  );
};
