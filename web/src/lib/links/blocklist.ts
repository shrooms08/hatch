// Links and coin names Hatch refuses to hatch. A simple, maintained list: blocked domains (and their
// subdomains) and blocked words, matched on whole words so "kidney" or "Sussex" do not trip "kid" or "sex".
// Categories: adult content, gore, tragedies (deaths, attacks, disasters), and anything about minors.

export const BLOCKED_DOMAINS: readonly string[] = [
  // adult
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'redtube.com', 'youporn.com', 'tube8.com', 'spankbang.com', 'chaturbate.com',
  'onlyfans.com', 'fansly.com', 'stripchat.com', 'cam4.com', 'livejasmin.com', 'brazzers.com', 'rule34.xxx', 'e-hentai.org', 'nhentai.net',
  // gore / shock
  'bestgore.com', 'theync.com', 'kaotic.com', 'goregrish.com', 'crazyshit.com', 'documentingreality.com', 'liveleak.com',
  // harassment forums
  'kiwifarms.net', 'kiwifarms.st',
];

export const BLOCKED_WORDS: Record<'adult' | 'gore' | 'tragedy' | 'minors', readonly string[]> = {
  adult: ['porn', 'porno', 'pornhub', 'xxx', 'nsfw', 'nude', 'nudes', 'naked', 'sex', 'sexy', 'hentai', 'onlyfans', 'milf', 'blowjob', 'cum', 'boobs', 'tits', 'pussy', 'dick', 'cock', 'fetish', 'escort', 'camgirl', 'rule34'],
  gore: ['gore', 'beheading', 'beheaded', 'decapitation', 'decapitated', 'dismembered', 'dismemberment', 'snuff', 'mutilated', 'mutilation', 'corpse', 'corpses'],
  tragedy: ['shooting', 'shootings', 'shooter', 'massacre', 'genocide', 'terrorist', 'terrorism', 'bombing', 'suicide', 'suicidal', 'murder', 'murdered', 'killed', 'killing', 'dead', 'deaths', 'death toll', 'died', 'funeral', 'memorial', 'obituary', 'rip', 'victims', 'casualties', 'tragedy', 'hostage', 'hostages', 'plane crash', 'mass grave', 'famine', 'earthquake victims'],
  minors: ['child', 'children', 'kid', 'kids', 'minor', 'minors', 'underage', 'teen', 'teens', 'teenager', 'schoolgirl', 'schoolboy', 'toddler', 'baby', 'babies', 'infant', 'preteen', 'loli', 'shota', 'csam', 'cp'],
};

export type BlockReason = { category: 'domain' | keyof typeof BLOCKED_WORDS; match: string };

const WORD_RES = Object.entries(BLOCKED_WORDS).map(([category, words]) => ({
  category: category as keyof typeof BLOCKED_WORDS,
  re: new RegExp(`(?:^|[^a-z0-9])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '[\\s_-]+')).join('|')})(?=$|[^a-z0-9])`, 'i'),
}));

export function blockedDomain(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  return BLOCKED_DOMAINS.find((d) => h === d || h.endsWith(`.${d}`)) ?? null;
}

/** Splits camelCase / tickers / slugs into words before matching ("BabyShark" -> "Baby Shark"). */
const words = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-/.+]+/g, ' ');

/** The first reason any of `texts` (or `host`) is blocked, or null. */
export function checkBlocked(input: { host?: string; texts?: (string | null | undefined)[] }): BlockReason | null {
  if (input.host) {
    const d = blockedDomain(input.host);
    if (d) return { category: 'domain', match: d };
  }
  for (const t of input.texts ?? []) {
    if (!t) continue;
    const text = words(t);
    for (const { category, re } of WORD_RES) {
      const m = text.match(re);
      if (m) return { category, match: (m[1] ?? '').toLowerCase() };
    }
  }
  return null;
}

export const blockMessage = (r: BlockReason) =>
  r.category === 'domain' ? 'Links from this site cannot be hatched on Hatch.' : 'Hatch does not hatch coins about adult content, violence, tragedies or minors.';
