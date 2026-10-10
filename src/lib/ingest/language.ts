// La langue d'un texte, reconnue par le site, sans IA — 10/10/2026.
//
// Le 07/10/2026, un chapitre entier d'un cours d'algèbre français (« Groupes »,
// 107 notions sur 109) a été écrit en anglais. Deux gestes, décidés avec
// Alexis :
// • la langue du COURS (et non celle de l'atelier) est reconnue à l'étape
//   chapitres et dite à l'étape notions ;
// • les notions rendues sont vérifiées à l'arrivée, et un écart est signalé.
//
// La méthode est la plus simple qui marche sur du texte de cours : compter les
// mots les plus courants de chaque langue (articles, prépositions, auxiliaires).
// Ils n'appartiennent qu'à une langue, ils sont partout, et une formule
// mathématique n'en contient aucun. **Fonction pure**, testée.
//
// ⚠️ Un cours de langue mêle deux langues : la langue d'enseignement domine
// (les explications), la langue étudiée apparaît par phrases. C'est la langue
// dominante qu'on retient, et le seuil de `confident` laisse passer un mélange.

export type CourseLanguage = 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt';

/** Le nom de chaque langue, tel que les consignes le disent au modèle. */
export const LANGUAGE_NAMES: Record<CourseLanguage, string> = {
  fr: 'français',
  en: 'anglais',
  es: 'espagnol',
  de: 'allemand',
  it: 'italien',
  pt: 'portugais',
};

// Des mots propres à une langue. Les mots partagés (« a », « de » entre
// français, espagnol et portugais ; « in » entre anglais, allemand et italien)
// sont exclus : ils ne départagent rien.
const STOPWORDS: Record<CourseLanguage, readonly string[]> = {
  fr: ['le', 'les', 'des', 'une', 'est', 'et', 'du', 'dans', 'sur', 'pour', 'pas', 'qui', 'que', 'au', 'aux', 'sont', 'avec', 'cette', 'ce', 'il', 'elle', 'ou', 'par', 'leur', 'nous', 'vous', 'être', 'été'],
  en: ['the', 'is', 'and', 'of', 'to', 'are', 'with', 'that', 'this', 'which', 'for', 'be', 'it', 'its', 'an', 'as', 'by', 'not', 'or', 'from', 'has', 'have', 'was', 'were', 'their', 'whose'],
  es: ['el', 'los', 'las', 'es', 'y', 'del', 'por', 'con', 'una', 'para', 'su', 'sus', 'como', 'pero', 'está', 'son', 'muy', 'también', 'cuando', 'donde'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'den', 'dem', 'ein', 'eine', 'zu', 'von', 'auf', 'für', 'sind', 'auch', 'sich', 'wird', 'oder'],
  it: ['il', 'gli', 'della', 'delle', 'dei', 'è', 'e', 'che', 'per', 'con', 'una', 'sono', 'nel', 'nella', 'alla', 'anche', 'come', 'più', 'questo', 'questa'],
  pt: ['os', 'as', 'é', 'e', 'do', 'da', 'dos', 'das', 'em', 'para', 'com', 'uma', 'não', 'são', 'mais', 'como', 'pelo', 'pela', 'seu', 'sua'],
};

const LOOKUP = new Map<string, CourseLanguage[]>();
for (const [language, words] of Object.entries(STOPWORDS) as [CourseLanguage, readonly string[]][]) {
  for (const word of words) LOOKUP.set(word, [...(LOOKUP.get(word) ?? []), language]);
}

export type LanguageGuess = {
  language: CourseLanguage | null;
  /** Part des mots repérés qui vont à la langue retenue, entre 0 et 1. */
  share: number;
  /** Combien de mots repérés en tout : sous un minimum, on ne conclut pas. */
  hits: number;
};

/** Sous ce nombre de mots repérés, on ne dit rien : trop peu de texte. */
const MIN_HITS = 20;

/** La langue dominante d'un texte. Un mot qui appartient à plusieurs listes
 *  compte pour chacune — il ne départage rien, mais ne fausse rien non plus. */
export function detectLanguage(text: string): LanguageGuess {
  const counts = new Map<CourseLanguage, number>();
  let hits = 0;
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    const languages = LOOKUP.get(word);
    if (!languages) continue;
    hits += 1;
    for (const language of languages) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  if (hits < MIN_HITS) return { language: null, share: 0, hits };
  const [best, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return { language: best, share: count / hits, hits };
}

/** Une langue reconnue sans hésitation : assez de texte, et une langue qui
 *  l'emporte nettement. Seuil assez bas pour qu'un cours de langue, qui mêle
 *  deux langues, garde sa langue d'enseignement. */
export function confidentLanguage(text: string): CourseLanguage | null {
  const guess = detectLanguage(text);
  return guess.language && guess.share >= 0.6 ? guess.language : null;
}
