# Plan d'implémentation — génération du programme par IA

> Conception arrêtée le 20/07/2026, **révisée le 19/08/2026** (session de cadrage
> avec Alexis) : décisions produit tranchées, prérequis réévalués contre le code
> réel, méthode d'appel au modèle ajoutée. **Aucun code écrit à ce jour.** À lire
> en entier avant d'écrire la première ligne.
>
> Contexte technique associé : `.claude/rules/server-architecture.md` (pattern
> `lib/` + wrapper, authz, revalidation), `docs/product-spec.md` (§ Programme
> éducatif, § Notions), `docs/backlog.md` (dette et chantiers ouverts).

## Ce qui a changé depuis la conception du 20/07/2026

Trois prérequis du plan initial ont été livrés entre-temps sans que ce document
suive, et quatre affirmations y étaient devenues fausses. Corrigé ici :

- **Le basculement chapitre → notions est fait** (19/08/2026) :
  `exam_questions.chapter_id` n'existe plus, le chapitre d'une question se déduit
  de ses notions (`parcoursQuestionIdsOfChapter`, `src/lib/workshops/exam.ts`).
  Le champ `chapterRef` a donc disparu du contrat.
- **Le stockage est symétrique** (11/08/2026) : `exam_questions` porte le GROUPE,
  `exam_question_items` chaque question, et les notions sont reliées **à la
  question** par `exam_question_item_bricks`. L'ancienne jonction
  `exam_question_bricks` a été supprimée le 19/08/2026 — toute référence à elle
  dans une version antérieure de ce document est caduque.
- **Le contrat exposé à l'IA existe déjà** : `src/lib/workshops/questionGroup.ts`
  (`QuestionGroup`, `normalizeGroupInput`) — écrit le 11/08/2026, exactement la
  façade que ce plan appelait de ses vœux.
- **Bloom est à 4 niveaux**, pas 6 (contrainte `exam_question_items_bloom_level_check`).
- **Trois types de réponse ont été retirés** (`sondage`, `ordre`, `fill_blank`,
  09/08/2026). Les 9 types réels font foi : `src/lib/workshops/examTypes.ts`.
  ⚠️ `docs/product-spec.md` en annonce encore certains — c'est le code qui fait foi.
- **Le bouton « générer par IA » de la banque a disparu** avec la refonte UI :
  les points d'entrée sont **tous** à créer (§8).

---

## 1. L'objectif

À partir des fichiers sources de l'atelier (PDF et texte aujourd'hui, voir §6),
l'IA produit automatiquement, **en trois étapes enchaînées** :

1. les **chapitres** de l'atelier ;
2. les **notions**, rattachées à leur chapitre ;
3. les **questions**, avec leur niveau de Bloom et les notions qu'elles couvrent.

Le tout sans saisie manuelle, sans créer de doublons avec l'existant, et **sans
étape de validation humaine entre les trois** (décision du 19/08/2026 : la
génération va au bout d'un trait ; l'utilisateur constate et annule si besoin,
voir §10).

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

**L'architecture actuelle est déjà la bonne.** Le pattern imposé par `CLAUDE.md`
(« logique métier dans `src/lib/<domaine>/`, `app/actions/` = wrapper fin ») fait
que l'ingestion appellera `lib/` directement, exactement comme le ferait une
future API publique. **Rien à ré-architecturer** — vérifié le 19/08/2026 :
`requireMember`/`requireManager` sont bien appelés en tête de chaque action.

---

## 3. Stratégie d'entrée : CAG, pas RAG

**Question posée :** vectoriser le PDF plutôt que le convertir en texte ? Stocker le vecteur plutôt que le PDF ?

### Trois clarifications

1. **Vectoriser n'est pas une alternative à extraire le texte.** Un modèle
   d'embedding prend du texte en entrée. L'ordre est toujours `PDF → texte →
   vecteur`. La vectorisation vient après, elle ne remplace rien.
2. **Un vecteur n'est pas réversible.** On ne reconstruit pas le texte depuis
   ~1500 nombres. Stocker le vecteur *à la place* du PDF rendrait impossible
   toute réextraction ultérieure — notamment le jour où un meilleur modèle
   justifiera de relancer l'ingestion.
3. **Le PDF reste la source de vérité** (déjà correctement stocké via
   `workshop_files` + `src/lib/storage.ts`, bucket privé, clé en base et jamais
   d'URL). Un vecteur est une **donnée dérivée**, régénérable — un cache, jamais
   une source.

### RAG serait contre-productif ici

| | Principe | Adapté à |
|---|---|---|
| **RAG** | Découper, vectoriser, ne récupérer que les passages *les plus pertinents* | Répondre à une question ciblée dans un corpus immense |
| **CAG** | Mettre le document entier dans le contexte | Traiter un document **exhaustivement** |

L'ingestion est exhaustive par nature (« lis tout, produis le programme
complet »). Avec du RAG, le modèle ne verrait jamais les passages non retenus et
produirait un programme **avec des chapitres manquants, sans que rien ne le
signale**. C'est le pire mode de défaillance possible ici.

