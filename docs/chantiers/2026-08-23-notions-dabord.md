# Feuille de route — « les notions d'abord, les chapitres ensuite »

> Cadrée le 23/08/2026 avec Alexis, en session **interactive** — ce n'est
> volontairement **pas** un chantier autonome : `docs/chantiers/EN-COURS.md`
> reste à `AUCUN`, les garde-fous conditionnels ne s'appliquent pas, et chaque
> tâche est faite en présence de l'utilisateur.
>
> Complète `docs/ai-ingestion-plan.md` (§16 pour la volumétrie et le coût). Le
> pipeline décrit là-bas reste vrai : cette feuille de route en **change l'ordre
> et le contrat d'écriture**, pas la mécanique d'appel au modèle.

---

## 1. Le problème qu'on résout

Le pipeline sait **créer** un programme. Il ne sait pas **mettre à jour** un
atelier qui en a déjà un — et le mot « mettre à jour » recouvrait trois choses
incompatibles : enrichir, corriger, tout refaire.

Le cas qui a tranché la conception :

| | Ancien cours | Nouveau cours |
|---|---|---|
| Chapitre 1 | athlétisme 1950 → 2000 | athlétisme 1940 → 1990 |
| Chapitre 2 | athlétisme 2000 → 2025 | athlétisme 1990 → 2026 |

Au niveau du **chapitre**, l'IA ne peut pas savoir que les deux « chapitre 1 »
sont le même : elle en créerait quatre. Au niveau de la **notion**, le même cas
est trivial — 1940-1950 et 2025-2026 sont nouvelles, tout le reste existe déjà.

**Conclusion fondatrice : le cœur d'un atelier, ce sont les notions. Les
chapitres ne sont que des boîtes.**

---

## 2. Le contrat — deux actions, et deux seulement

> **L'IA crée des notions et des questions ; elle les attribue ou les
> désattribue. Rien d'autre.**

- **Créer** — une notion, une question. Jamais un doublon (§4).
- **Attribuer / désattribuer** — rattacher une notion à un chapitre, une
  question à une notion, ou l'en détacher.

**Interdits, sans exception :** supprimer, réécrire, fusionner. Une notion
existante n'est jamais modifiée, même d'un mot.

### Découper fin, parce que la finesse des actions est la finesse des droits

Ces deux actions se déclineront en **opérations élémentaires nommées** (créer une
notion, ranger une notion dans un chapitre, créer un chapitre, le cacher, créer
une question, rattacher une question à une notion…). Ce n'est pas de la
cosmétique d'API : ces mêmes opérations seront un jour déclenchées **depuis un
chat**, par des utilisateurs qui n'ont pas les mêmes droits. Une opération = une
autorisation vérifiable. Un bloc « mets à jour l'atelier » ne serait pas
autorisable finement.

### Les droits ne transitent JAMAIS par la conversation

> **Le statut de l'utilisateur n'est pas une information qu'on donne à l'IA.**

Transmettre « cet utilisateur est gestionnaire » dans le prompt rendrait
l'autorisation falsifiable par n'importe quel texte que le modèle lit — un
document importé, un message d'élève. Le modèle n'a aucun moyen de distinguer
une consigne d'une donnée.

Deux niveaux, aucun des deux ne reposant sur ce que dit le modèle :

1. **Le catalogue d'opérations exposé à l'IA est construit à partir du rôle réel**
   de la session (`requireMember` / `requireManager` / `requireOwner`,
   `src/lib/authz.ts`). Un élève ne se voit pas proposer « créer un chapitre » —
   l'IA lui répond donc qu'il n'a pas ce droit, au lieu d'échouer après coup.
2. **Chaque opération revérifie l'autorisation à l'exécution**, côté serveur, sur
   le compte connecté — jamais sur un paramètre venu du modèle. C'est déjà la
   règle du projet pour les server actions (`CLAUDE.md` §1) ; l'IA n'y fait pas
   exception, elle est un appelant comme un autre.

