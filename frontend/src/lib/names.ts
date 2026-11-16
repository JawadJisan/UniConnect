const TITLE = /^(dr|prof|mr|mrs|ms|md|engr)\.?$/i;

/**
 * A display name's words without leading-title words such as "Dr." or "Md." (common in
 * Bangladeshi names). Falls back to every word when the name is only a title.
 */
export function nameWords(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const named = words.filter((w) => !TITLE.test(w));
  return named.length > 0 ? named : words;
}