**Chiffrage corrigé (19/08/2026).** La version initiale estimait un cours de 150
pages à ~80 000 tokens. C'est le chiffre du **texte seul** : en PDF natif, chaque
page part *aussi* en image (c'est ce qui préserve tableaux et schémas, voir §4),
soit de l'ordre de **1 500 à 3 000 tokens par page** — un cours de 150 pages pèse
donc plutôt **225 000 à 450 000 tokens**. Toujours très en deçà du million de la
fenêtre de contexte, mais avec deux conséquences directes : le cache de prompt
n'est pas une optimisation mais une nécessité (§5), et le coût par ingestion est
d'un autre ordre que prévu (§9). **À mesurer pour de vrai** avec
`messages.countTokens` sur un cours réel avant de fixer quoi que ce soit de
tarifaire.

**Document hors-normes :** découpage **séquentiel** (par partie, dans l'ordre de
lecture), ingestion de chaque tranche, fusion des plans. Un découpage par ordre,
pas par pertinence — la couverture reste complète.

### Vecteurs : plus tard, et le terrain est prêt

`pgvector` **0.8.0 est disponible sur le projet Supabase `hhkmrejjksjpfetwefju`,
non installé** (revérifié le 19/08/2026).

Le jour où une vraie recherche sémantique arrivera (recherche côté candidat,
détection de doublons à grande échelle, rattachement automatique question ↔
notion), **les notions sont déjà les chunks** : une notion est exactement ce
qu'un projet classique doit fabriquer artificiellement — une unité de sens
autonome, un seul texte de 280 caractères. Il suffira d'activer l'extension et
d'ajouter une colonne `embedding` sur `workshop_bricks`. Rien à redécouper.

**Aujourd'hui : ne rien vectoriser.** Complexité et coût d'embedding pour un
besoin qui n'existe pas encore.

---

## 4. Fournisseurs : trajectoire et frontière d'abstraction

**Trajectoire décidée :** Claude d'abord (le plus simple à mettre en place) →
DeepSeek ensuite (coût) → à terme, modèles open-source DeepSeek **auto-hébergés
en local**.

### Comment Claude préserve tableaux et images

Ce n'est pas du parsing : **chaque page du PDF est envoyée au modèle comme une
image**, en plus du texte extrait. Le modèle *regarde* la page. D'où la
conservation des tableaux, schémas, colonnes et encadrés qu'une extraction texte
aplatit — et d'où le surcoût en tokens (§3) et les limites (32 Mo, 600 pages).

### Conséquence structurante

Changer de fournisseur **n'est pas un changement d'URL**. Sans lecture PDF
native, il faudra soit extraire le texte (et perdre les tableaux), soit rendre
les pages en images pour un modèle de vision.

**La frontière à isoler n'est donc pas « appeler un modèle » mais « transformer
un document en plan » :**

```ts
// src/lib/ingest/providers/types.ts (à créer)
type PlanProvider = {
  documentToPlan(files: SourceFile[], context: ExistingContent, scope: IngestScope): Promise<unknown>;
};
```

Chaque fournisseur l'implémente à sa façon (Claude : PDF direct ; DeepSeek :
extraction préalable ; local : idem + contraintes matérielles). Le reste du
pipeline — validation, résolution des références, écriture — est **identique quel
que soit le fournisseur**, parce que le contrat de sortie est défini
indépendamment de lui.

### Passer par AWS un jour : deux choses très différentes (vérifié le 20/08/2026)

| | Ce qu'on garde | Ce qu'on perd |
|---|---|---|
| **Claude Platform on AWS** (opéré par Anthropic, parité à J+0) | tout | rien |
| **Amazon Bedrock** (opéré par AWS) | PDF natif, sortie structurée, réflexion adaptative, cache de prompt manuel, citations | **Files API** et **Message Batches**, plus le cache automatique |

La distinction n'est pas cosmétique : ce sont **les deux piliers de la
conception** qui tombent côté Bedrock.

- Sans **Files API**, le document ne peut plus être téléversé une fois puis
  référencé : il repart **en entier dans chaque requête**, une fois par chapitre
  (§5.2). Le cache de prompt évite de le **repayer** en tokens, mais pas de le
  **renvoyer** en octets.
- Sans **Message Batches**, la génération en masse perd son régime asynchrone et
  sa remise de 50 % (§9) — il faut revenir à des appels directs, donc au
  problème de durée qu'on avait justement contourné.

Rien de tout cela n'est bloquant, et **rien n'est à décider aujourd'hui** :
l'interface `PlanProvider` fait que le changement tient dans un fichier. Mais si
la question se pose, elle se pose ainsi : « Claude Platform on AWS » se substitue
sans rien perdre, « Bedrock » demande de repenser le transport du document et le
régime de masse.

---

## 5. Méthode d'appel (ajouté le 19/08/2026)

### 5.1 Trois passes, ancrées sur les notions

L'appel unique « document → tout le programme » est le pire réglage possible : la
qualité des questions décroît à mesure que la sortie s'allonge, la sortie est
plafonnée à 128k tokens, et **un seul JSON invalide fait perdre tout le lot**.

```
Passe 1 — CHAPITRES   1 appel, tous les documents  →  chapitres
Passe 2 — NOTIONS     1 appel par chapitre         →  notions du chapitre
Passe 3 — QUESTIONS   1 appel par chapitre         →  questions, reliées aux notions
```

Les passes 2 et 3 sont parallélisables par chapitre. **Aucune validation humaine
entre les passes** (décision du 19/08/2026) : l'enchaînement va au bout, et le
recours est l'annulation d'import (§10).

Ce que cet ancrage apporte, et qui est le vrai levier de qualité : en passe 3, le
modèle ne reçoit pas « invente des questions sur ce cours » mais « voici les N
notions de ce chapitre, produis les questions qui les font travailler ». Chaque
question **naît reliée à ses notions**, sans qu'on ait à l'imposer par une règle.
Et un chapitre raté se rejoue seul, sans reprendre les 150 pages.

### 5.2 Réglages Claude

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Modèle | `claude-opus-5`, **réglable par passe** | Extraction structurée exhaustive sur document long — le cœur du produit, pas l'endroit où économiser. DeepSeek plus tard, derrière `PlanProvider`. Voir la note ci-dessous : le modèle doit être un réglage, pas une constante enfouie. |
| Réflexion | `thinking: { type: 'adaptive' }` + `output_config: { effort: 'high' }` | Découper un cours en notions est un travail de raisonnement. |
| Sortie | `output_config.format` (JSON Schema dérivé du Zod), **puis** re-validation Zod | Les deux usages prévus au §7. La contrainte native évite l'essentiel des sorties malformées ; Zod reste le filet, et le seul rempart pour un fournisseur sans sortie structurée. |
| Streaming | oui, `max_tokens` ~64 000 | Sans streaming, un gros lot dépasse les délais d'attente HTTP du SDK. |
| Fichier | Files API (bêta `files-api-2025-04-14`) | Le document est **téléversé une fois** et référencé par `file_id` dans les N+1 appels, au lieu de renvoyer des dizaines de Mo de base64 à chaque chapitre. |
| Cache | `cache_control: { type: 'ephemeral', ttl: '1h' }` sur documents + existant | Décisif : les passes 2 et 3 relisent le même document une fois par chapitre. Lecture en cache ≈ 0,1× le prix. TTL 1 h (et non 5 min par défaut) car l'enchaînement s'étale. |

**Ordre du prompt, non négociable** — le cache est un préfixe, le moindre octet
qui change en amont invalide tout ce qui suit :