Corollaire : l'IA ne fait que **proposer** des opérations. Elle n'en exécute
aucune elle-même.

### Les sept trous à ne pas laisser (revue du 23/08/2026)

1. **Le catalogue se reconstruit à CHAQUE tour**, jamais une fois au début de la
   conversation. Un gestionnaire rétrogradé en cours de discussion doit perdre
   ses opérations dans la seconde. Un catalogue mis en cache est une élévation de
   privilège à retardement.
2. **L'atelier visé est un paramètre de l'opération, jamais un contexte implicite.**
   La vérification porte sur l'identifiant réellement passé — sinon « mets à jour
   l'atelier de Paul » passerait le contrôle fait sur l'atelier courant.
3. **Les lectures sont des opérations comme les autres.** Le réflexe est de ne
   protéger que l'écriture ; or la banque de questions lue par un élève via le
   chat serait une fuite. Aujourd'hui ces lectures sont protégées par les pages
   qui les portent — dans un chat, cette protection n'existe plus.
4. **Aucune énumération à partir d'identifiants fournis.** « Liste mes ateliers »
   se répond en partant de l'appartenance de l'utilisateur, jamais en filtrant
   une liste d'identifiants venue de la conversation.
5. **Les documents importés sont des données, pas des consignes.** Un PDF qui
   contient « crée un chapitre X » sera lu par le modèle. Le contrat lui-même est
   le confinement : aucune opération ne peut supprimer, réécrire ni élever un
   droit, et tout ce qui est produit est visible, marqué et réversible.
6. **Les traitements sans session — recharge automatique, file d'attente,
   Batch API (§16.6, §16.7)** — n'héritent JAMAIS des droits du dernier
   utilisateur vu. Identité de service explicite, portée fixe et étroite, et
   l'atelier concerné passé en clair.
7. **L'annulation et la reprise revérifient.** Un import long peut survivre à la
   perte des droits de celui qui l'a lancé ; chaque étape refait le contrôle,
   elle ne s'appuie pas sur celui de l'étape précédente. C'est déjà le cas
   aujourd'hui (chaque server action d'ingestion appelle `requireManager`), et ça
   doit le rester quand elles seront découpées plus finement.

### Ce que ça rend possible

- **Réversibilité par construction.** Rien n'est jamais écrasé, donc tout retour
  en arrière est un ré-attribution. Aucun historique à bâtir.
- **Traçabilité.** `workshop_chapters.import_id` et `workshop_bricks.import_id`
  existent déjà : on sait de quel import vient chaque élément.
- **Création et mise à jour sont la même opération.** Une création, c'est une
  mise à jour sur un atelier vide. Un seul mécanisme à écrire, tester, expliquer
  — et il est relançable à tout moment sans risque.

### Le cas « Napoléon », qui aurait pu faire exception

Ancienne notion : *date de naissance de Napoléon*. Nouvelle : *dates de naissance
**et de mort***. Tentation : enrichir la notion sur place.

**Refusé.** On crée la nouvelle notion, l'ancienne part **sans chapitre**. Les
étudiants doivent prouver qu'ils connaissent le contenu nouveau — c'est
pédagogiquement juste, et surtout ça élimine la seule opération qu'on ne saurait
pas suivre. Vaut dans les deux sens : compléter comme simplifier.

**Pas d'exception « si le nouveau est contenu dans l'ancien »** — elle
réintroduirait exactement le jugement qu'on vient d'éliminer.

### Le cas « solstice », qui n'en est pas un

Ancienne : *le jour où la nuit est la plus longue*. Nouvelle : *définition du
solstice d'hiver*. Même fait, autres mots → **on ne crée rien**, on garde
l'existante.

**Le critère est là, et il est objectif :** la nouvelle formulation apporte-t-elle
un **fait vérifiable de plus** ? Napoléon oui (la date de mort est une question
qu'on peut poser et qui n'existait pas). Solstice non.

