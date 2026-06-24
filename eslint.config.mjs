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
    // Worktrees / copies de travail des agents Claude — hors périmètre du lint
    // (sinon ESLint scanne des dizaines de copies du code en local → bruit massif).
    ".claude/**",
    // Maquettes / prototypes de référence (non suivis par git, locaux uniquement) :
    // ce ne sont pas des sources de l'app, on ne les lint pas.
    "_handoff/**",
    "culture-design-system/**",
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
]);

export default eslintConfig;
