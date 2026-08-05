# Refonte UI Culture — Cahier de refonte & méthode

> Document de pilotage de la refonte de l'interface de Culture (scellow.com).
> Usage : (1) feuille de route à suivre, (2) brief à transmettre à Claude Design phase par phase, (3) consignes d'implémentation pour Claude Code.
> Rédigé le 12/07/2026, à partir de l'audit visuel du site en production et du brief d'Alexis.

---

## 1. Résumé du projet

**Objectif** : unifier et professionnaliser l'interface de Culture sur la nouvelle identité (crème/vert/botanique), en priorisant la **structure** (hiérarchie, grille, typographie, navigation) sur l'habillage (illustrations, animations), qui viendra plus tard.

**Périmètre** : tout le site — vitrine publique (landing, pricing, à-propos, contact, auth) + application connectée (dashboard, jardin, atelier, programme, session, génération d'examen, paramètres, profil, création).

**Positionnement visuel** : équilibré pro-chaleureux. Crédible pour une école qui évalue le produit, chaleureux pour un étudiant qui révise. Références : rigueur des cartes N26, chaleur sobre de Claude.ai, lisibilité de progression de Duolingo — sans jamais ressembler à Duolingo (différenciation par le branding botanique, pas par la structure).

**Contrainte structurante** : pas de visuels/illustrations de qualité disponibles à court terme. Le design system doit donc **tenir debout sans images** : chaque écran doit être beau à vide, avec des emplacements réservés pour les futurs visuels (couvertures, jardin, personnages V2).

---

## 2. Décisions actées

Issues du brief et de l'audit — ne pas les rouvrir en cours de route, c'est ce qui fait dériver les refontes.

| # | Décision |
|---|---|
| D1 | Le nom **Culture** est conservé. Le logo peut évoluer. |
| D2 | Le **thème botanique** est conservé comme fil créatif (terreau, graine, jardinier, arroser). |
| D3 | La **famille de couleurs crème/vert/encre/ambre est conservée**, mais son exécution est recalibrée (voir §4). |
| D4 | La **typographie est ouverte** — Inter Tight × Caveat n'est pas un acquis. |
| D5 | **Iconographie : Lucide React uniquement.** Zéro emoji utilisé comme icône système (🌱 ✦ 🔗 👑 → à remplacer partout). |
| D6 | Le **système de tuiles** de l'onglet Génération d'examen (panneaux miniaturisés cliquables) est **abandonné**, remplacé par une navigation standard (voir §7). |
| D7 | Les pages encore sur l'ancienne identité violette (Profil, Pricing, À-propos) sont **migrées intégralement** — aucune trace de violet ne survit. |
| D8 | Les **statistiques factices** de la page À-propos (« 10K+ utilisateurs », « 95% satisfaction ») sont **supprimées** immédiatement, avant même la refonte. Risque de crédibilité réel si une école les voit. C'est un correctif à faire dès maintenant dans le code. |
| D9 | Structure d'abord, habillage ensuite. Aucune illustration n'est un prérequis d'aucun écran. |
| D10 | Le **dashboard devient la page d'accueil-hub**, retravaillé pour être accueillant (voir §3). Le jardin reste à un clic. |

---

## 3. La page principale — analyse et recommandation

**Le dilemme** (tel que posé) : le jardin est le plus engageant mais le plus éloigné du produit réel ; le dashboard est le plus flexible mais pas accueillant ; la page d'un atelier est intermédiaire mais on ne sait pas lequel ouvrir ; le profil n'a pas de sens.

**Recommandation : le dashboard-hub.** Le problème du dashboard actuel n'est pas d'être la mauvaise page — c'est d'être un simple **inventaire** (une grille de cartes) alors qu'un hub doit répondre à la question que l'utilisateur se pose en arrivant : *« qu'est-ce que je fais maintenant ? »*. C'est exactement ce que font tes références : Duolingo ouvre sur le parcours avec la prochaine leçon en évidence, N26 ouvre sur le solde + les dernières opérations + une action.

**Composition cible du dashboard-hub, de haut en bas :**

1. **Bloc d'accueil + reprise** — salutation personnalisée, et surtout une **carte « Reprendre »** : le dernier atelier travaillé, la section en cours, la progression, un CTA « continuer → » qui lance directement la session. C'est la réponse au problème « quel atelier ouvrir » : l'interface décide pour l'utilisateur dans 90 % des cas.
2. **Bande jardin** — une vignette horizontale du jardin (l'île en petit, cliquable, menant à `/garden`). C'est ce qui rend la page accueillante et incarne la marque, sans détourner du produit. Zone d'habillage futur par excellence : à la V2 elle s'animera, aujourd'hui l'île SVG statique suffit.
3. **Mes ateliers / Ateliers rejoints** — les cartes actuelles, retravaillées (voir couvertures §5).
4. **Recherche** — conservée en tête ou intégrée au header.

**Règle de long terme** : quand la gamification V2 sera livrée (plantes liées à la progression, énergie), réévaluer si le jardin peut devenir la home — mais seulement à ce moment-là. Aujourd'hui le jardin est une coquille esthétique ; en faire la home mettrait la partie la moins finie du produit en premier.

---

## 4. La palette — diagnostic et calibration

**Réponse à la critique (« un ami n'aime pas trop »)** : un avis isolé n'est pas un signal suffisant pour abandonner une identité — mais l'audit montre que la critique vise probablement l'**exécution**, pas la teinte. Trois défauts d'exécution rendent la palette actuelle « fade » :

1. **Encre translucide partout.** Le texte est presque systématiquement en `rgba(45,42,36,0.5–0.7)` sur fond crème → tout paraît délavé et les contrastes échouent souvent au seuil d'accessibilité AA (4.5:1). Le texte de premier niveau doit être en encre pleine.
2. **Le vert est dilué.** Il sert à la fois de couleur de surface (fonds, dégradés de couvertures, île du jardin), de couleur d'action (boutons) et de couleur d'état (succès). Quand une couleur est partout, elle ne signale plus rien.
3. **Pas d'échelle de surfaces.** Crème du fond, crème des cartes, blanc des modales cohabitent sans logique d'élévation — l'œil ne sait pas ce qui est au-dessus de quoi.

**Règles de calibration à inscrire dans le design system :**

- **Échelle de surfaces explicite** : fond de page (crème) → carte (blanc ou crème plus clair) → élévation (modale, popover) avec ombre. Trois niveaux, pas plus.
- **Rôles de couleur stricts** : encre pleine = texte primaire ; encre 60 % = texte secondaire uniquement ; **vert = actions primaires et moments de marque, jamais en grandes surfaces décoratives** ; ambre = accent secondaire rare (badges Premium, favoris) ; rouge = danger uniquement ; le succès utilise le vert mais dans une déclinaison dédiée.
- **Contraste** : tout texte porteur d'information passe AA (4.5:1 corps, 3:1 gros titres). C'est mesurable, pas subjectif — ça tranche le débat « on aime / on n'aime pas ».
- **Point de vigilance** : le combo « fond crème chaud + accent terracotta + serif » est devenu un cliché des designs générés par IA. Culture y échappe par le **vert** comme accent (pas terracotta) et par la signature botanique — maintenir cette distance. Ne pas laisser Claude Design dériver vers du terracotta/serif générique.

**Process de validation (au lieu de débattre dans l'abstrait)** : en Phase 1, faire produire par Claude Design **3 calibrations** de la même famille (A : actuelle corrigée en contraste ; B : plus saturée/franche ; C : plus froide/minérale), chacune appliquée aux deux mêmes écrans (dashboard-hub + banque de questions). Montrer les 3 à un panel de 5+ personnes des cibles réelles (au moins 1 enseignant, 2 étudiants) — pas à un seul ami. Choisir, geler.

---

## 5. Le design system — livrable fondateur (Phase 1)

C'est le livrable qui empêche de reproduire la dette actuelle (violet résiduel, styles ad hoc, hiérarchie typographique inexistante). Rien ne se maquette ni ne se code avant qu'il soit gelé.

### 5.1 Tokens

| Catégorie | Contenu attendu |
|---|---|
| **Couleurs** | 8–12 tokens **nommés par rôle** (pas par teinte) : `surface`, `surface-raised`, `ink`, `ink-muted`, `brand`, `brand-strong`, `accent`, `danger`, `success`, `border`. Valeurs issues de la calibration §4. |
| **Typographie** | 2 familles max (display + corps ; la voix manuscrite type Caveat peut survivre comme 3e voix *décorative*, jamais porteuse d'information). Échelle de 6–7 niveaux nommés (display / h1 / h2 / h3 / body / small / caption) avec taille, graisse, interlignage et casse définis. **C'est le correctif n°1 de l'effet « brouillon »** : aujourd'hui minuscules stylisées, MAJUSCULES espacées et graisses ad hoc cohabitent sans règle. |
| **Espacement** | Grille de 4 px (4/8/12/16/24/32/48/64). Interdiction des valeurs hors grille. |
| **Radius** | 3 valeurs (petit : contrôles, moyen : cartes, grand : modales). Le `borderRadius: 20` actuel des modales devient un token. |
| **Ombres** | 3 niveaux liés à l'échelle de surfaces. |
| **Iconographie** | Lucide uniquement, 2 tailles standard (16/20 px), épaisseur de trait unique. |
| **États** | hover / focus visible / active / disabled définis une fois pour tous les composants. |
| **Motion** | 2 durées + 1 courbe standard. Sobriété : les animations riches attendent la phase d'habillage. |

### 5.2 Composants prioritaires

Bouton (primaire/secondaire/danger/ghost) · champ texte + textarea + select · carte d'atelier (avec emplacement couverture, badge Premium, badge rôle) · modale (unifier les ~6 modales de confirmation artisanales existantes en un composant) · ligne de liste dense (voir §5.3) · pilule/badge/chip · onglets et sous-onglets · navigation latérale (paramètres) · toast · barre de progression · switch · état vide (chaque liste vide a un message + une action, jamais un blanc).

### 5.3 Le « mode dense » — spécification pour les écrans experts

*(Clarification du point 3 de l'audit.)* Les écrans à forte densité d'information (banque de questions, éditeur d'examen, membres & rôles, fichiers) souffrent de quatre maux : contrôles trop petits et non alignés, contrastes insuffisants, mélange emoji/Lucide, bordures translucides qui font flotter les blocs. Le mode dense est un jeu de règles dédié :

- Hauteur minimale des contrôles interactifs : 32 px (36 px pour les principaux).
- Alignement en colonnes : dans une liste, chaque type d'information (titre, type, difficulté, actions) a sa colonne à position fixe — pas de contenu qui zigzague.
- Contraste plein sur toute donnée ; l'encre translucide est réservée aux libellés de colonnes.
- Actions par ligne : 3 icônes visibles max, le reste dans un menu « ⋯ ».
- Bordures : une seule valeur de bordure définie dans les tokens ; zébrage ou séparateurs fins pour les longues listes, pas les deux.

---

## 6. Inventaire des écrans et ordre de refonte

L'ordre suit deux critères : l'impact commercial (la vitrine est ce que voit une école) puis la fréquence d'usage.

| Lot | Écrans | Notes |
|---|---|---|
| **Lot 0** | Design system (§5) + calibration couleur (§4) | Prérequis absolu. |
| **Lot 1 — Vitrine** | Landing, Pricing, À-propos, Contact, Sign-in/up | Image commerciale. Pricing et À-propos sont les pages les plus dégradées (violet + stats factices). ⚠️ La landing déconnectée n'a pas pu être auditée (session active) — la capturer avant de maquetter. |
| **Lot 2 — Hub quotidien** | Dashboard-hub (§3), modale Preview, page de création d'atelier | L'écran le plus vu. Y traiter les **couvertures d'ateliers** : remplacer les 4 dégradés génériques par un système génératif (motif botanique dérivé du nom/tag de l'atelier — feuillage stylisé, trame de graines) qui donne une identité à chaque atelier sans aucune image uploadée. |
| **Lot 3 — Apprentissage** | Page atelier + programme éducatif, session d'exercice | La session est déjà bien structurée : la porter au design system, pas la repenser. |
| **Lot 4 — Expert** | Génération d'examen (nouvelle navigation §7), banque de questions, éditeur d'examen, paramètres d'atelier | Mode dense §5.3. Le plus gros lot en volume de code. |
| **Lot 5 — Périphérie** | Profil, éditeur d'avatar, jardin (cadre/UI seulement, pas le rendu de l'île), pages légales | Le rendu esthétique du jardin lui-même est un chantier d'habillage V2, hors périmètre. |

---

## 7. Remplacement du système de tuiles (Génération d'examen)

Le pattern actuel (3 panneaux dont 2 miniaturisés/illisibles servant de navigation) est abandonné (D6). Deux options à trancher **en maquette** au Lot 4 :

- **Option A — sous-onglets** : Historique / Banque de questions / Éditeur d'examen en segmented control sous l'onglet principal. Chaque vue pleine largeur. Simple, prévisible, mobile-friendly.
- **Option B — master-detail pour l'éditeur** : Historique et Banque en sous-onglets ; l'Éditeur devient une vue à 2 colonnes permanentes (banque compacte filtrable à gauche, aperçu A4 à droite) — supprime les allers-retours « envoyer → l'éditeur ».

Recommandation a priori : **A pour la V1** (moins de risque, le flux actuel « envoyer → » est conservé), B en évolution si les tests utilisateurs montrent trop d'allers-retours. Un indicateur persistant « N questions dans l'éditeur » doit rester visible depuis la banque dans les deux options.

---

## 8. La méthode, phase par phase

### Phase 0 — Audit ✅ (fait, 12/07/2026)
Reste : capturer la landing déconnectée ; supprimer les stats factices de l'À-propos (correctif code immédiat, hors refonte).

### Phase 1 — Fondations (Claude Design)
1. Brief à Claude Design : ce document (§1–5) + captures de l'audit.
2. Livrables : les 3 calibrations couleur sur 2 écrans (§4) → panel → choix ; puis la **planche design system** (tokens + composants §5, chaque composant dans tous ses états) ; et 1 proposition de logo si D1 évolue.
3. Critère de gel : la planche passe la checklist §9 et tu peux décrire chaque token de mémoire. **Rien ne passe en Phase 2 avant.**

### Phase 2 — Maquettes par lot (Claude Design)
Pour chaque lot (§6, dans l'ordre) : maquette → revue avec la checklist §9 → **maximum 2 itérations** → gel → lot suivant. La limite d'itérations est volontaire : au-delà de 2, on retouche du goût, plus de la structure.
Chaque maquette d'écran doit inclure : état normal, état vide, état de chargement, et la version mobile (~380 px) pour les écrans du Lot 2 et 3 au minimum.

### Phase 3 — Implémentation (Claude Code)
1. **Les tokens d'abord** : mettre à jour `globals.css` (variables CSS / `@theme` Tailwind) et `src/lib/theme.ts` (qui reste la source de vérité des styles inline, cf. CLAUDE.md). Tant que les tokens ne sont pas en place, aucune page ne se migre.
2. **Les composants partagés ensuite** : bouton, modale unifiée, carte, ligne dense — dans `src/components/ui/`.
3. **Puis les pages, lot par lot**, dans l'ordre du §6. Chaque page migrée : suppression totale des classes `violet-*` et des hex en dur, remplacement des emojis-icônes par Lucide, validation Playwright + vérification visuelle (Claude in Chrome) avant PR — conformément aux règles du CLAUDE.md.
4. Une PR par page ou petit groupe de pages. Jamais de PR « refonte globale ».

### Phase 4 — QA transversale
Passe finale sur tout le site : contrastes AA (outil automatique), focus clavier visible partout, responsive, cohérence inter-pages (même bouton = même rendu partout), chasse aux hex en dur (`grep` des `#` dans les `style={{}}`).

### Phase 5 — Habillage (plus tard, hors périmètre actuel)
Illustrations, couvertures photo, animations du jardin, micro-interactions riches. Le design system aura réservé leurs emplacements ; rien dans les phases 1–4 ne doit en dépendre.

---

## 9. Checklist de revue (à appliquer à chaque maquette et chaque page codée)

1. La hiérarchie se lit en plissant les yeux : on identifie le titre, l'action principale, le contenu.
2. Une seule action primaire (verte) par écran ou par zone.
3. Tout le texte porteur d'information passe le contraste AA.
4. Toutes les valeurs d'espacement sont sur la grille de 4 px.
5. Aucun emoji en guise d'icône ; Lucide partout, taille standard.
6. Les états vide / chargement / erreur existent.
7. Le focus clavier est visible.
8. L'écran reste correct à 380 px de large (ou a une règle de reflow définie).
9. Aucune couleur, ombre ou radius hors tokens.
10. L'écran est réussi **sans aucune image** — les emplacements visuels sont des placeholders assumés, pas des trous.

---

## 10. Consignes de brief pour Claude Design

À joindre à chaque demande de maquette :

- Fournir systématiquement : les tokens gelés (§5.1), la capture de l'écran actuel, et le passage concerné de ce document.
- Contraintes non négociables : palette = tokens fournis (interdire toute dérive terracotta/serif « IA générique »), icônes Lucide, pas d'illustrations requises, texte réel du produit (lexique du CLAUDE.md : atelier, brique, candidat, gestionnaire — jamais de lorem ipsum ni de vocabulaire inventé).
- Exiger les états (vide, chargement, hover des éléments clés) dans la même maquette.
- Ton du copy : tutoiement côté apprenant, vouvoiement côté vitrine institutionnelle ; verbes d'action explicites (« créer l'atelier », pas « valider ») ; la voix manuscrite botanique en accent rare, jamais sur un élément fonctionnel.
- Demander **une** prise de risque par écran maximum (l'élément signature), tout le reste discipliné.

## 11. Risques et garde-fous

| Risque | Garde-fou |
|---|---|
| Dérive « habillage avant structure » (tentation de beaux visuels dès la Phase 2) | Checklist §9 point 10 ; la Phase 5 est explicitement séparée. |
| Implémentation sans tokens → nouvelle dette | Phase 3 étape 1 obligatoire ; interdiction des hex en dur (déjà une règle du CLAUDE.md). |
| Scope creep vers la gamification V2 | Le jardin n'est traité qu'en cadre (Lot 5) ; les plantes/personnages sont hors périmètre. |
| Validation au goût d'une personne | Panel de 5+ personnes cibles pour la couleur (§4) ; checklist objective (§9) pour le reste. |
| Refonte qui casse la prod | Règles CLAUDE.md inchangées : branches, PR, Playwright, jamais de migration destructive. |

---

*Prochaine action : corriger les stats factices de l'À-propos (immédiat), capturer la landing déconnectée, puis lancer la Phase 1 avec Claude Design (calibrations couleur).*