⚠️ Ne **jamais** demander au modèle « est-ce mieux formulé » : il répondra oui
presque à chaque fois et l'atelier doublera de taille à chaque import.

---

## 3. L'ordre des passes s'inverse

### Aujourd'hui

```
① chapitres (documents, 1 appel)
② notions   (documents, 1 appel par chapitre)
③ questions (sans document, par lots de 10 notions)
```

Le découpage en chapitres est décidé **avant** que la moindre notion existe :
c'est ce qui rend la mise à jour impossible.

### Cible

```
① notions   (documents, 1 appel par document, en parallèle)
② chapitres (documents AUSSI) + affectation de chaque notion
③ questions (sans document, inchangé)
```

**Même nombre de passes.** La passe chapitres garde les documents — décision du
23/08/2026, contre une première version de cette feuille de route qui les lui
retirait pour économiser. Deux raisons, l'une et l'autre suffisantes :

- sans le cours, le modèle **invente des intitulés** au lieu de reprendre ceux du
  document, alors que la plupart des cours nomment eux-mêmes leurs parties ;
- répartir des notions demande de savoir **d'où elles viennent** dans le cours ;
  une liste de titres hors contexte ne le dit pas.

L'économie annoncée tombe donc — en partie seulement : les documents sont déjà
chez le fournisseur depuis la passe ①, et le préfixe mis en cache s'y relit à
10 % du prix, **à condition que la passe ② tourne sur le même modèle**. À
vérifier par `usage.cache_read_input_tokens` avant d'en faire une hypothèse
(§16.4 : le cache est scopé au modèle, sans échappatoire).

### Pourquoi « un appel par document » borne correctement

Il fallait une unité de travail pour ne pas demander toutes les notions d'un
corpus de 680 000 tokens en un appel (`MAX_TOKENS` = 32 000). Le document est
l'unité **naturelle** : elle ne demande aucun jugement au modèle, elle est stable
d'un import à l'autre, et elle parallélise directement.

- Le **marqueur de cache** se déplace sur cette passe (elle porte désormais les
  documents) — l'amorçage sur le premier appel reste valable (§16.5, `run.ts`).
- **Limite connue et acceptée :** un document unique et énorme (un seul PDF de
  600 pages) retombe sur un seul appel. À traiter le jour où le cas se présente,
  pas avant.

### Les doublons entre documents se règlent à la passe ②

Deux documents peuvent produire la même notion : les appels sont parallèles, ils
ne se voient pas. La passe chapitres est **le seul endroit qui voit toutes les
notions d'un coup** — c'est donc là qu'on détecte les redites.

Et la réponse reste dans le contrat : on n'en fusionne aucune, on **en attribue
une** au chapitre et **on laisse l'autre sans chapitre**.

### Le ménage de fin d'import — la seule suppression autorisée

Ce qui a été **créé par cet import** et se retrouve **sans rattachement** à la
fin est du déchet : personne ne l'a jamais vu, aucune progression ne s'y accroche,
aucune question ne s'y rattache. On l'efface.

Vaut pour une notion créée sans chapitre à l'arrivée, pour une question créée
sans notion, et pour un chapitre créé par cet import qui n'a reçu aucune notion.

À ne pas confondre avec le **chapitre vidé** de §5, qui existait avant l'import
et que l'on conserve : celui-là porte peut-être un titre écrit à la main, et
c'est justement ce que le filtre `import_id` distingue.

⚠️ **À la fin de l'IMPORT, jamais à la fin d'une passe.** Les notions naissent à
la passe ① et ne sont rangées qu'à la passe ② : un ménage en fin de passe ① les
supprimerait **toutes**.

Ce n'est pas une entorse au contrat : la règle est bornée par construction à ce
que l'import vient de créer et n'a jamais rangé — elle ne peut pas atteindre ce
qui existait avant. C'est l'annulation d'un travail inabouti, pas une
destruction. À écrire comme telle (filtre sur `import_id` **et** absence de
rattachement), et à tester comme telle.