```
[ système figé ] → [ documents ] → [ existant de l'atelier ] → [ consigne du chapitre N ]
└──────────────── stable, mis en cache ────────────────┘        └──── volatile ────┘
```

Contrôle à câbler dès le premier appel : journaliser
`usage.cache_read_input_tokens`. S'il reste à zéro d'un appel à l'autre, un
invalidateur silencieux traîne dans le préfixe (une date, un uuid, un
`JSON.stringify` d'objet non ordonné).

**Le modèle est un réglage par passe, pas une constante.** Changer de modèle est
alors une chaîne de caractères — utile pour itérer à bas coût pendant la mise au
point, et utile durablement (la passe « questions » est dominée par le coût de
**sortie**, où Haiku est cinq fois moins cher qu'Opus : structure en Opus,
questions en Haiku est un arbitrage sérieux, à mesurer sur la qualité une fois le
pipeline debout). **Deux pièges** :

- **Haiku 4.5 a une fenêtre de 200 000 tokens**, contre 1 million pour Opus 5. Un
  cours de 150 pages (225k–450k tokens, §3) **n'y entre pas** : Haiku convient
  pour itérer sur un petit document de test, pas pour valider le comportement
  réel.
- **Les paramètres de réflexion diffèrent entre générations de modèles.**
  L'implémentation du fournisseur ne doit pas figer des réglages propres à Opus,
  sinon le basculement échoue à l'appel.

### 5.3 Traçabilité : arbitrage tranché

Les **citations** de l'API (`citations: {enabled: true}` sur le bloc document)
rendraient chaque notion traçable à sa page d'origine — l'antidote naturel à
l'hallucination sur un support pédagogique. Mais elles sont **incompatibles avec
`output_config.format`** (400 si on combine les deux).

**Décision du 19/08/2026 : sortie structurée pour la V1**, citations gardées en
tête pour une éventuelle passe de vérification ultérieure. La fiabilité du
premier jet prime sur la traçabilité.

### 5.4 Exécution : unités bornées plutôt que tâche de fond

Il n'y a ni `vercel.json`, ni `maxDuration`, ni file d'attente dans le projet.
Plutôt que de rallonger le délai d'une server action, on **rend la question sans
objet** : chaque appel serveur ne fait qu'**une unité bornée** (une passe, un
chapitre), et le client enchaîne. Aucun appel ne dure longtemps, la barre de
progression est gratuite, un chapitre en échec se rejoue seul.

⚠️ **À reprendre plus tard — ce n'est pas optimisé** (noté le 19/08/2026) :
l'onglet doit rester ouvert pendant toute l'ingestion, et l'orchestration vit
côté client. Le jour où ça devient gênant (gros cours, ingestion en arrière-plan,
reprise après fermeture), il faudra une vraie tâche de fond : route API
déclenchante + état d'avancement en base + reprise. La fonction d'ingestion
elle-même, elle, ne changera pas.

---

## 6. Documents acceptés (ajouté le 19/08/2026)

Cible : tous les formats. Aujourd'hui : **PDF et texte**, parce que ce sont les
seuls que l'API accepte nativement.

| Format | Aujourd'hui | Comment |
|---|---|---|
| PDF (`application/pdf`) | ✅ | Bloc `document` natif — pages en image + texte, tableaux et schémas préservés. **32 Mo et 600 pages maximum.** |
| Texte (`text/*`) | ✅ | Bloc texte / document texte. Aucun coût d'image. |
| Images (`image/png`, `image/jpeg`…) | ✅ techniquement | Bloc `image`. Utile pour une photo de cours ; pas un cas d'usage prioritaire. |
| Word, PowerPoint, Excel | ❌ | **Non acceptés nativement.** Il faudra les convertir (en PDF, ou extraire le texte) côté serveur — chantier à part entière, V2 (`docs/product-spec.md` : « autres formats en V2+ »). |
| Audio, vidéo | ❌ | V2+, hors sujet pour l'ingestion de programme. |

**Trois règles d'implémentation qui en découlent :**

1. **Filtrer à la source, pas à l'appel.** L'écran de génération ne propose que
   les fichiers d'un format pris en charge ; les autres restent visibles mais non
   sélectionnables, avec une infobulle « format pas encore pris en charge par la
   génération ». Jamais un échec d'API en pleine ingestion pour un format qu'on
   savait refusé d'avance.
