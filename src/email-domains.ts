export const EMAIL_TYPO_ISSUE = "Possible email typo";

// This is a curated set of provider-owned domains, not a list of every valid email domain.
const PROVIDER_DOMAINS = [
  "gmail.com", "googlemail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com",
  "yahoo.com", "myyahoo.com", "yahoo.co.uk", "yahoo.fr",
  "icloud.com", "me.com", "mac.com",
  "proton.me", "protonmail.com", "pm.me", "protonmail.ch",
  "gmx.com", "mail.com", "fastmail.com", "zohomail.com", "aol.com"
] as const;

export interface EmailDomainSuggestion {
  originalEmail: string;
  correctedEmail: string;
  suggestedDomain: string;
}

const knownDomains = new Set<string>(PROVIDER_DOMAINS);
const nearDomains = new Map<string, string | null>();

function addVariant(variant: string, domain: string): void {
  if (variant === domain || knownDomains.has(variant)) return;
  const previous = nearDomains.get(variant);
  if (previous === undefined) nearDomains.set(variant, domain);
  else if (previous !== domain) nearDomains.set(variant, null);
}

for (const domain of PROVIDER_DOMAINS) {
  const dot = domain.indexOf(".");
  const name = domain.slice(0, dot);
  const suffix = domain.slice(dot);
  // Short names are too easy to confuse with unrelated, legitimate domains.
  if (name.length < 5) continue;
  for (let index = 0; index < name.length; index += 1) {
    addVariant(`${name.slice(0, index)}${name.slice(index + 1)}${suffix}`, domain);
    if (index + 1 < name.length && name.charAt(index) !== name.charAt(index + 1)) {
      addVariant(`${name.slice(0, index)}${name.charAt(index + 1)}${name.charAt(index)}${name.slice(index + 2)}${suffix}`, domain);
    }
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      if (letter !== name.charAt(index)) {
        addVariant(`${name.slice(0, index)}${letter}${name.slice(index + 1)}${suffix}`, domain);
      }
    }
  }
  for (let index = 0; index <= name.length; index += 1) {
    for (const letter of "abcdefghijklmnopqrstuvwxyz") {
      addVariant(`${name.slice(0, index)}${letter}${name.slice(index)}${suffix}`, domain);
    }
  }
}

export function emailCellKey(sourceIndex: number, columnIndex: number): string {
  return `${sourceIndex}:${columnIndex}`;
}

export function isDismissedEmailTypo(
  email: string,
  sourceIndex: number,
  columnIndex: number,
  dismissed: ReadonlyMap<string, string>
): boolean {
  return dismissed.get(emailCellKey(sourceIndex, columnIndex)) === email.trim().toLowerCase();
}

export function suggestEmailDomain(email: string): EmailDomainSuggestion | null {
  const originalEmail = email.trim();
  const at = originalEmail.lastIndexOf("@");
  if (at <= 0 || at === originalEmail.length - 1) return null;
  const domain = originalEmail.slice(at + 1).toLowerCase();
  if (knownDomains.has(domain)) return null;
  const suggestedDomain = nearDomains.get(domain);
  if (!suggestedDomain) return null;
  return {
    originalEmail,
    correctedEmail: `${originalEmail.slice(0, at + 1)}${suggestedDomain}`,
    suggestedDomain
  };
}