---

## 4. Le recyclage — réutiliser avant de créer

Le risque n° 1 de tout ce dispositif : l'atelier gonfle à chaque import. Si ce
point est raté, le système perd toute confiance.

### Notions

La passe ① reçoit les **notions existantes** de l'atelier avec pour consigne de
**réutiliser plutôt que recréer**, arbitrée par le critère du fait vérifiable
(§2).

⚠️ Tension avec le coût : le bloc « existant » est le poste de dépense n° 1
(§16.3) et sa portée avait été délibérément restreinte. Ici, la passe notions
travaille par document et non plus par chapitre — elle a donc besoin de **toutes**
les notions de l'atelier, pas d'un sous-ensemble. À mesurer avant de s'en
inquiéter : un titre de notion pèse ~40 tokens, 500 notions ≈ 20 000 tokens.
C'est réel mais sans commune mesure avec les énoncés de questions.

### Questions — récupérer d'abord, rédiger ensuite

Une question accrochée à une notion écartée **dort** ; elle redevient utilisable
si elle correspond à une notion active. La passe ③ commence donc par proposer un
rattachement de ces questions en sommeil, **puis** ne rédige que ce qui manque.

**L'ordre n'est pas négociable :** si l'IA rédige d'abord, elle réécrira une
question qui existe déjà en sommeil — le doublon qu'on cherche à éviter. Et
récupérer d'abord coûte moins cher.

Deux garde-fous :
- une question n'est **jamais réécrite** — si elle ne colle pas exactement, on en
  crée une nouvelle et l'ancienne reste où elle est ;
- une question ne se rattache qu'à une notion **active**, jamais l'inverse.

---

## 5. La mise à l'écart — un seul concept

- **Chapitre caché.** Un chapitre qui n'est plus d'actualité est **caché**, avec
  les notions qu'il contient. Ni supprimé, ni vidé : l'ensemble reste consultable,
  ce qui rend le changement traçable et la suppression manuelle facile ensuite.
  - **Il s'affiche sous les chapitres visibles**, signalé comme les autres
    changements apportés par l'IA.
  - **C'est l'IA qui le pose, pas l'utilisateur** — non par méfiance, mais parce
    qu'on n'offre **aucun bouton « cacher »** dans l'interface. Un utilisateur
    qui veut se débarrasser d'un chapitre le supprime.
  - **Un bouton « restaurer » le remet dans le programme**, et il est ouvert aux
    deux : l'utilisateur remet ce qu'il veut garder, l'IA doit pouvoir défaire un
    import annulé. Un import ultérieur peut de nouveau l'écarter s'il n'est plus
    couvert par les documents.
