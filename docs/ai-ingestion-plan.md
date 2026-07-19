# Plan d'implémentation — génération du programme par IA

> Conception arrêtée le 20/07/2026, **aucun code écrit**. Ce document est le point de départ d'une future session d'implémentation : il fixe les décisions prises, les justifie, et liste ce qui reste à trancher. À lire en entier avant d'écrire la première ligne.
>
> Contexte technique associé : `.claude/rules/server-architecture.md` (pattern `lib/` + wrapper, authz, revalidation), `docs/product-spec.md` (§ Programme éducatif, § Briques de connaissance), `docs/backlog.md` (dette et chantiers ouverts).

---

## 1. L'objectif

À partir d'un simple fichier source (PDF en priorité), l'IA doit pouvoir produire automatiquement :

1. les **chapitres** de l'atelier ;
2. les **briques de connaissance**, rattachées à leur chapitre ;
3. les **questions** (variées), avec leur niveau de Bloom et leurs briques couvertes.

Le tout sans saisie manuelle, et sans créer de doublons avec ce qui existe déjà.

---

## 2. La décision fondatrice : pas d'API HTTP interne

**Question posée :** faut-il construire des API pour que l'IA puisse écrire dans la base ?

**Réponse : non.** Le mot « API » recouvrait deux choses distinctes :

| | Nature | Verdict |
|---|---|---|
| **API du fournisseur** (sortante) | Appel HTTPS de notre serveur vers Anthropic / DeepSeek | **Oui, évidemment** — c'est l'appel au modèle |
| **Notre propre API** (entrante) | Routes REST type `POST /api/v1/workshops/:id/chapters` | **Non** — le serveur s'appellerait lui-même : latence en plus, authz à refaire, typage perdu |

Le trajet réel :

```
serveur Next.js
  ├─ lit le fichier                    (local)
  ├─→ HTTPS vers le fournisseur        ← seule API, sortante
  │      ←─ JSON du plan
  ├─ valide le JSON (Zod)              (local)
  └─ écrit en base via src/lib/…       (appel de fonction, pas HTTP)
```

**L'architecture actuelle est déjà la bonne.** Le pattern imposé par `CLAUDE.md` (« logique métier dans `src/lib/<domaine>/`, `app/actions/` = wrapper fin ») fait que l'ingestion appellera `lib/` directement, exactement comme le ferait une future API publique. **Rien à ré-architecturer.**

**Le seul cas qui justifierait une route API à nous :** si le traitement (lecture du document + appel modèle) dépasse la limite de temps d'une server action Vercel, il faudra le déporter en tâche de fond déclenchée par une route. C'est une contrainte d'exécution longue, pas d'écriture en base — la fonction d'ingestion reste identique.

---

## 3. Stratégie d'entrée : CAG, pas RAG

**Question posée :** vectoriser le PDF plutôt que le convertir en texte ? Stocker le vecteur plutôt que le PDF ?

### Trois clarifications

1. **Vectoriser n'est pas une alternative à extraire le texte.** Un modèle d'embedding prend du texte en entrée. L'ordre est toujours `PDF → texte → vecteur`. La vectorisation vient après, elle ne remplace rien.
2. **Un vecteur n'est pas réversible.** On ne reconstruit pas le texte depuis ~1500 nombres. Stocker le vecteur *à la place* du PDF rendrait impossible toute réextraction ultérieure — notamment le jour où un meilleur modèle justifiera de relancer l'ingestion.
3. **Le PDF reste la source de vérité** (déjà correctement stocké via `workshop_files` + `src/lib/storage.ts`). Un vecteur est une **donnée dérivée**, régénérable — un cache, jamais une source.

### RAG serait contre-productif ici

| | Principe | Adapté à |
|---|---|---|
| **RAG** | Découper, vectoriser, ne récupérer que les passages *les plus pertinents* | Répondre à une question ciblée dans un corpus immense |
| **CAG** | Mettre le document entier dans le contexte | Traiter un document **exhaustivement** |

L'ingestion est exhaustive par nature (« lis tout, produis le programme complet »). Avec du RAG, le modèle ne verrait jamais les passages non retenus et produirait un programme **avec des chapitres manquants, sans que rien ne le signale**. C'est le pire mode de défaillance possible ici.

Le contexte n'est plus limitant : les modèles actuels acceptent jusqu'à 1 M de tokens ; un cours de 150 pages en fait de l'ordre de 80 000.

