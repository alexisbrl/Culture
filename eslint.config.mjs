import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Types Supabase générés (régénérés via la CLI / le MCP) — ne pas linter.
    "src/lib/database.types.ts",
    // Worktrees / copies de travail des agents Claude — hors périmètre du lint
    // (sinon ESLint scanne des dizaines de copies du code en local → bruit massif).
    ".claude/**",
    // Maquettes / prototypes de référence (non suivis par git, locaux uniquement) :
    // ce ne sont pas des sources de l'app, on ne les lint pas.
    "_handoff/**",
    "culture-design-system/**",
    // Bundle de handoff Claude Design (versionné, cf. docs/design/README.md) :
    // prototype + runtime + composants compilés. Documentation, pas des sources.
    "docs/**",
  ]),
  {
    // Règles « React Compiler readiness » (eslint-plugin-react-hooks v6) : elles signalent
    // des patterns souvent LÉGITIMES (init client-only / hydration-safe via window/localStorage/
    // searchParams après montage, lecture de ref pour un curseur, PRNG seedé dans useMemo…).
    // On les garde VISIBLES en `warn` mais NON bloquantes ; les vraies erreurs (types, imports
    // morts, entités non échappées, hooks mal utilisés) restent en `error` et font échouer la CI.
    // cf. audit §3.3/§3.4.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    // Infobulles : `<Tooltip>` uniquement, jamais l'attribut `title` du HTML.
    // Ce dernier est dessiné par le système d'exploitation, hors du DOM : aucun
    // CSS ne l'atteint, et la même infobulle n'a donc pas la même apparence d'un
    // poste à l'autre.
    //
    // La règle refuse `title` sur TOUTE balise JSX, et n'excepte que la liste
    // ci-dessous : nos propres composants, dont `title` est une vraie prop
    // (`<Modal title=…>`, `<ListCard title=…>`) et non un attribut DOM. Ce sens
    // — interdire par défaut, autoriser nommément — n'est pas un détail : la
    // première version ne visait que les balises en minuscule, et laissait donc
    // passer `title` sur un composant qui le TRANSMET au DOM. C'est exactement
    // ce qui est arrivé à `<Link title=…>` (next/link le pose sur son `<a>`) :
    // l'engrenage des paramètres a gardé une infobulle système jusqu'au
    // 18/08/2026, invisible du lint. Ajouter un nom à cette liste, c'est donc
    // affirmer que le composant ne transmet pas `title` au DOM.
    //
    // C'est cette règle, et non un `grep`, qui fait foi pour recenser les
    // infobulles restantes — elle lit l'AST, pas du texte.
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "JSXOpeningElement:not([name.name=/^(ConfirmDialog|EmptyState|FilterButton|IconBtn|IconToggle|LabelPill|ListCard|PillToggle|RemoveLinkedButton|SectionCard|SectionDivider|SelectMenu|ShareQRModal|SheetAutoText|ShuffleNoticeIcon)$/]) > JSXAttribute[name.name='title']",
        message: "L'attribut `title` n'est pas stylable : envelopper l'élément dans <Tooltip content={…}> (src/components/ui/tooltip.tsx). Pour nommer un bouton-icône, utiliser `aria-label`.",
      }],
    },
  },
]);

export default eslintConfig;
