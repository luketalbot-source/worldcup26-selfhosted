import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Phone } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const countryCodes = [
  { code: '+1', country: 'US', flag: '🇺🇸', name: 'United States' },
  { code: '+1', country: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France' },
  { code: '+34', country: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: '+39', country: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: '+351', country: 'PT', flag: '🇵🇹', name: 'Portugal' },
  { code: '+55', country: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: '+52', country: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: '+54', country: 'AR', flag: '🇦🇷', name: 'Argentina' },
  { code: '+57', country: 'CO', flag: '🇨🇴', name: 'Colombia' },
  { code: '+56', country: 'CL', flag: '🇨🇱', name: 'Chile' },
  { code: '+31', country: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: '+32', country: 'BE', flag: '🇧🇪', name: 'Belgium' },
  { code: '+41', country: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: '+43', country: 'AT', flag: '🇦🇹', name: 'Austria' },
  { code: '+46', country: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: '+47', country: 'NO', flag: '🇳🇴', name: 'Norway' },
  { code: '+45', country: 'DK', flag: '🇩🇰', name: 'Denmark' },
  { code: '+358', country: 'FI', flag: '🇫🇮', name: 'Finland' },
  { code: '+48', country: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: '+420', country: 'CZ', flag: '🇨🇿', name: 'Czech Republic' },
  { code: '+36', country: 'HU', flag: '🇭🇺', name: 'Hungary' },
  { code: '+30', country: 'GR', flag: '🇬🇷', name: 'Greece' },
  { code: '+353', country: 'IE', flag: '🇮🇪', name: 'Ireland' },
  { code: '+61', country: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: '+64', country: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
  { code: '+81', country: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: '+82', country: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: '+86', country: 'CN', flag: '🇨🇳', name: 'China' },
  { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India' },
  { code: '+971', country: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: '+966', country: 'SA', flag: '🇸🇦', name: 'Saudi Arabia' },
  { code: '+974', country: 'QA', flag: '🇶🇦', name: 'Qatar' },
  { code: '+27', country: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: '+20', country: 'EG', flag: '🇪🇬', name: 'Egypt' },
  { code: '+212', country: 'MA', flag: '🇲🇦', name: 'Morocco' },
  { code: '+90', country: 'TR', flag: '🇹🇷', name: 'Turkey' },
  { code: '+7', country: 'RU', flag: '🇷🇺', name: 'Russia' },
  { code: '+380', country: 'UA', flag: '🇺🇦', name: 'Ukraine' },
  { code: '+385', country: 'HR', flag: '🇭🇷', name: 'Croatia' },
];

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export const PhoneInput = ({
  value,
  onChange,
  placeholder = '123456789',
  className,
  autoFocus = false,
}: PhoneInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState(countryCodes[0]);
  const [localNumber, setLocalNumber] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse initial value to extract country code and number
  useEffect(() => {
    if (value && value.startsWith('+')) {
      // Find matching country code (longest match first)
      const sortedCodes = [...countryCodes].sort((a, b) => b.code.length - a.code.length);
      for (const country of sortedCodes) {
        if (value.startsWith(country.code)) {
          setSelectedCountry(country);
          setLocalNumber(value.slice(country.code.length).replace(/\s/g, ''));
          return;
        }
      }
    }
    // If no match, just strip spaces
    setLocalNumber(value.replace(/^\+/, '').replace(/\s/g, ''));
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLocalNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Remove spaces and non-numeric characters, then strip leading zeros
    const cleaned = e.target.value.replace(/\s/g, '').replace(/[^0-9]/g, '').replace(/^0+/, '');
    setLocalNumber(cleaned);
    onChange(`${selectedCountry.code}${cleaned}`);
  };

  const handleCountrySelect = (country: typeof countryCodes[0]) => {
    setSelectedCountry(country);
    setIsOpen(false);
    onChange(`${country.code}${localNumber}`);
    // Focus the input after selection
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className={cn("relative flex", className)}>
      {/* Country code dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 h-12 px-3 rounded-l-xl border border-r-0 border-input bg-muted/50 hover:bg-muted transition-colors"
        >
          <span className="text-lg">{selectedCountry.flag}</span>
          <span className="text-sm font-medium text-foreground">{selectedCountry.code}</span>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 max-h-60 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg z-50">
            {countryCodes.map((country) => (
              <button
                key={`${country.code}-${country.country}`}
                type="button"
                onClick={() => handleCountrySelect(country)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 hover:bg-muted transition-colors text-left",
                  selectedCountry.country === country.country && selectedCountry.code === country.code && "bg-muted"
                )}
              >
                <span className="text-lg">{country.flag}</span>
                <span className="flex-1 text-sm text-foreground">{country.name}</span>
                <span className="text-sm text-muted-foreground">{country.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Phone number input */}
      <div className="relative flex-1">
        <Input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          placeholder={placeholder}
          value={localNumber}
          onChange={handleLocalNumberChange}
          className="h-12 rounded-l-none rounded-r-xl border-l-0 pl-3"
          autoComplete="tel-national"
          autoFocus={autoFocus}
        />
      </div>
    </div>
  );
};