**Document hors-normes (> limites du fournisseur) :** découpage **séquentiel** (par partie, dans l'ordre de lecture), ingestion de chaque tranche, fusion des plans. Un découpage par ordre, pas par pertinence — la couverture reste complète.

### Vecteurs : plus tard, et le terrain est prêt

`pgvector` **0.8.0 est disponible sur le projet Supabase `hhkmrejjksjpfetwefju`, non installé** (vérifié le 20/07/2026).

Le jour où une vraie recherche sémantique arrivera (recherche côté candidat, rattachement automatique question ↔ brique), **les briques de connaissance sont déjà les chunks** : une brique est exactement ce qu'un projet classique doit fabriquer artificiellement — une unité de sens autonome, avec titre et contenu, découpée à la main. Il suffira d'activer l'extension et d'ajouter une colonne `embedding` sur `workshop_bricks`. Rien à redécouper.

**Aujourd'hui : ne rien vectoriser.** Complexité et coût d'embedding pour un besoin qui n'existe pas encore.

---

## 4. Fournisseurs : trajectoire et frontière d'abstraction

**Trajectoire décidée :** Claude d'abord (le plus simple à mettre en place) → DeepSeek ensuite (coût) → à terme, modèles open-source DeepSeek **auto-hébergés en local**.

### Comment Claude préserve tableaux et images

Ce n'est pas du parsing : **chaque page du PDF est envoyée au modèle comme une image**, en plus du texte extrait. Le modèle *regarde* la page. D'où la conservation des tableaux, schémas, colonnes et encadrés qu'une extraction texte aplatit — et d'où le surcoût (tokens d'image par page) et les limites (32 Mo, 600 pages).

### Conséquence structurante

Changer de fournisseur **n'est pas un changement d'URL**. Sans lecture PDF native, il faudra soit extraire le texte (et perdre les tableaux), soit rendre les pages en images pour un modèle de vision.

**La frontière à isoler n'est donc pas « appeler un modèle » mais « transformer un document en plan » :**

```ts
// src/lib/ingest/providers/types.ts (à créer)
type PlanProvider = {
  documentToPlan(file: SourceFile, context: ExistingContent, scope: IngestScope): Promise<unknown>;
};
```

Chaque fournisseur l'implémente à sa façon (Claude : PDF direct ; DeepSeek : extraction préalable ; local : idem + contraintes matérielles). Le reste du pipeline — validation, résolution des références, écriture — est **identique quel que soit le fournisseur**, parce que le contrat de sortie est défini indépendamment de lui.

---

## 5. Le contrat : un schéma Zod unique

`zod` est **déjà installé et utilisé nulle part dans `src/`** — ce serait son premier usage réel.

Un seul schéma décrit le plan complet, avec des **clés de référence locales** (l'IA ne peut pas connaître des identifiants qui n'existent pas encore) :

```ts
// Forme cible, à affiner
{
  chapters: [{ ref: "ch1", name: "Les fleuves", position: 0 }],
  bricks:   [{ ref: "b1", title: "…", content: "…", chapterRef: "ch1" }],
  questions:[{
    ref: "q1",
    context: "parcours" | "exam",
    content: "…", responseType: "qcm", choices: [...], correctChoices: [...],
    bloomLevel: 3,
    brickRefs: ["b1", "b7"],
    chapterRef: "ch1",        // voir §9 — susceptible de disparaître
  }],
}
```

Ce schéma sert **deux fois** :

1. **En sortie contrainte du modèle** — le fournisseur ne peut produire que du conforme (côté Claude, la conversion Zod → JSON Schema est automatique).
2. **En validation avant écriture** — filet indispensable, notamment pour les fournisseurs sans sortie structurée native.

---

## 6. Les quatre points d'entrée (en escalier)

Chaque bouton « générer par IA » fait ce que fait le précédent, **plus une couche**. Un seul moteur d'ingestion derrière, avec un périmètre (`scope`) différent.

| # | Emplacement | Crée | État |
|---|---|---|---|
| 1 | **Paramètres → Briques de connaissance** | chapitres + briques | à créer |
| 2 | **Parcours éducatif** (onglet Programme) | idem **+ questions de parcours** | bouton pas encore présent visuellement |
| 3 | **Banque de questions** (Génération d'examen) | idem n°1 **+ questions de banque d'examen** | bouton présent, **aucun `onClick`** ([BankContent.tsx:363](../src/app/[locale]/workshops/[id]/tabs/examen/BankContent.tsx)) |
| 4 | **Examens générés** | idem n°3 **+ compose des examens** | plus tard |

Les entrées 2 et 3 sont **sœurs**, pas imbriquées : l'une produit des questions de parcours (`context = 'parcours'`), l'autre des questions de banque (`context = 'exam'`). L'entrée 4 s'appuie sur la 3.

### Règle transverse : toujours fournir l'existant

**À chaque appel, on transmet au modèle tout ce qui existe déjà** dans l'atelier — chapitres, briques, questions — afin qu'il ne recrée pas de doublons et qu'il complète l'existant au lieu de le dupliquer.

Conséquences :

- la déduplication est **portée par le modèle**, pas par un algorithme de rapprochement côté serveur ;
- le prompt grossit avec l'atelier — à surveiller sur les gros ateliers, et argument fort pour le **cache de prompt** (l'existant est stable d'un appel à l'autre, il doit être placé en tête pour être mis en cache) ;
- il faut décider si le modèle a le droit de **modifier** l'existant (renommer un chapitre, corriger une brique) ou seulement d'**ajouter** — voir §11.

---

## 7. Volumétrie : des règles produit, pas un réglage utilisateur

**Décision :** le nombre de questions générées et la répartition des niveaux de Bloom sont **imposés par le site**, pas exposés à l'utilisateur.

Forme des règles (valeurs **à définir**, voir §11) :

- aucune question sur la brique → en créer **X** ;
- des questions existent déjà → en créer **Y** (complément) ;
- chapitre nouvellement créé → **Z** ;
- répartition Bloom et variété des types de réponse : à cadrer.

Ces règles vivent dans le code (module d'ingestion), sont injectées dans le prompt **et** vérifiées par le schéma quand c'est exprimable.

---

## 8. Écriture en base : directe, avec annulation

**Décision :** pas de prévisualisation. Le plan est écrit immédiatement ; l'utilisateur constate le résultat dans l'app et annule si besoin.

### Le mécanisme d'annulation

**Une colonne `import_id` (uuid, nullable)** sur `workshop_chapters`, `workshop_bricks` et `exam_questions`. **Pas de table `import_runs`** — décision explicite.

- Ligne sans valeur = saisie à la main. Ligne avec valeur = issue de ce lot.
- Migration **expand** pure : rien de supprimé, rien de renommé, aucun impact sur le code déployé.
- Annuler = `delete … where import_id = $1`. Les liens `exam_question_bricks` suivent seuls (`on delete cascade` des deux côtés).

### Les deux conditions d'annulation

Annulation possible **tant que** :

1. **moins de 24 h** depuis l'import → date de l'import = le plus ancien `created_at` du lot ;
2. **aucun élément modifié** → aucune ligne du lot n'a `updated_at` postérieur à son `created_at`.

Aucune table de métadonnées nécessaire : les trois tables portent déjà `created_at` **et** `updated_at`.

> ⚠️ **Piège d'implémentation.** `questionToRow` (`src/lib/workshops/exam.ts`) écrit explicitement `updated_at` à chaque `upsert`, **y compris à la création**. Les deux dates seront séparées de quelques microsecondes dès l'insertion, donc tout import serait considéré « déjà modifié » et le bouton d'annulation ne s'afficherait jamais. Il faut soit une tolérance de quelques secondes, soit aligner `updated_at` sur `created_at` pendant l'ingestion.

### Pourquoi pas une transaction atomique

Le client Supabase JS ne sait pas faire de transaction multi-requêtes. Une fonction Postgres (RPC) prenant le plan en JSONB donnerait l'atomicité (tout ou rien), mais ferait vivre la logique métier en SQL — hors du pattern `lib/` du projet et hors des tests TypeScript.

L'approche retenue n'est pas atomique : un échec en cours laisse un atelier partiellement rempli. C'est assumé, parce que l'étiquette `import_id` permet de nettoyer d'un coup — **et parce qu'elle sert bien au-delà de la panne** : annuler un import qui a *techniquement réussi* mais dont l'IA a mal compris le document. Aucune transaction ne donne ça.

---

## 9. Prérequis : le basculement chapitre → briques

**Décision produit annoncée (à faire avant l'ingestion) :** supprimer la sélection de chapitre sur les questions. Le chapitre d'une question se déduira de ses briques (`question → exam_question_bricks → workshop_bricks.chapter_id`) au lieu d'être saisi deux fois.

**Impact direct sur l'existant** (livré le 19/07/2026) : `drawParcoursQuestion` filtre sur `exam_questions.chapter_id`. Sans cette colonne, le tirage devra passer par la jonction — et **une question sans brique ne serait plus jamais tirable**. L'association aux briques cesse d'être facultative : elle devient la condition d'existence de la question dans un parcours. Il faudra la rendre obligatoire (au moins une brique), comme on l'a fait pour le niveau de Bloom.

**Ordre impératif :** faire ce basculement **avant** d'écrire le schéma Zod, sinon le contrat est à réécrire (le champ `chapterRef` sur les questions disparaîtrait).

---

## 10. Chantiers techniques préalables

### 10.1 Bug bloquant — collision d'identifiants

`emptyQuestion()` (`src/app/[locale]/workshops/[id]/tabs/QuestionEditor.tsx`) génère `id: 'q' + Date.now()`.

En création manuelle, aucun risque. **En ingestion, N questions créées dans la même milliseconde partagent le même identifiant** → l'`upsert` les écrase les unes les autres, **silencieusement**. À remplacer par `crypto.randomUUID()` **avant tout travail d'ingestion**.

> À noter : `exam_questions.id` est de type `text` (identifiants générés côté client), pas `uuid` — c'est ce qui a fait échouer la première migration de `exam_question_bricks`, dont la clé étrangère est en `text`.

### 10.2 Invariants métier à faire remonter dans `lib/`

Les écritures actuelles font confiance à l'UI : le seul contrôle métier existant est `validateName` pour les chapitres. Une IA écrit 200 lignes d'un coup. À vérifier **dans `lib/`**, pas dans un composant :

- `bloomLevel` entre 1 et 6 (déjà garanti en base par contrainte, mais l'erreur doit être lisible) ;
- QCM/QCS ⇒ au moins 2 choix et au moins une bonne réponse ;
- réponse non vide sauf `sans_reponse` ;
- brique référencée existante **et appartenant au même atelier** ;
- chapitre référencé existant et du même atelier ;
- longueurs maximales (`CHAPTER_NAME_MAX` = 120, etc.).

### 10.3 Absence de suppression multiple

Ni la banque d'examen ni la vue parcours n'ont de suppression multiple — chaque bouton ouvre une confirmation pour une seule question. Non bloquant (l'annulation par `import_id` couvre le besoin), mais à garder en tête.

---

## 11. Questions ouvertes

À trancher au moment de l'implémentation :

1. **Valeurs de la volumétrie** — les X / Y / Z du §7, la répartition Bloom cible, la variété attendue des types de réponse.
2. **Modification de l'existant** — le modèle peut-il renommer un chapitre, corriger une brique, reformuler une question existante, ou uniquement **ajouter** ? (Impacte le schéma, l'annulation et la confiance.)
3. **Qui peut annuler un import** — gestionnaire, ou propriétaire uniquement ?
4. **Ré-ingestion du même fichier** — comportement attendu si un fichier déjà traité est resoumis.
5. **Documents hors limites** — seuil de découpage séquentiel, et où il s'exécute (server action vs tâche de fond).
6. **Coût** — la génération par IA est-elle liée à l'atelier Premium ? Quelles limites par atelier / par mois ?
7. **Cohérence Bloom** — le `bloom_level` généré doit-il suivre une règle par rapport au contenu de la brique, et comment il s'articulera plus tard avec `brick_mastery` (voir `docs/backlog.md`).

---

## 12. Ordre de chantier recommandé

1. **Basculement chapitre → briques** (§9) — change le modèle de données, doit précéder le contrat.
2. **Fix des identifiants de question** (§10.1) — bloquant, indépendant, rapide.
3. **Invariants métier dans `lib/`** (§10.2) — utile même sans IA.
4. **Colonne `import_id`** + fonction d'annulation (§8) — migration expand, testable seule.
5. **Schéma Zod du plan** (§5) + `ingestWorkshopPlan()` — testable avec un plan écrit à la main, **sans une ligne d'IA**.
6. **Interface fournisseur** (§4) + première implémentation Claude.
7. **Les quatre boutons** (§6), dans l'ordre 1 → 2 → 3 → 4.

Les étapes 1 à 5 se construisent et se testent **entièrement sans IA**. Le jour où le modèle arrive, il ne reste que « document → plan ».