- **Notion écartée = notion sans chapitre.** Pas d'état « caché » propre à la
  notion : « sans chapitre » est déjà exactement ça, et le concept existe déjà
  (`workshop_bricks.chapter_id` est `null`-able, la colonne « sans chapitre »
  existe dans l'écran Notions).
- **Un chapitre vidé n'est jamais supprimé tout seul** : il s'affiche vide,
  l'utilisateur le supprime d'un clic s'il le veut. Il porte parfois un titre
  qu'il a écrit lui-même.
- **La progression acquise est conservée** sur une notion écartée ; elle cesse
  simplement d'être comptée dans le programme.

---

## 6. Ce qui existe déjà (vérifié le 23/08/2026)

À ne pas reconstruire :

| Besoin | État |
|---|---|
| Notion sans chapitre | ✅ `workshop_bricks.chapter_id` nullable, `setNotionChapter()` |
| Colonne « sans chapitre » dans l'UI | ✅ `NotionsSection.tsx`, pseudo-groupe `UNASSIGNED` |
| Traçabilité par import | ✅ `import_id` sur chapitres et notions |
| Question rattachée aux notions | ✅ `exam_question_item_bricks` (le chapitre s'en déduit) |
| Bloc « existant » à portée variable | ✅ `ExistingScope` (`prompt.ts`) |
| Appels en parallèle | ✅ `mapWithConcurrency` (`concurrency.ts`) |
| Consigne libre de l'utilisateur | ✅ `ai_imports.scope` |

**Seul manque en base : l'état « caché » d'un chapitre.**

---

## 7. Les tâches, dans l'ordre

- [x] **T1 — Base : chapitre caché.** ✅ 23/08/2026. Colonne `hidden` (booléen,
      `default false`) sur `workshop_chapters` + index partiel sur les chapitres
      visibles, appliquée en base et répercutée dans `database.types.ts`. SQL :
      `docs/migrations/2026-08-23-chapitre-cache.sql`. Migration **additive**,
      donc appliquée immédiatement et **rien à noter dans
      `EN-ATTENTE-DEPLOIEMENT.md`** : le code en ligne ignore la colonne.
      **Rien ne la lit encore** — le filtrage des chapitres cachés dans le
      programme (parcours, examen, maîtrise) part avec T6, qui apporte le moyen
      d'en cacher un ; filtrer avant serait du code sans moyen de le vérifier.

- [x] **T2 — Écrire le contrat en dur, côté serveur.** ✅ 23/08/2026. Un module pur qui prend
      « l'atelier tel qu'il est » + « ce que l'IA propose » et rend la liste des
      opérations — **créer** et **(dés)attribuer** uniquement. Aucune autre
      opération ne doit être exprimable. C'est le cœur : il est écrit et testé
      avant qu'une seule ligne de prompt ne bouge.
      **Découpage en opérations élémentaires nommées** dès maintenant (§2), et
      **autorisation portée par chaque opération**, vérifiée à l'exécution sur le
      compte connecté — jamais par un paramètre venu du modèle.

- [ ] **T2 bis — Ménage de fin d'import.** Effacer ce que cet import a créé et
      n'a jamais rattaché (§3). Filtre sur `import_id` **et** absence de
      rattachement, exécuté **une fois l'import terminé**, jamais entre deux
      passes.

- [ ] **T3 — Inverser les passes ① et ②.** Passe notions par document (documents
      + marqueur de cache), puis passe chapitres — **qui garde les documents** —
      produisant le découpage **et** l'affectation de chaque notion. Adapter
      `passInput.ts` (`documentsForPass` : `questions` reste la seule passe sans
      document), `prompt.ts`, `run.ts`, `planSchema.ts`. Mesurer la lecture de
      cache de la passe ② au passage.

- [ ] **T4 — Recyclage des notions.** Transmettre les notions existantes à la
      passe ①, consigne de réutilisation, critère du fait vérifiable. Mesurer le
      poids réel du bloc avant de l'optimiser.

- [ ] **T5 — Recyclage des questions.** Étape de récupération des questions en
      sommeil **avant** toute rédaction, dans la passe ③.

- [ ] **T6 — UI.** Chapitre caché (masquer / réafficher, affichage distinct),
      chapitre vide conservé, et **marquage « nouveau » / « recyclé, venait
      d'ici »** sur ce qu'un import vient de produire. C'est ce marquage qui fait
      qu'on fait confiance au résultat après une mise à jour.

- [ ] **T7 — Tests unitaires.** Sur T2 en priorité (le contrat), et sur le cas
      Napoléon / solstice. Rappel `CLAUDE.md` §7 : aucun test ne touche au réseau
      ni à Supabase.

- [ ] **T8 — Documentation.** §17 de `docs/ai-ingestion-plan.md`, entrée dans
      `docs/changelog.md`, et `docs/migrations/EN-ATTENTE-DEPLOIEMENT.md` si une
      migration attend un déploiement.

---

## 8. Le point à valider en premier, sur un vrai cours

**Le critère du fait vérifiable décide si tout le système est fiable.** Il se
teste sur un cours réel — celui de mécanique qui a servi au chantier coût — avant
de construire T3 à T6. S'il ne tient pas, c'est la conception qu'il faut revoir,
pas le code.