2. **Plafond de l'app ramené à 25 Mo** (décidé le 19/08/2026). `MAX_FILE_SIZE`
   vaut **50 Mo** dans `src/lib/workshops/files.ts`, alors que l'API plafonne à
   **32 Mo par requête**. La marge n'est pas du confort : un fichier envoyé
   *inline* part encodé en base64, ce qui **gonfle sa taille d'un tiers** — 25 Mo
   de PDF pèsent ~33 Mo dans la requête, déjà au-dessus du plafond, avant même
   d'ajouter le contexte de l'atelier. Deux mesures qui vont ensemble : le
   plafond à 25 Mo **et** le passage par la Files API (le document est téléversé
   à part, il n'est plus dans le corps de la requête, et le plafond de 32 Mo
   cesse d'être la contrainte mordante). **Le contrôle avant appel reste
   nécessaire** : c'est le cumul document + chapitres + notions + questions qui
   peut déborder, pas le document seul.
3. **Plusieurs fichiers en une fois.** Un atelier a plusieurs ressources ; l'appel
   accepte plusieurs blocs `document`. La sélection est donc multiple, dans la
   limite des 600 pages et du budget de tokens cumulés.
4. **Ajouter un format plus tard ne doit rien casser.** Une seule fonction
   traduit « fichier stocké » → « blocs envoyés au modèle », et **une seule
   liste** de formats pris en charge, lue aussi par le sélecteur de fichiers.
   Ajouter le `.docx` = un convertisseur + une entrée dans cette liste ; le
   schéma, la validation, l'écriture et les écrans ne bougent pas, parce que rien
   en aval ne sait qu'il s'agissait d'un PDF. **Le seul piège qui obligerait à
   tout reprendre** : semer des hypothèses « c'est un PDF » dans le prompt ou
   dans l'interface.

---

## 7. Le contrat : un schéma Zod unique

`zod` est **installé (4.4.3) et utilisé nulle part dans `src/`** — ce sera son
premier usage réel.

Un seul schéma décrit le plan, avec des **clés de référence locales** (l'IA ne
peut pas connaître des identifiants qui n'existent pas encore) :

```ts
// Forme cible, à affiner à l'écriture
{
  chapters: [{ ref: "ch1", name: "Les fleuves", position: 0 }],
  // Une notion n'a qu'UN texte depuis le 19/08/2026 (280 caractères).
  notions:  [{ ref: "n1", title: "…", chapterRef: "ch1" }],
  // Une QUESTION est en réalité un GROUPE (au moins une question) — voir
  // QuestionGroup dans src/lib/workshops/questionGroup.ts, qui est le contrat
  // déjà écrit. Ne pas en inventer un second.
  groups: [{
    ref: "g1",
    context: "parcours" | "exam",
    questions: [{
      content: "…",
      responseType: "qcm",       // l'un des 9 types réels (examTypes.ts)
      choices: [...], correctChoices: [...], answer: "…", expectations: "…",
      bloomLevel: 1 | 2 | 3 | 4, // 4 niveaux, pas 6
      notionRefs: ["n1", "n7"],  // remplace l'ancien chapterRef : le chapitre
                                 // d'une question se déduit de ses notions
    }],
  }],
}
```

Ce schéma sert **deux fois** : en sortie contrainte du modèle (§5.2), et en
validation avant écriture — filet indispensable, notamment pour les fournisseurs
sans sortie structurée native.

**Point d'attention :** les identifiants ne viennent jamais du modèle.
`normalizeGroupInput` les recalcule déjà côté serveur ; les `ref` du plan ne sont
que des clés locales, résolues en identifiants réels à l'écriture.

### Réparer ou rejeter : la règle (arbitrée le 19/08/2026)

> **On répare ce qui n'a pas de conséquence de sens ; on rejette ce qui en a une.**

| Cas | Traitement | Pourquoi |
|---|---|---|
| Bloom `6` → `4` | **réparer** | Mapping fondé : l'échelle est passée de 6 à 4 niveaux, « créer » reste le plus exigeant. |
| `sondage` → `qcm`, `ordre` → `liste` | **réparer** | Mappings fondés : ce sont d'anciens noms de types qui existent toujours sous une autre forme. |
| Type inventé (`vrai_faux`…) | **rejeter la question** | Aucun mapping fondé. Le replier sur `textuelle` produirait un vrai/faux rendu en champ de texte libre, avec des propositions devenues inutiles et une bonne réponse qui ne pointe sur rien : une question **silencieusement fausse**, pire qu'une question absente. |
| Notion inexistante ou d'un autre atelier | **rejeter la question** | Intégrité (§11). |

**Rejeter, c'est écarter cette question-là et compter l'écart** (« 3 questions
écartées : type de réponse non reconnu », remonté à l'utilisateur et consigné dans
`ai_imports`) — jamais perdre un lot de 160 pour une ligne.

**Conséquence architecturale à ne pas manquer :** `normalizeGroupInput`
(`questionGroup.ts`) est une porte **tolérante** — sa raison d'être est de
réparer, y compris `toResponseType`, qui replie un type inconnu sur `textuelle`.
Elle ne peut donc **pas** être la porte d'entrée de l'ingestion. L'ordre est :
**Zod strict d'abord** (énumération fermée, rejet et comptage), normalisation
ensuite pour le reste. Les deux fonctions gardent chacune son rôle :
`toResponseType` reste juste **en lecture** — une question déjà en base a été
écrite par un humain, la faire disparaître parce que son type a été retiré
détruirait son travail.

---

## 8. Les points d'entrée (emplacements réels, 19/08/2026)

Un seul moteur d'ingestion, un périmètre (`scope`) différent selon l'entrée.
**Tous ces boutons sont à créer** — celui qui existait dans la banque a disparu
avec la refonte UI.

| # | Emplacement | Comportement | État |
|---|---|---|---|
| 1 | **Paramètres → Ressources** | Bouton « générer par IA » ouvrant des **cases à cocher** : chapitres / notions / questions de parcours | à créer |
| 2 | **Paramètres → Chapitre & Notion** | **Le même bouton, le même dialogue** que le n°1 — deux portes sur la même fonction | à créer |
| 3 | **Liste de questions (examen)** | « + nouvelle » ouvre le choix **IA / manuel** ; l'IA n'ajoute que dans **cette** liste (`context = 'exam'`) | à créer |
| 4 | **Liste de questions (parcours)** | Idem, `context = 'parcours'` | à créer |
| 5 | **Génération d'examens** | Même schéma (« + nouvel examen » → IA / manuel) | **plus tard** |

Deux conséquences de cette disposition :

- les entrées 1 et 2 partagent **un seul composant de dialogue** — le périmètre
  vient des cases cochées, pas de l'écran d'origine ;
- les entrées 3 et 4 sont **sœurs, pas imbriquées** : chacune écrit dans son
  propre contexte, et n'ajoute jamais de questions à l'autre liste.

### Règle transverse : toujours fournir l'existant

**À chaque appel, on transmet au modèle tout ce qui existe déjà** dans l'atelier
— chapitres, notions, questions — afin qu'il ne recrée pas de doublons et
complète l'existant au lieu de le dupliquer. C'est la règle depuis la conception
initiale, et elle est **indispensable**, pas optionnelle.

Conséquences :

- la déduplication est **portée par le modèle**, pas par un algorithme de
  rapprochement côté serveur ;
- l'existant est placé **en tête du prompt**, dans la partie mise en cache (§5.2)
  — c'est ce qui rend son grossissement supportable ;
- **filet à prévoir dès la V1** : refuser côté serveur une notion dont le texte
  normalisé est identique à une notion existante. Le modèle suffit sur un atelier
  jeune ; à 300 notions injectées dans chaque prompt, il finira par en manquer
  une. C'est ce besoin, et lui seul, qui fera arriver pgvector (§3).

---

## 9. Volumétrie et coût

**Décision :** le nombre de questions générées et la répartition des niveaux de
Bloom sont **imposés par le site**, jamais exposés à l'utilisateur.

**Règle retenue et confirmée le 19/08/2026 :** *une question par niveau de Bloom
et par notion*, soit **4 questions par notion**. Le volume est assumé et connu :
**40 notions → 160 questions par ingestion**. Règle provisoire, à ajuster à
l'usage.

Ces règles vivent dans le code (module d'ingestion) et sont injectées dans le
prompt. Elles ne sont **pas** vérifiées par un refus serveur (§11).

**Les deux conséquences à traiter, dans cet ordre :**

1. **Plafonner le nombre de questions produites par ingestion : 50 pour l'instant**
   (décidé le 19/08/2026). C'est un plafond de débit, **pas** un plafond de
   notions : limiter les notions n'est pas viable à long terme — elles sont la
   matière même du produit, et un cours dense en a légitimement beaucoup. On
   borne donc ce qu'une ingestion **produit**, pas ce que l'atelier **contient**.

   > ⚠️ **La cible est 500 à 1000 questions**, et l'architecture doit y tenir dès
   > maintenant. Elle y tient : un seul appel ne pourrait pas rendre 1000
   > questions (la sortie maximale d'une réponse serait dépassée), mais comme on
   > découpe par chapitre et qu'on dépose un lot, cela fait 25 à 50 requêtes
   > bornées, aucune près des limites. **Ne jamais introduire d'étape qui
   > supposerait « tout le lot dans une seule réponse ».**

2. **Générer en masse sans tenir de connexion ouverte : la Batch API.** Les
   requêtes sont déposées en lot, traitées de façon asynchrone, et facturées
   **50 % moins cher**. Elle règle les deux problèmes d'un coup : la question du
   délai maximal d'une fonction Vercel disparaît (on ne tient plus rien ouvert —
   et c'est bien Vercel qui contraint, pas Clerk, qui ne fait qu'authentifier),
   et c'est la seule remise tarifaire structurelle disponible.

   D'où deux régimes, un seul moteur :

   | Régime | Quand | Comment |
   |---|---|---|
   | **Interactif** | petit atelier, l'utilisateur regarde | appels directs (§5.4) |
   | **Masse** | 40 notions, 160 questions | lot déposé, état porté par `ai_imports`, l'utilisateur peut fermer l'onglet |

   À vérifier à l'écriture : le délai réel de traitement d'un lot, et si le cache
   de prompt s'y applique aussi bien qu'en direct — si oui, les deux remises se
   cumulent.

### Ordre de grandeur du coût

Cours de 150 pages, 12 chapitres, `claude-opus-5` ($5/M en entrée, $25/M en sortie) :

| | Sans cache | Avec cache (§5.2) |
|---|---|---|
| Entrée (1 passe 1 + 12 passes 2 + 12 passes 3) | ~$8 à $15 | **~$2 à $4** |
| Sortie (~200 questions) | ~$1 | ~$1 |
| **Total par ingestion** | **$9 à $16** | **$3 à $5** |

Ordre de grandeur, à confirmer par une mesure réelle (`countTokens`). Deux
enseignements déjà solides : **sans cache de prompt, l'ingestion coûte trois fois
plus cher**, et une ingestion vaut l'équivalent d'une fraction notable d'un
abonnement mensuel. **Quota : illimité pour l'instant** (un seul utilisateur,
décision du 19/08/2026), à rouvrir impérativement avec les abonnements.

---

## 10. Écriture en base : directe, avec annulation

**Décision :** pas de prévisualisation. Le plan est écrit immédiatement ;
l'utilisateur constate le résultat dans l'app et annule si besoin.

### Le mécanisme d'annulation

**Une colonne `import_id` (uuid, nullable)** sur `workshop_chapters`,
`workshop_bricks` et `exam_questions`.

- Ligne sans valeur = saisie à la main. Ligne avec valeur = issue de ce lot.
- Migration **expand** pure : rien de supprimé, rien de renommé, aucun impact sur
  le code déployé.
- Annuler = `delete … where import_id = $1`. Les questions emportent leurs lignes
  `exam_question_items` et leurs liens `exam_question_item_bricks`
  (`on delete cascade` en place, vérifié le 19/08/2026).

### Les deux conditions d'annulation

Annulation possible **tant que** :

1. **moins de 24 h** depuis l'import → date de l'import = le plus ancien
   `created_at` du lot ;
2. **aucun élément modifié** → aucune ligne du lot n'a `updated_at` postérieur à
   son `created_at`.

> ⚠️ **Piège d'implémentation — parade trouvée et mesurée le 20/08/2026.**
> `questionToRow` (`src/lib/workshops/exam.ts`) écrit explicitement `updated_at`
> à chaque `upsert`, **y compris à la création** : tout import naîtrait « déjà
> modifié » et le bouton d'annulation ne s'afficherait jamais. **Sur les 130
> questions actuelles, 65 ont effectivement `updated_at > created_at`** — le
> piège n'était pas théorique.
>
> La parade tient à une propriété de Postgres : `now()` renvoie l'heure de
> **début de transaction**. Un INSERT qui omet `created_at` **et** `updated_at`
> leur donne donc une valeur strictement identique — les deux colonnes ont
> `default now()` sur les quatre tables. **Vérifié en base** le 20/08/2026 par
> insertion réelle sur `workshop_chapters`, `workshop_bricks` et
> `exam_questions` : `created_at = updated_at` dans les trois cas.
>
> **Donc : l'écriture d'ingestion doit OMETTRE `updated_at`, pas l'aligner** — et
> surtout pas se rabattre sur une tolérance de quelques secondes, qui finirait
> immanquablement par mentir dans un sens ou dans l'autre. La comparaison reste
> exacte (`updated_at > created_at`).

### Où se trouve le bouton

**Un bandeau, pas une entrée de menu.** « 3 chapitres, 42 notions et 87 questions
ajoutés par l'IA il y a 12 minutes · Annuler », affiché en tête de **chacun** des
écrans concernés (Ressources, Chapitre & Notion, et la liste de questions
touchée) tant que l'annulation reste possible.

Pourquoi : un import touche trois écrans à la fois, donc l'ancrer sur un seul le
rendrait introuvable depuis les autres. Le bandeau naît là où on constate le
résultat, disparaît de lui-même au bout de 24 h (ou à la première modification),
et ne laisse aucune commande destructrice traîner dans un menu une fois le délai
passé.

### Et dans les notifications ? Une option à creuser, pas à écarter

Piste retenue pour plus tard (19/08/2026), avec ses deux faces — à trancher le
jour où la cloche cessera d'être un placeholder (80 lignes, deux exemples en dur,
aucune table, aucun flux : `src/components/NotificationBell.tsx`, gamification V2
dans `docs/backlog.md`).

| Avantages | Défauts |
|---|---|
| **Accessible de partout** — un import touche trois écrans, la cloche les surplombe tous | **Coût d'entrée** : il faut d'abord construire le système de notifications (table, état lu/non lu, flux) — un chantier entier avant la première ingestion |
| **Endroit logique** : « il s'est passé quelque chose sur ton atelier » est exactement une notification | **Bon canal de découverte, mauvais canal d'action** : on y apprend qu'un import a eu lieu, on n'y répare pas ce qu'on a sous les yeux |
| **Trace durable** : survit à un changement de page, là où un bandeau se rate si on n'était pas sur le bon écran | **Éloigne la commande du dégât** : quand ce sont les notions qui sont fausses, l'annulation doit être sur l'écran des notions |
| Prépare le terrain pour l'ingestion **asynchrone** (Batch API, §9), où la fin du traitement doit justement être notifiée | **Deadline invisible** : l'annulation expire à 24 h, une notification ne le montre pas d'elle-même |

**Position actuelle : bandeau d'abord** (contextuel, sans prérequis, impossible à
manquer), **notification en plus** ensuite — les deux, pas l'un ou l'autre. Le
dernier avantage du tableau est le plus fort à moyen terme : dès que la
génération en masse passera par un lot asynchrone, il **faudra** un canal pour
dire « c'est prêt », et l'annulation y trouvera naturellement sa place.

