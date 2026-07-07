/** Country name (as scraped, any language-ish) → flag emoji. */
const FLAGS: Record<string, string> = {
  'united states': '🇺🇸', 'usa': '🇺🇸', 'united kingdom': '🇬🇧', 'uk': '🇬🇧',
  canada: '🇨🇦', brazil: '🇧🇷', brasil: '🇧🇷', mexico: '🇲🇽', méxico: '🇲🇽',
  argentina: '🇦🇷', colombia: '🇨🇴', peru: '🇵🇪', perú: '🇵🇪', chile: '🇨🇱',
  panama: '🇵🇦', panamá: '🇵🇦', spain: '🇪🇸', españa: '🇪🇸', portugal: '🇵🇹',
  germany: '🇩🇪', france: '🇫🇷', italy: '🇮🇹', netherlands: '🇳🇱', india: '🇮🇳',
  australia: '🇦🇺', switzerland: '🇨🇭', austria: '🇦🇹', belgium: '🇧🇪',
  denmark: '🇩🇰', finland: '🇫🇮', norway: '🇳🇴', sweden: '🇸🇪', poland: '🇵🇱',
  'czech republic': '🇨🇿', czechia: '🇨🇿', ireland: '🇮🇪', russia: '🇷🇺',
  turkey: '🇹🇷', ukraine: '🇺🇦', romania: '🇷🇴', bulgaria: '🇧🇬', greece: '🇬🇷',
  hungary: '🇭🇺', croatia: '🇭🇷', serbia: '🇷🇸', slovakia: '🇸🇰', slovenia: '🇸🇮',
  estonia: '🇪🇪', latvia: '🇱🇻', lithuania: '🇱🇹', 'south africa': '🇿🇦',
  nigeria: '🇳🇬', kenya: '🇰🇪', egypt: '🇪🇬', morocco: '🇲🇦', mozambique: '🇲🇿',
  tunisia: '🇹🇳', 'united arab emirates': '🇦🇪', 'saudi arabia': '🇸🇦', qatar: '🇶🇦',
  kuwait: '🇰🇼', israel: '🇮🇱', pakistan: '🇵🇰', bangladesh: '🇧🇩',
  'sri lanka': '🇱🇰', nepal: '🇳🇵', singapore: '🇸🇬', malaysia: '🇲🇾',
  indonesia: '🇮🇩', philippines: '🇵🇭', thailand: '🇹🇭', vietnam: '🇻🇳',
  japan: '🇯🇵', 'south korea': '🇰🇷', kyrgyzstan: '🇰🇬', china: '🇨🇳',
  'hong kong': '🇭🇰', taiwan: '🇹🇼', 'new zealand': '🇳🇿', uruguay: '🇺🇾',
  paraguay: '🇵🇾', bolivia: '🇧🇴', ecuador: '🇪🇨', venezuela: '🇻🇪',
  'costa rica': '🇨🇷', guatemala: '🇬🇹', honduras: '🇭🇳', 'el salvador': '🇸🇻',
  nicaragua: '🇳🇮', 'dominican republic': '🇩🇴', 'puerto rico': '🇵🇷',
}

export function flagFor(country: string | null | undefined): string {
  if (!country) return '🌍'
  const key = country.trim().toLowerCase()
  if (FLAGS[key]) return FLAGS[key]
  if (key.includes('united') && key.includes('states')) return '🇺🇸'
  return '🌍'
}
