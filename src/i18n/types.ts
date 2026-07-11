// Typage global de next-intl (audit §5.1).
//
// Rend les clés de traduction **vérifiées par TypeScript** : `t('profile.greeting')`
// est validé à la compilation, une clé inexistante ou mal orthographiée devient une
// erreur de build (et l'autocomplétion de l'IDE liste les clés disponibles).
//
// `messages/fr.json` fait foi pour la FORME (l'ensemble des clés). `en.json` doit
// rester strictement synchronisé : toute clé présente ici doit exister dans les deux
// fichiers (cf. routine i18n dans CLAUDE.md §5.1).
//
// Ce fichier ne contient que de l'augmentation de type (aucun effet à l'exécution) ;
// il est pris en compte via `include: ["**/*.ts"]` du tsconfig, sans import explicite.

import { routing } from './routing';
import messages from '../../messages/fr.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