### Pourquoi pas une transaction atomique

Le client Supabase JS ne sait pas faire de transaction multi-requêtes. Une
fonction Postgres (RPC) prenant le plan en JSONB donnerait l'atomicité, mais
ferait vivre la logique métier en SQL — hors du pattern `lib/` et hors des tests
TypeScript.

L'approche retenue n'est pas atomique : un échec en cours laisse un atelier
partiellement rempli. C'est assumé, parce que l'étiquette `import_id` permet de
nettoyer d'un coup — **et parce qu'elle sert bien au-delà de la panne** : annuler
un import qui a *techniquement réussi* mais dont l'IA a mal compris le document.
Aucune transaction ne donne ça.

### Une table minimale d'imports (décidé le 19/08/2026)

Le plan initial excluait toute table (`import_runs`). **Décision révisée : on la
fait**, minimale et purement additive :

```
ai_imports(id, workshop_id, created_by, created_at, scope, file_ids,
           input_tokens, output_tokens, cached_tokens)
```

Raison : l'annulation seule n'en a pas besoin, mais **les quotas** (§9) et la
**ré-ingestion d'un même fichier** en ont besoin tous les deux — savoir ce qui a
déjà été importé, quand, par qui, à quel coût. En prime, de quoi déboguer une
génération ratée et suivre la dépense réelle.

