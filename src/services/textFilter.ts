/**
 * Keeps typed text kid-friendly (server names now, chat later): rude words become ***, and
 * links, e-mail addresses and phone numbers are removed, so kids can't share personal details.
 * Simple on purpose: it is a first line of defence, not a moderator.
 */

// Dutch and English swear words / insults. Long ones also count inside other words ("klootzakje");
// short ones only as a whole word, so "skill", "doodle" or "Sussex" stay fine.
const BAD_PARTS = [
  'kanker', 'tyfus', 'klote', 'kankerlijer', 'mongool', 'klootzak', 'godverdomme', 'fuck', 'shit', 'bitch',
  'bastard', 'asshole', 'pussy', 'cunt', 'whore', 'nigger', 'nigga', 'retard', 'faggot', 'porno', 'suicide', 'zelfmoord',
];
const BAD_WORDS = ['tering', 'kut', 'lul', 'hoer', 'slet', 'debiel', 'eikel', 'dick', 'slut', 'fag', 'sex', 'porn', 'naakt', 'nude', 'kill', 'dood', 'moord'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
const norm = (w: string) => w.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] ?? c).replace(/(.)\1{2,}/g, '$1$1');

/** True if the text contains a rude word. */
export function isRude(text: string): boolean {
  const n = norm(text);
  const joined = n.replace(/[^a-z]/g, '');
  if (BAD_PARTS.some((b) => joined.includes(b))) return true;
  return n.split(/[^a-z]+/).some((w) => BAD_WORDS.includes(w));
}

/** Cleans text: no links / e-mail / phone numbers, rude words masked, extra spaces removed, max length. */
export function cleanText(text: string, maxLength = 80): string {
  let s = text
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '***')
    .replace(/\b\S+\.(?:com|nl|be|net|org|io|app|gg|tv|me)\b\S*/gi, '***')
    .replace(/\S+@\S+/g, '***')
    .replace(/(?:\+?\d[\s-]?){6,}/g, '***');
  s = s.split(/(\s+)/).map((w) => (w.trim() && isRude(w) ? '*'.repeat(Math.min(6, w.length)) : w)).join('');
  return s.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
