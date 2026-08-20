import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests unitaires — modules PURS uniquement (`src/lib/**`).
//
// Portée volontairement étroite (voir docs/ai-ingestion-plan.md §12.2) : on ne
// teste pas la qualité de ce que produit l'IA — ça se juge dans l'app — mais les
// opérations qui peuvent DÉTRUIRE des données saisies à la main, et le contrat
// exposé à l'extérieur (`questionGroup.ts`), sur lequel toute l'ingestion repose.
//
// Rien ici ne touche au réseau ni à Supabase : la base est partagée avec
// get-culture.com (voir docs/backlog.md), un test ne doit jamais pouvoir l'atteindre.
// Un module qui a besoin d'un client Supabase se teste en lui passant un double,
// jamais en laissant `getSupabaseServerClient()` s'exécuter.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