---

## 11. Ce qui est vérifié côté serveur, et ce qui ne l'est pas

**Décision structurante du 19/08/2026.** Deux familles de règles, deux
traitements opposés — ne jamais les confondre :

| Famille | Exemples | Traitement |
|---|---|---|
| **Qualité pédagogique** | nombre de propositions d'un QCM, réponse attendue remplie, répartition Bloom, variété des types de réponse | **Prompt uniquement.** Aucun refus serveur. |
| **Intégrité structurelle** | notion référencée inexistante, ou appartenant à **un autre atelier** ; `bloomLevel` hors 1–4 ; type de réponse inventé ; groupe à zéro question ; **énoncé vide** | **Refus serveur, systématique.** |

**L'énoncé fait partie de l'intégrité, pas de la qualité** (décision du
19/08/2026). Ce n'est pas une exception à la règle mais son application : une
question sans énoncé n'est pas une question, et **l'interface l'interdit déjà**
(`canSave` dans `InlineQuestionEditor.tsx` — bouton désactivé, infobulle). Le
contrôle serveur ne change donc aucun comportement visible ; il rattrape ce qui
ne devrait pas pouvoir arriver. Le minimum est **un caractère** — on n'évalue pas
la qualité de la formulation. Détail (portée `saveQuestion` seulement, refus de
tout l'enregistrement plutôt que du seul énoncé) : `.claude/rules/server-architecture.md`
§ « Énoncé obligatoire ».

**Pourquoi cette ligne de partage.** Un QCM à une seule bonne réponse est un
choix légitime de l'utilisateur, pas une erreur : brider l'écriture au nom de la
qualité reviendrait à lui interdire ce qu'il demande explicitement. La qualité
s'obtient en orientant le modèle, jamais en refusant la donnée.

À l'inverse, aucun utilisateur ne peut *vouloir* qu'une question pointe vers la
notion d'un autre atelier : c'est de la corruption de données. Le contrôle
« notion existante **et du même atelier** » est d'ailleurs aussi une question de
sécurité — une server action est une URL POST publique, et `notionIds` n'est
aujourd'hui recoupé avec rien.

### Que faire quand un contrôle échoue (arbitré le 19/08/2026)

| Contexte | Comportement |
|---|---|
| **Ingestion IA** | Écarter la question fautive, **compter l'écart** et le remonter (« 3 questions écartées : type de réponse non reconnu »). Jamais perdre un lot de 160 pour une ligne. |
| **Saisie manuelle** | **Refuser l'enregistrement et remonter l'erreur.** Retirer silencieusement la notion fautive laisserait l'utilisateur croire qu'il a relié une notion qui ne l'est pas. |

Ce que ça remplace — l'état d'avant le 19/08/2026, mesuré et non supposé :

- **notion inexistante** : la clé étrangère levait, mais **après** l'écriture du
  groupe → question à moitié enregistrée, et l'erreur avalée par le
  `.catch(console.error)` du client (voir `docs/backlog.md`, écritures
  optimistes) ;
- **notion d'un autre atelier** : la clé étrangère passait — elle vérifie que la
  notion existe, **pas qu'elle est d'ici** → le lien inter-ateliers se créait
  silencieusement.

D'où deux points d'implémentation retenus : le contrôle s'exécute **avant toute
écriture** (un refus laisse la base intacte), et il liste **tous** les
manquements d'un coup — corriger un problème pour en découvrir un autre au
ré-enregistrement est une perte de temps, pour un humain comme pour une boucle.

> ⚠️ Le message d'erreur ne sera réellement **visible** par l'utilisateur que
> lorsque les écritures optimistes remonteront leurs échecs (item ouvert de
> `docs/backlog.md`). Aujourd'hui il part dans la console. Le refus, lui, est
> déjà effectif : rien d'incohérent n'atteint la base.

### Le cas particulier de la question sans notion

Une question **peut** n'avoir aucune notion : c'est permis, et l'IA en associe
naturellement sans qu'on l'impose. Mais la conséquence doit être **rendue
visible**, parce qu'elle est silencieuse :

> Une question de parcours sans notion **n'est tirée par aucun exercice, jamais**
> (le tirage passe par les notions depuis le 19/08/2026). Elle est enregistrée,
> elle s'affiche dans la liste, et elle ne sert à rien.

État constaté le 19/08/2026 : **21 des 22** questions de parcours qui portaient un
chapitre manuel sont dans ce cas — héritage de la saisie manuelle, à une époque
où les notions n'existaient pas encore.

**Arbitré le 19/08/2026 : le filtre « sans chapitre » suffit, rien à ajouter.**
Il attrape déjà *exactement* l'ensemble des questions non tirables — « les
questions dont aucune notion associée n'est rattachée à un chapitre, y compris
celles sans notion du tout » (`QuestionListView.tsx`) — c'est-à-dire les deux cas
qui empêchent le tirage, sans en manquer ni en inventer un. Et le phénomène est
appelé à devenir rare : ~99 % des questions seront produites par l'IA, qui relie
les notions à la création. Pas de pastille supplémentaire. Le point reste
consigné dans `docs/backlog.md` pour qu'on ne le redécouvre pas.

---

## 12. Prérequis techniques restants

### 12.1 Collision d'identifiants — ✅ corrigé le 19/08/2026

`emptyQuestion()` (`src/app/[locale]/workshops/[id]/tabs/QuestionEditor.tsx`)
générait `id: 'q' + Date.now()`. En création manuelle, aucun risque ; **en
ingestion, N groupes créés dans la même milliseconde auraient partagé le même
identifiant** → l'`upsert` les écrasant les uns les autres, **silencieusement**.
Remplacé par `crypto.randomUUID()`.

Vérifié avant le changement : **rien n'analyse le préfixe `q`** d'un identifiant
de question. Le seul préfixe réellement interprété est `pb` (`isPageBreakId`,
`examShared.tsx`), et un uuid ne peut pas commencer par `pb` — `p` n'est pas un
caractère hexadécimal.

> À noter : `exam_questions.id` est de type `text` (identifiants générés côté
> client), pas `uuid`.

**Le même piège reste ouvert ailleurs, et se réveillera au point d'entrée n°5.**
Sections (`'sec' + Date.now()`), libellés (`'pool' + …`), examens (`'e' + …`) et
sauts de page (`'pb' + …`) sont encore dérivés de l'horloge. Sans danger
aujourd'hui — ils sont créés un par un, à la main — mais la **génération
d'examens par IA** (§8, entrée n°5) créera des sections en boucle. À traiter à ce
moment-là, avec une réserve : les sauts de page **doivent garder leur préfixe
`pb`**, qui est lu par `isPageBreakId`.

### 12.2 Infrastructure de test — ✅ posée le 19/08/2026, périmètre arbitré

**Fait :** Vitest installé (`npm run test:unit`, `vitest.config.mts`,
`tests/unit/`), avec une première suite de 23 tests sur le contrat exposé à l'IA
(`questionGroup.ts`) et les normaliseurs (`examTypes.ts`). Playwright reste à
installer, hors périmètre de ce chantier.

**Ce qui ne justifie pas de tests :** la *qualité* du contenu produit. Des notions
ou des questions mal fichues se suppriment, et se jugent à l'œil dans l'app.
Aucun test ne remplace ce coup d'œil, et aucun n'est utile pour ça.

**Ce qui les justifie :** trois opérations du pipeline sont **destructrices par
nature**, et elles ne touchent pas que le contenu généré — elles peuvent emporter
ce qui a été saisi à la main.

| Opération | Ce qui casse si elle est buggée |
|---|---|
| `delete … where import_id = $1` (annulation, §10) | Si `$1` arrive à `undefined`, le constructeur de requête **laisse tomber le filtre** et vide la table — chapitres et notions manuels compris. |
| `upsert` par identifiant fourni par le client | Un identifiant généré qui entre en collision avec une question existante **l'écrase silencieusement** (§12.1, tourné vers les données manuelles). |
| Ré-écritures de masse (`saveQuestions`) | Elles touchent des lignes existantes, pas seulement les nouvelles. |

Le contexte aggrave : la base est **partagée avec scellow.com**, il n'y a pas de
transaction (§10), et les `on delete cascade` propagent une suppression aux
questions et à leurs liens.

**Décision du 19/08/2026 :** n'écrire des tests que pour ces **trois fonctions
plus la validation Zod** (elles n'existent pas encore : à couvrir au fur et à
mesure qu'elles s'écrivent, étapes 3 à 5). Pas de suite de tests complète, pas de
Playwright à ce stade. Ce n'est pas « tester avant de livrer », c'est « ne pas
laisser une requête de suppression non testée s'exécuter sur la base de
production ». La règle est consignée dans `CLAUDE.md` §7.

> La vraie réponse de fond — un second projet Supabase pour le développement, au
> lieu de partager la base de production — est notée dans `docs/backlog.md`. Hors
> périmètre de ce chantier.

### 12.3 Absence de suppression multiple

Ni la banque d'examen ni la vue parcours n'ont de suppression multiple. Non
bloquant (l'annulation par `import_id` couvre le besoin), mais à garder en tête.

---

## 13. Décisions prises et questions encore ouvertes

### Tranché le 19/08/2026

| Question | Décision |
|---|---|
| Modification de l'existant | **Ajout seulement.** Modifier/supprimer plus tard. |
| Validation humaine entre les étapes | **Aucune** — les trois passes s'enchaînent. |
| Volumétrie | 1 question par niveau de Bloom et par notion — **confirmé** (§9). D'où : limiter le nombre de notions, et passer par la Batch API pour la masse. |
| Périmètre des tests | Vitest, **uniquement** sur les 3 opérations destructrices + Zod (§12.2). |
| Formats | PDF et texte ; plafond app ramené à **25 Mo** ; Files API (§6). |
| Modèle | Réglable **par passe** (§5.2) — Haiku pour itérer, Opus pour valider. |
| Question sans notion | Le filtre « sans chapitre » suffit, pas de pastille (§11). |
| Quotas / coût | **Illimité** pour l'instant (un seul utilisateur) ; à rouvrir avec les abonnements. |
| Traçabilité | Sortie structurée en V1 ; citations gardées en tête. |
| Table d'imports | **Oui**, minimale (§10). |
| Qualité vs intégrité | Prompt pour l'une, refus serveur pour l'autre (§11). |

### Encore ouvert

1. **Plafond du nombre de notions** (§9) et variété attendue des types de réponse.
2. **Qui peut annuler un import** — gestionnaire, ou propriétaire uniquement ?
3. **Ré-ingestion du même fichier** — comportement attendu si un fichier déjà
   traité est resoumis (la table `ai_imports` donne de quoi le détecter, reste à
   décider quoi en faire).
4. **Seuil de découpage séquentiel** pour un document hors limites (§3).
5. **Cohérence Bloom** — comment le niveau généré s'articulera avec
   `brick_mastery` (voir `docs/backlog.md`).

---

## 14. Ordre de chantier

1. ~~**Installer Vitest**~~ ✅ **fait le 19/08/2026** (§12.2) — 23 tests sur le
   contrat exposé à l'IA et les normaliseurs.
2. **`crypto.randomUUID()` dans `emptyQuestion()`** (§12.1) — bloquant,
   indépendant, une ligne.
3. **Contrôles d'intégrité dans `lib/`** (§11) + pastille « aucune notion ».
4. ~~**`import_id` + `ai_imports` + annulation**~~ ✅ **fait le 20/08/2026** (§10)
   — migration expand appliquée (table `ai_imports`, colonne `import_id` sur les
   trois tables étiquetables, index partiels), module
   `src/lib/workshops/imports.ts` (`assertImportId`, `importCancelState`,
   `getImportSummary`, `cancelImport`), 12 tests sur les deux gardes pures.
   Mécanisme vérifié en base de bout en bout : import simulé, dates identiques,
   annulation par double filtre, lignes manuelles intactes. **Reste à faire au
   moment du branchement** : le wrapper `'use server'` avec authz (volontairement
   non créé — une server action exportée est une URL POST publique, on ne l'ouvre
   pas avant d'en avoir l'usage), l'écriture qui pose les étiquettes (étape 5),
   et le bandeau (étape 7).
5. ~~**Schéma Zod + `ingestWorkshopPlan()`**~~ ✅ **fait le 20/08/2026** (§7) —
   `src/lib/ingest/planSchema.ts` (contrat + lecture défensive) et
   `src/lib/ingest/ingest.ts` (écriture étiquetée), 20 tests. Vérifié comme
   promis : **avec un plan écrit à la main, sans une ligne d'IA** — type inventé
   écarté sans emporter le reste du lot, chapitre pendant réparé en « sans
   chapitre », Bloom 6 ramené à 4, `created_at = updated_at` (donc annulable),
   puis annulation complète. **Reste à faire** : le wrapper `'use server'` avec
   authz, et le `type_options` par type de réponse, aujourd'hui écrit vide.
6. **Interface `PlanProvider` + implémentation Claude** (§4, §5).
7. **Les points d'entrée** (§8), dans l'ordre 1/2 → 3 → 4 → 5.

Les étapes 1 à 5 se construisent et se testent **entièrement sans IA**, et
représentent l'essentiel du travail. Le jour où le modèle arrive, il ne reste que
« document → plan ».

---

## 15. Mise en service de l'API (à faire une fois, avant l'étape 6)

1. **Compte** sur `console.anthropic.com`.

   > ⚠️ **Deux porte-monnaie à ne pas confondre** (constaté le 19/08/2026). Les
   > « crédits d'utilisation » visibles dans les réglages du **forfait Claude**
   > (« pour que votre équipe puisse continuer à utiliser Claude lorsqu'elle
   > atteint la limite de son forfait ») servent à Claude et Claude Code, **pas à
   > l'API**. Le solde de l'API est distinct, dans la console, et c'est le seul
   > que consomment les clés API. Recharger le premier ne donne aucun accès API à
   > l'application.

2. **Moyen de paiement + crédits prépayés.** Oui, une carte bancaire est
   nécessaire ; l'API fonctionne sur des crédits achetés d'avance, pas sur
   facturation à terme. Quelques dizaines d'euros couvrent très largement la mise
   au point.
3. **Plafond de dépense et alerte** dans la console — à poser dès le premier jour.
   C'est le vrai garde-fou tant qu'il n'y a pas de quota applicatif (§9), et il
   protège d'une boucle qui partirait en vrille pendant le développement.
4. **Clé API** → `ANTHROPIC_API_KEY` dans `.env.local` (jamais commité,
   `CLAUDE.md` §8) **et** dans les variables d'environnement Vercel (production +
   preview). À ajouter aussi à `.env.local.example`, sans valeur.

   - **Clé statique, pas fédération d'identité.** La console propose la
     fédération (jetons courts émis par GCP, AWS, Azure ou GitHub Actions) ;
     elle ne couvre pas notre cas — développement local et Vercel. La console le
     dit elle-même : les scripts locaux et les environnements sans fournisseur
     d'identité nécessitent une clé statique.
   - **Expiration : 30 jours pendant la mise au point** (choisi le 20/08/2026).
     Tant que la clé ne sert qu'en local, une expiration ne coûte qu'un
     développement interrompu, constaté dans la seconde. ⚠️ **À rouvrir avant de
     poser la clé dans Vercel** : en production, une clé expirée ferait échouer
     la génération **en silence** — il n'existe aucune remontée d'erreur (voir
     `docs/backlog.md`). Soit on allonge, soit on met en place une rotation, mais
     ce n'est pas une décision à laisser au hasard d'un rappel de calendrier.
5. **Pas de clé en CI** : les tests unitaires ne doivent jamais appeler l'API
   réelle — ils valident le pipeline avec des plans écrits à la main (§12.2).
