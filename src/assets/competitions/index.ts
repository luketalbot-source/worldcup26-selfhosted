// Competition banner art for the game-hub cards, keyed by the
// competitions row's FD code (season-independent — bl1-2027-28 reuses the
// same banner). Same illustrated style as the boost award images.
// Unknown codes fall back to the icon-tile card (no banner).
import bl1 from './bl1.jpg';
import cl from './cl.jpg';
import wc from './wc.jpg';
import pl from './pl.jpg';
import pd from './pd.jpg';
import el from './el.jpg';

export const competitionBanners: Record<string, string> = {
  BL1: bl1,
  CL: cl,
  WC: wc,
  PL: pl,
  PD: pd,
  EL: el,
};
