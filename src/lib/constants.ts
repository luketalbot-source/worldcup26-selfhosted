// Languages the predictor app supports. Order here drives the order
// users see in the in-app language picker (ProfileView). Keep alphabetical
// by `name` so the long form list (now 14 entries) scans naturally.
//
// Country flags chosen for the *language* identity, not the codomain of
// speakers — e.g. Portuguese uses the Brazilian flag because that's our
// primary Portuguese-speaking customer base, not Portugal.
export const languages = [
  { code: 'bg', name: 'Български',  flag: '🇧🇬' },
  { code: 'hr', name: 'Hrvatski',   flag: '🇭🇷' },
  { code: 'cs', name: 'Čeština',    flag: '🇨🇿' },
  { code: 'de', name: 'Deutsch',    flag: '🇩🇪' },
  { code: 'en', name: 'English',    flag: '🇬🇧' },
  { code: 'es', name: 'Español',    flag: '🇪🇸' },
  { code: 'fr', name: 'Français',   flag: '🇫🇷' },
  { code: 'it', name: 'Italiano',   flag: '🇮🇹' },
  { code: 'hu', name: 'Magyar',     flag: '🇭🇺' },
  { code: 'pl', name: 'Polski',     flag: '🇵🇱' },
  { code: 'pt', name: 'Português',  flag: '🇧🇷' },
  { code: 'ro', name: 'Română',     flag: '🇷🇴' },
  { code: 'sk', name: 'Slovenčina', flag: '🇸🇰' },
  { code: 'sl', name: 'Slovenščina', flag: '🇸🇮' },
];
