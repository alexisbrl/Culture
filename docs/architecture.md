# Culture — Architecture

> **Comment le site est construit.** Ce document décrit la **version finale** : ce
> que le produit doit être, pas ce qui est en ligne aujourd'hui. L'écart entre les
> deux se lit en comparant le code à ce document ; `docs/backlog.md` en tient le
> raccourci.
>
> Ce que fait le produit, vu de l'utilisateur : `docs/product-spec.md`.
> Les règles de travail et les conventions de code : `CLAUDE.md`.
>
> **À lire avant d'écrire du code**, quelle que soit la zone. Les décisions
> d'arbitrage et les pièges rencontrés sont en **annexe**, en fin de document — ils
> s'y suppriment dès qu'ils s'éloignent du produit actuel.

---

## 1. Le principe qui tient tout : la logique métier ne connaît pas le transport

Chaque domaine fonctionnel doit pouvoir être exposé un jour par une API publique
**sans dupliquer sa logique**. Ça se prépare à l'écriture, jamais en audit ultérieur.

```
src/lib/<domaine>/…     module PUR — requêtes, règles métier
                        pas de 'use server', pas d'auth(), pas de revalidatePath
                        reçoit des identités déjà résolues : actor: { userId, role }
        ▲
        │ appel de fonction
        │
src/app/actions/…       wrapper FIN, 'use server'
                        1. contrôle d'accès   2. appel lib/   3. revalidation
```

**Ce qui répond à « qui a le droit ? » reste dans le wrapper. Ce qui répond à « que
se passe-t-il ensuite ? » va dans `lib/`.** Seules les préoccupations de transport
HTTP pur — extraire un fichier d'un formulaire — restent dans le wrapper : une API
recevrait le fichier autrement, mais appliquerait les mêmes règles de validation,
donc elles vivent dans `lib/`.

Modules de référence à copier : `members.ts`, `core.ts`, `lifecycle.ts`, `files.ts`,
`exam.ts` dans `src/lib/workshops/`.

Un type métier partagé entre l'interface et une action serveur se définit dans
`src/lib/<domaine>/`, jamais dans un composant puis réexporté.

**Conséquence pour la génération par IA :** elle n'appelle aucune API interne. Le
serveur appelle le fournisseur en HTTPS — seule liaison sortante — puis écrit en base
par appel de fonction. Construire des routes internes pour que le serveur s'appelle
lui-même ajouterait de la latence, referait le contrôle d'accès et perdrait le
typage.

---

## 2. Contrôle d'accès

Point d'entrée unique : `src/lib/authz.ts`.

Trois rangs, `owner` > `manager` > `member`. `requireWorkshopRole(workshopId,
minRole)` et ses raccourcis `requireMember` / `requireManager` / `requireOwner`
renvoient `{ userId, role } | null` ; `assertManager` lève.

**Toute action serveur agissant sur un atelier appelle l'un de ces helpers en tête.**
Une action `'use server'` est une **URL POST publique** : le garde de la page ne
protège rien côté serveur. Même chose pour une route d'API.

Règles de rang, tenues au même endroit : on n'agit que sur un membre de rang
strictement inférieur au sien, jamais sur le propriétaire, et on ne promeut jamais
au-dessus de son propre rang.

**Une seule question de droits par requête.** Tous ces helpers passent par
`getWorkshopRole` (`src/lib/workshops/membership.ts`), mémorisé pour la durée d'**une**
requête : une page qui enchaîne cinq lectures ne paye qu'un aller-retour. La mémoire
ne survit pas à la requête, donc un changement de rôle est visible au rendu suivant.
**Ne jamais lire le rôle directement en base** pour vérifier un droit — la lecture
échapperait à cette mémoire.

---

## 3. La base : accès serveur uniquement

Toute la base est lue et écrite **exclusivement côté serveur**, via
`getSupabaseServerClient` (`src/lib/supabase.ts`) avec la clé de service, qui
contourne la sécurité au niveau des lignes. Aucune table n'est atteinte depuis le
navigateur.

**Conséquence : toutes les tables ont la sécurité au niveau des lignes activée, sans
aucune règle.** C'est voulu, et ce n'est pas à « corriger » — des règles seraient
inutiles tant que l'accès reste entièrement serveur. Le jour où un accès depuis le
navigateur apparaîtrait, il faudrait en écrire pour les tables exposées, et pas
avant.

C'est ce modèle qui a fait écarter l'écoute en temps réel de la base pour rafraîchir
les écrans : elle imposerait un jeton d'authentification jusqu'à la base et des
règles sur chaque table exposée — c'est-à-dire ouvrir précisément ce qui est fermé
ici. La fraîcheur passe donc par un sondage (§9).

**Les types de la base sont générés**, jamais écrits à la main
(`src/lib/database.types.ts`), et régénérés après chaque migration. Les types métier
en dérivent pour ne pas diverger des colonnes réelles.

### Migrations : expand / contract

La base est **partagée par le code local et le code en production**. Une migration
prend effet immédiatement ; un changement de code seulement après déploiement.

- **Ajouter** une colonne ou une table : sans danger à tout moment, le code déployé
  l'ignore.
- **Supprimer, renommer, resserrer, changer un type** : interdit tant que le code
  déployé lit encore cet objet. Beaucoup de lectures ignorent l'erreur retournée →
  l'échec est **silencieux** et casse la fonctionnalité sans alerte.
- Ordre correct pour retirer un champ : déployer le code qui ne l'utilise plus,
  **puis** appliquer la migration.

**Un prérequis de suppression se vérifie sur ce que le code NOMME, jamais sur ce que
les lignes contiennent.** Une requête qui nomme encore une colonne casse dès qu'on la
supprime, quelle que soit l'ancienneté des données.

Ce qui attend un déploiement se note dans `docs/migrations/EN-ATTENTE-DEPLOIEMENT.md`.

### Nettoyage planifié

La suppression définitive des ateliers en corbeille est une tâche planifiée **côté
base**, pas du code applicatif — donc invisible en lisant le projet. Ne jamais
réintroduire un nettoyage dans un chemin de lecture chaud. Limite connue : un projet
mis en pause pour inactivité ne fait pas tourner ses tâches planifiées.

---

## 4. Revalidation du cache

Point d'entrée unique : `src/lib/revalidate.ts`. `revalidateWorkshop()` (page
d'atelier, paramètres, session) et `revalidateDashboard()` (mes ateliers, rejoints,
corbeille, recherche). On appelle l'un, l'autre, ou les deux, selon ce qui change
réellement.

**Jamais de revalidation globale** : elle invalide toute l'application.

---

## 5. Stockage des fichiers

Point d'entrée unique : `src/lib/storage.ts`, indépendant du fournisseur.

En base on ne stocke que des **clés d'objet**, jamais une URL de fournisseur : les
URLs sont signées à la demande. Le navigateur envoie le fichier directement au
stockage, ce qui permet d'afficher la progression. Une migration vers un autre
fournisseur ne devrait toucher que ce fichier.

**Une clé d'objet n'accepte que de l'ASCII** : le nom est translittéré avant d'en
faire une clé. Le **nom affiché vit en base** et ne change pas — c'est lui qu'on
propose au téléchargement. Ne jamais reconstruire une clé à la main à partir d'un nom
de fichier.

---

## 6. Les questions : trois formes, et pas une quatrième

| Forme | Où | Ce que c'est |
|---|---|---|
| **Stockée** | `exam_questions` = le GROUPE ; `exam_question_items` = une ligne par question, ordonnée ; `exam_question_item_bricks` = les notions, reliées à la QUESTION | le modèle réel |
| **Exposée** | `QuestionGroup` — `{ …commun…, questions: [...] }`, au moins une | le contrat vers l'IA et une future API |
| **Éditée** | `Question` — question principale + parties | la vue de l'éditeur |

La question principale reprend l'identifiant de son groupe : c'est ce qui garde
valides les clés de barème, les sections d'examen et les brouillons.

**La conversion entre la forme stockée et la forme éditée est confinée à
`src/lib/workshops/exam.ts`.** Aucun composant, aucune autre fonction ne lit ni
n'écrit ces tables directement — c'est ce qui a permis de changer le stockage sans
toucher à l'interface, et ce qui permettra de le refaire.

Les écritures sont **différentielles** : on met à jour les lignes voulues et on
supprime les seules lignes disparues. Une question liée garde sa ligne et ses liens de
notions d'une édition à l'autre. Ne jamais revenir à « tout effacer puis tout
réinsérer », qui perdrait les liens et pourrait laisser un groupe sans question.

**Le niveau de difficulté qualifie le couple question ↔ notion, pas la question.** Une
même question peut faire restituer une notion et analyser une autre. Quatre niveaux,
en progression : reconnaître, restituer, appliquer, analyser.

**Une question doit avoir au moins un caractère d'énoncé**, la principale comme chaque
question liée. Tenu à deux niveaux : bouton désactivé dans l'éditeur, et refus
serveur. Le refus porte sur l'enregistrement d'**une** question, jamais sur une
ré-écriture de masse — échouer sur une question sans rapport ferait avorter une
opération qui n'a rien demandé. Un refus annule tout l'enregistrement, jamais
seulement l'énoncé fautif : conserver l'ancien texte serait une réparation
silencieuse.

### Ajouter ou retirer un type de réponse

Un type touche **onze endroits**, dont deux échouent **en silence** si on les oublie :
l'ordre du menu de l'éditeur (le type devient inutilisable dans l'interface tout en
étant valide partout ailleurs) et la liste blanche des réglages transmis au candidat
(un réglage non listé n'arrive jamais, sans la moindre erreur). La liste ordonnée est
en annexe **C**.

**Une exception à connaître : le QCM à réponse unique n'a pas d'entrée de menu.**
C'est le même type que le QCM pour l'utilisateur, avec une pastille qui bascule. Toute
lecture qui compte les types « visibles » — variété demandée à l'IA, filtres,
statistiques — doit compter les deux **comme un seul**.

---

## 7. La génération du programme par IA

Le cœur du produit, et la partie la plus dense.

### 7.1 L'objectif, et la règle qui prime

À partir des documents de l'atelier, produire **les chapitres, les notions rattachées
à leur chapitre, et les questions reliées aux notions** — sans saisie manuelle, sans
doublon avec l'existant, et **sans validation humaine entre les étapes**.

> **L'absence de point d'arrêt est une décision produit, pas une simplification.**
> Faire intervenir l'humain entre deux étapes casse ce qui fait la valeur du produit.
> Le recours n'est pas la validation, c'est **l'annulation** (§7.8).

### 7.2 Ce que reçoit chaque appel : le voisinage, jamais le tout

Le cours entier n'entre qu'une fois, dans le premier appel.

| Étape | Ce qu'elle reçoit |
|---|---|
| **Chapitres** — 1 appel | le **texte seul** des documents, tous les chapitres, toutes les notions |
| **Notions** — 1 appel par chapitre | les **pages de son chapitre** (texte et images), les notions qui lui sont attribuées |
| **Questions** — 1 appel par notion | la **notion seule**, ses questions existantes, les intitulés des notions voisines |

Trois gains du même geste : moins de bruit par appel (qualité), moins de jetons
répétés (coût), appels courts et indépendants (parallélisme).

**Ce qui rend le reste possible : l'étape chapitres rend des bornes de pages.** Pour
chaque chapitre, le document et l'intervalle de pages — plusieurs intervalles si le
chapitre est éclaté. Sans elles, l'étape suivante devrait recevoir le cours entier
pour retrouver son chapitre ; avec elles, elle reçoit dix-sept pages.

**L'étape chapitres reçoit tout l'existant, et c'est acceptable** : elle est la seule
à voir le cours, donc la seule à pouvoir juger ce qui est encore d'actualité. C'est un
seul appel, et une notion est une ligne de texte — même à mille notions, le bloc reste
modeste.

**Elle ne reçoit que le texte.** Trouver où commence un chapitre est un travail de
structure — titres, sommaire, ruptures de sujet — pas de lecture d'illustrations. Les
images gardent toute leur valeur à l'étape des notions, où le contenu d'un tableau
devient une notion.

**Le repli sur l'image se décide page par page, jamais document par document.** Une
moyenne sur un document cache le cas qui compte : un cours à moitié saisi et à moitié
scanné passerait le seuil et perdrait la moitié de son contenu, en silence. Pour
chaque page : assez de texte extrait → texte seul ; sinon la page part **aussi** en
image. Une page pauvre en texte n'est pas forcément un scan, mais **rater une
frontière de chapitre coûte infiniment plus cher que quelques milliers de jetons**.

**La reconnaissance de texte se fait au dépôt du document, jamais à la génération.**
Elle ne coûte alors aucune seconde au moment où l'attente se voit, elle est payée une
fois par document et s'amortit sur toutes les relances. Quatre choses dans l'ordre, de
la moins chère à la plus chère : lire la structure du PDF (gratuit — et les **pages
vides s'y retirent purement et simplement**, elles sont fréquentes dans un cours
imprimé) ; vérifier si une couche de texte est déjà présente ; reconnaître les
caractères sur les seules pages qui en manquent ; un modèle multimodal en dernier
recours. Un document dont la reconnaissance a échoué retombe sur la règle par défaut :
ses pages partent en image. **Rien ne bloque, rien n'attend.**

### 7.3 Le découpage physique : le modèle dit où, le serveur coupe

Un modèle ne lit jamais « seulement les bonnes pages » d'un document qu'on lui a
donné : tout ce qui est envoyé entre dans le contexte et est facturé.

1. **Couper le PDF par pages, jamais le texte par caractères.** Découper le texte
   perdrait les images de pages, donc les tableaux et les schémas — c'est-à-dire ce
   que l'envoi en image sert à préserver.
2. **En cas de doute, élargir.** Bornes qui se chevauchent : garder les deux pages en
   double, un chevauchement ne coûte que des jetons. Bornes qui laissent un trou :
   rattacher les pages orphelines au chapitre précédent. **Perdre une page produit une
   notion manquante que rien ne signale** — le pire mode de défaillance de tout le
   système.
3. **Ne jamais échouer sur des bornes absentes.** Chapitre sans bornes exploitables :
   sa tranche est le document entier. Plus cher, jamais faux, et écrit au
   compte-rendu.

### 7.4 L'étape 0 : lire la consigne, écrire ce qui manque

La seule étape qui parte d'une demande plutôt que d'un document. **Elle ne se déclenche
que s'il y a une consigne** — sans consigne, elle ne part pas et ne coûte rien, ce qui
est le cas de la plupart des générations.

Trois gestes, et aucun autre :

1. **Écrire son document** — un cours, un complément, une correction.
2. **Réécrire la consigne** transmise aux étapes suivantes.
3. **Fixer le nombre de questions d'un examen**, si la demande en exprime un, même en
   toutes lettres. *Ce geste n'existe pas pour l'entraînement*, dont la volumétrie est
   automatique : le modèle n'est même pas informé que la possibilité existe.

**Un atelier a au plus un document écrit par l'IA**, l'unicité étant tenue en base. Il
apparaît dans les ressources, marqué comme tel, téléchargeable et supprimable mais
**pas modifiable à la main** : pour le changer, on redonne une consigne. À chaque
génération, l'IA peut le compléter, en retirer ce qui n'est plus d'actualité, ou n'y
pas toucher — elle en rend alors la version complète, jamais un rapiéçage.

> ⚠️ **Les documents de l'utilisateur ne sont jamais modifiés.** Une correction s'écrit
> dans le document de l'IA, qui vient **s'ajouter** au cours, jamais à sa place. C'est
> ce qui permet d'annoter un cours sans le dénaturer, et de revenir en arrière en
> supprimant un seul fichier.

L'en-tête du document est posée **par le code** à chaque écriture, jamais demandée au
modèle : elle doit être là à tous les coups, et un modèle à qui on demande de recopier
une en-tête finit par ne pas le faire.

**Elle demande les documents, on ne les lui donne pas d'office.** Le premier appel ne
porte que leurs **noms**. La règle est binaire : **si elle décide d'écrire, tout le
corpus lui est joint au tour suivant, sans qu'elle ait rien à désigner** — un nom de
fichier ne dit pas fiablement ce qu'il contient, et une redite non vue coûte plus cher
qu'un aller-retour. Le champ de demande ne sert qu'au cas inverse et rare : lire un
document précis **sans** avoir décidé d'écrire.

**Elle reçoit une commande et ne sort pas de son rôle.** La consigne lui est présentée
comme **une donnée à interpréter**, jamais comme une instruction qui lui serait
adressée. Tout ce qui n'est pas de la matière pédagogique — agir sur un compte ou des
droits, obtenir des informations sur le système, lui faire tenir un autre rôle, traiter
un sujet illégal ou sans rapport — est **retiré : pas exécuté, pas transmis, pas
commenté**. Silencieux à l'écran ; enregistré au journal, ce qui dira si le champ sert
à autre chose qu'à demander du cours, sans transformer chaque maladresse en reproche.

> ⚠️ **Le retrait ne mange que le verbe, jamais ce qu'il porte.** « Crée-moi une
> question qui demande de lister trois fleuves » perd « crée-moi » et **garde tout le
> reste** : une demande qui précise le CONTENU d'une question n'est ni une demande de
> cours, ni une demande hors-rôle.

**La consigne réécrite fait autorité, même vide.** C'est la présence de la réponse qui
compte, jamais son contenu : retomber sur la consigne brute réinjecterait mot pour mot
ce qu'on venait d'écarter.

**Elle ne fait jamais échouer une génération.** Réponse illisible, document impossible
à écrire, envoi raté : la génération continue sans le document.

### 7.5 Ce que le modèle a sous les yeux, et dans quel ordre

L'ordre d'autorité est porté par le bloc système, donc toutes les étapes l'ont :

1. **La consigne de l'utilisateur** — elle fait foi sur la FORME du travail :
   découpage attendu, niveau de détail, vocabulaire, et jusqu'à la correction d'une
   erreur du cours. Elle n'autorise jamais à traiter un sujet que les documents
   n'abordent pas.
2. **Le document écrit par l'IA**, s'il existe — rédigé après les autres et pour les
   compléter, il l'emporte **sur les points qu'il traite, et sur eux seuls**.
3. **Les documents du cours** — ils font foi sur les FAITS.
4. **Le titre et la description de l'atelier** — de quoi DÉDUIRE le contexte : public,
   niveau d'exigence, registre, vocabulaire. Jamais une information sur ce que le cours
   contient. C'est la seule chose qui distingue un BTS d'une classe de quatrième — mais
   un intitulé peut être vague ou resté d'une version précédente : **s'il contredit les
   notions, ce sont les notions qui font foi**.
5. **Ce qui existe déjà dans l'atelier** — de la matière à compléter, jamais une
   preuve : un contenu en place a pu être écrit d'après une version précédente du
   cours, et c'est le document qui le corrige, pas l'inverse.

**Le document fait autorité même quand il est faux ou fictif** — un cas d'école, un
pays imaginaire, un texte de fiction se traitent comme des faits établis, sans être
corrigés d'après le monde réel ni signalés comme irréels.

**Contre l'invention, la fidélité l'emporte sur l'exhaustivité.** Les deux exigences se
contredisent par construction : couvrir tout pousse à combler, n'inventer rien pousse à
s'abstenir. **Une lacune se voit et se comble ; une invention se lit comme du cours et
ne se corrige jamais, parce que rien ne la signale.** Un point que le document
n'aborde pas ne produit rien, et c'est une réponse valide.

Deux gestes qu'on confond, et un seul est permis : **expliciter** ce que le document
laisse implicite est le travail attendu ; **ajouter** un sujet qu'il n'aborde pas est
interdit, même s'il manque manifestement — l'atelier ferait travailler ce que
l'enseignant n'a pas enseigné, et personne ne s'en apercevrait.

Deux règles de plus là où l'invention entre réellement, **les propositions fausses d'un
QCM, que personne ne relit** : une proposition fausse l'est **par rapport à la
notion**, elle n'affirme aucun fait extérieur invérifiable ; et pas de « toutes les
réponses ci-dessus », pas de « aucune de ces réponses », pas d'énoncé à la forme
négative en entraînement — ce sont des tests de lecture, pas de connaissance. *La forme
négative est tolérée à l'examen, sans être encouragée : en entraînement la correction
est automatique et sert à mesurer une maîtrise, on ne saurait pas distinguer « a mal
lu » de « ne sait pas » ; un examen, lui, cherche à départager.*

**Le temps de réponse est le réglage le plus concret qu'on sache donner.** « Niveau 2 »
ne dit rien de la longueur attendue ; « trente secondes à une minute » dicte la taille
de l'énoncé, le nombre de propositions et l'ampleur de la réponse.

**Chaque notion sera lue seule**, sans le cours et sans les autres : aucune ne commence
ni ne continue par un renvoi vers l'extérieur. On nomme ce dont on parle à chaque fois,
quitte à répéter.

**On réutilise plutôt que de recréer, et la recherche porte sur les FAITS, pas sur les
phrases** — chiffres, noms propres, dates, termes techniques, et non la façon dont
c'est tourné. Une notion voisine ne se produit que si elle apporte un **fait vérifiable
de plus**. Dans le doute, on ne produit pas : une notion manquante se rattrape au
prochain import, un doublon reste et encombre l'atelier.

### 7.6 Le rangement, l'ordre, et ce qui sort du programme

**C'est l'étape CHAPITRES qui écarte, parce qu'elle seule voit le cours.** L'argument
n'est pas l'élégance, c'est **où vit l'information** : l'étape de rangement ne reçoit
aucun document, elle ne voit que des noms de chapitres — elle trouve donc légitimes
deux chapitres qui se recouvrent.

**La forme : le rang de chaque chapitre, 0 pour ceux qui sortent.** Le modèle rend
l'architecture entière, chapitres neufs et anciens mêlés, avec un rang par chapitre.
Demander le rang de **chacun** plutôt qu'une liste d'écartés oblige à statuer sur chaque
chapitre existant, là où une liste se remplit au gré de ce que le modèle remarque.

**Et pourtant l'omission reste inoffensive** — c'est tout le dispositif : un chapitre
absent de la réponse **garde sa place et reste au programme**. C'est le rang 0 qui
écarte, jamais le silence. Trois invariants tiennent le reste, tous testés : une
référence inconnue est ignorée, un chapitre créé dans la même réponse ne peut pas être
écarté, et ne rien dire ne déplace ni ne retire rien.

**Garde-fou serveur : jamais tous.** Écarter chaque chapitre existant en un import n'est
presque jamais une décision — c'est une consigne mal lue ou un document déposé par
erreur. On n'applique rien et on le dit. Le cas légitime existe, mais il se fait en
deux fois.

**L'ordre s'applique tout ou rien.** On ne réordonne que si chaque chapitre encore au
programme a reçu un rang : un classement partiel est une consigne ambiguë — les oubliés
iraient où ? Comme l'ordre est cosmétique, ne rien changer est toujours moins grave que
remuer un programme sur une réponse incomplète, et c'est dit au compte-rendu. Seule la
**suite** des rangs est lue, jamais leur valeur.

**Une partie qui se resserre se règle sans renommage** : le modèle crée le nouveau
chapitre **et** écarte l'ancien. Les notions encore d'actualité rejoignent le nouveau ;
les autres restent dans l'ancien et sortent du programme avec lui. Un renommage aurait
gardé les notions périmées sous le nouveau titre.

**Une notion que l'IA ne range pas ne bouge pas.** Le modèle n'a qu'une façon de dire
« nulle part » : un chapitre vide. Cette réponse recouvre deux situations, distinguées
**côté serveur, jamais côté modèle** — une redite dont la ressemblance lui avait été
soumise sort du programme ; tout le reste **reste où il était**.

**Mais une notion NEUVE non rangée n'est pas créée.** À la fin, toute notion née de cet
import et restée sans chapitre est effacée. Le motif de la règle inverse — ne pas
détruire ce que personne n'a jugé — s'est retourné en pratique : les oublis
s'accumulaient d'une génération à l'autre, hors programme, jamais tirés et jamais rangés
par personne. Le remède au rangement raté est de **relancer la génération**. Les notions
antérieures à l'import, elles, ne sont jamais touchées.

**Le chapitre suit ses notions** : un chapitre dont il ne reste que des notions que
personne n'a su placer est écarté avec elles dedans. Le bouton « restaurer » reste ainsi
honnête — il rend une partie avec son contenu, jamais une boîte vide.

**Ce qu'on refuse : offrir les chapitres écartés au modèle comme troisième choix de
rangement.** Ce serait la réponse confortable pour tout ce qu'il ne veut pas trancher,
et le hors-programme grossirait tout seul sous une étiquette qui a l'air propre. Il ne
voit que les chapitres visibles.

**Le rattrapage des notions sans verdict** : ces notions partent dans **chaque** appel
de l'étape suivante, étiquetées — *celle-ci n'a été rangée nulle part ; dis si elle
relève de ton chapitre, sinon ignore-la*. Départage quand plusieurs chapitres la
réclament : son chapitre actuel s'il est parmi eux (la règle qui ne déplace rien sur une
ambiguïté), sinon le premier dans l'ordre du programme (déterministe, et indépendant de
l'ordre d'arrivée des réponses), sinon elle ne bouge pas. Chaque arbitrage est écrit au
compte-rendu : une notion déplacée par départage n'est pas la même chose qu'une notion
rangée franchement.

> **Le rattrapage est un filet pour les oublis, jamais un pansement sur un échec.**
> Au-delà d'un seuil, on ne l'applique pas : un tel volume n'est pas une distraction du
> modèle, c'est une étape chapitres ratée. Sans ce seuil, le rattrapage masquerait
> exactement la panne qu'on veut voir.

Les seuils sont **proportionnels** — ce qu'on mesure est la part des notions sur
lesquelles le modèle a renoncé à statuer ; cinq oubliées sur vingt est un signal fort,
cinq sur mille n'est rien. Une seule borne absolue, très basse : **une** notion isolée ne
déclenche jamais rien. Sous 10 % on continue ; au-delà, un **appel de complément qui ne
redemande que ce qui manque** (redemander à l'identique retronquerait une réponse trop
longue) ; après ce complément, sous 25 % on accepte, au-delà **on s'arrête et rien n'est
écrit**. Le second seuil est plus tolérant, et c'est voulu : à ce stade on a déjà tenté
ce qu'il fallait tenter, et une génération imparfaite vaut mieux qu'une génération
refusée.

**Un taux élevé se corrige dans la consigne, pas dans le seuil.** Ces chiffres sont un
détecteur de fumée ; le journal enregistre la part réelle à chaque passe, et ces valeurs
vivent dans un réglage nommé, jamais en dur au milieu du code.

### 7.7 Entraînement et examen : deux régimes

| | Entraînement | Examen |
|---|---|---|
| Unité de compte | **la notion** | **le programme** |
| Portée d'une question | une seule notion | **plusieurs** notions croisées |
| Volumétrie | automatique, par notion | **total réglable au lancement** (1 à 200, défaut 40) |
| Découpage des appels | par lot de notions | par tranche de budget |
| Groupes | rares | une part importante |

Le total de l'examen se règle **au moment de lancer**, pas dans un écran de réglages :
c'est là qu'on sait si l'on veut un contrôle de dix questions ou un examen blanc de
soixante. Relancer **ajoute** ce total, en voyant la liste existante pour ne pas se
répéter.

**Ce qu'on découpe côté examen n'est pas la matière mais le budget.** Chaque appel
reçoit une **tranche contiguë du programme**, ce qui donne les deux garanties dont dépend
le parallélisme : rien n'est écrit deux fois (deux appels ne voient jamais la même
partie), et rien n'est perdu (la somme des budgets fait le total demandé). Un chapitre
peut être coupé en deux, et c'est voulu — sinon un chapitre de trois cents notions et un
de cinq recevraient le même budget, et l'examen serait bâti sur la structure du cours
plutôt que sur sa matière.

**La forme de l'examen se décide avant le premier appel.** La part de questions en
groupes se calcule sur l'examen **entier**, et chaque appel reçoit une forme
**homogène** : ou bien tout en groupes, ou bien tout en questions isolées. Demander la
même proportion à chaque appel produisait un examen fait d'une suite de triplets
identiques, aucun groupe ne pouvant dépasser la taille d'un appel. Les appels isolés sont
**répartis entre** les appels groupés, sinon le début du cours n'aurait que des
enchaînements et sa fin que des questions seules.

**Les tailles de groupes ne sont pas dictées** : imposer une composition interdirait un
groupe de six là où la consigne de l'utilisateur en demande un, **et c'est son examen**.
On conseille un ordre de grandeur — **une seule formulation, jamais deux : deux façons de
dire une consigne la font passer pour deux consignes** —, on autorise plus grand quand la
situation le nourrit, et on **préfère explicitement une question laissée seule à un
groupe étiré**.

**Le découpage ne sert pas à fabriquer de la variété.** Faire varier la taille des appels
pour pousser le modèle à composer autrement a été essayé puis écarté : un appel n'invente
pas, il exécute, et une place rognée casserait une demande de l'utilisateur sans que rien
ne le dise. La règle est la plus simple possible : **des appels pleins, et le dernier
s'ajuste** ; un dernier appel trop court pour un groupe prend au précédent.

**Le serveur ne décide rien du découpage** : il reçoit l'indice de sa tranche, le nombre
total de tranches, son budget et sa forme. Deux appels d'un même plan doivent voir la
même découpe du programme. Le rattrapage se replanifie de la même façon.

**Un groupe n'a pas d'énoncé commun.** Il ne partage qu'une image ou un son ; le décor —
la situation, les données, l'extrait — est posé par la **première question**, et les
suivantes s'appuient dessus. ⚠️ **Cette exception doit être écrite dans la consigne** : le
bloc système exige qu'une question se comprenne seule, et sans contre-indication
explicite le modèle rend des « groupes » de questions indépendantes — c'est-à-dire pas
des groupes. La règle exacte : **c'est le GROUPE qui se comprend seul, pas chacune de ses
questions.** Corollaires : on coupe à la question près, jamais au groupe ; un groupe
amputé de sa **première** question part en entier ; et les groupes s'écrivent **en
premier**, ce qui met la coupe du budget à la fin, là où elle ne peut plus amputer un
enchaînement.

**Les groupes ne sont pas réservés à l'examen.** L'entraînement tire déjà des groupes —
l'écrasante majorité n'en comptent qu'un —, et l'écran sait enchaîner. La consigne dit
donc : une question est seule dans son groupe, **sauf** si deux ou trois ne se
comprennent que dans l'ordre. Garde-fou explicite : un groupe dont les questions
tiendraient seules n'est pas un groupe.

**Un examen ne recopie pas l'entraînement.** Les deux listes ne se voient jamais — les
verser l'une dans l'autre ferait revenir le poste de coût qu'on a supprimé. La
vérification est donc **locale et gratuite**, faite après coup sur les énoncés produits :
ce qu'on cherche est la **recopie**, pas la parenté. Deux questions qui travaillent le
même fait sous deux angles doivent passer — d'où un seuil très strict, qui ignore déjà la
ponctuation, les accents, la casse, les mots-outils et l'ordre des mots. **Le manque est
rattrapé, une fois** : sans ça, un examen de 40 en rendrait 34 sans le dire ; le
rattrapage redemande exactement ce qui manque, en un appel, et ne se répète pas — un
atelier dont le programme ne porte pas quarante questions ne les portera pas davantage au
troisième essai.

**La similarité entre questions n'est vérifiée nulle part, et ce n'est pas un oubli.** La
règle est **l'inverse de celle des notions** : deux notions qui disent la même chose sont
un doublon à éliminer ; deux questions qui font travailler le même fait sont exactement ce
qu'on veut — on n'apprend pas une addition en la posant une seule fois. Le calcul de
ressemblance reste réservé aux notions.

### 7.8 L'écriture : directe, étiquetée, annulable

**Pas de prévisualisation.** Le plan est écrit immédiatement ; l'utilisateur constate dans
l'app et annule si besoin.

Chaque élément créé porte l'**étiquette de sa génération**. Annuler = tout retirer d'un
coup. Deux conditions : **moins de 24 h**, et **aucun élément modifié**.

> ⚠️ **L'écriture d'ingestion doit OMETTRE la date de modification, pas l'aligner.** Un
> enregistrement qui l'écrit explicitement — y compris à la création — fait naître tout
> import « déjà modifié », et le bouton d'annulation ne s'affiche jamais. Les deux
> colonnes ont le même défaut, et l'heure de début de transaction leur donne une valeur
> strictement identique. La comparaison reste donc exacte ; surtout pas de tolérance de
> quelques secondes, qui finirait par mentir dans un sens ou dans l'autre.

**Un bandeau, pas une entrée de menu.** « 3 chapitres, 42 notions et 87 questions ajoutés
par l'IA il y a 12 minutes · Annuler », en tête de **chacun** des écrans concernés. Un
import touche trois écrans à la fois : l'ancrer sur un seul le rendrait introuvable depuis
les autres. Le bandeau disparaît de lui-même et ne laisse traîner aucune commande
destructrice.

**Pas de transaction atomique, et c'est assumé.** Un échec en cours laisse un atelier
partiellement rempli — l'étiquette permet de nettoyer d'un coup, **et elle sert bien
au-delà de la panne** : annuler un import qui a techniquement réussi mais dont l'IA a mal
compris le cours. Aucune transaction ne donne ça.

Une table d'imports porte le périmètre, la consigne, les jetons consommés et le coût. Elle
sert à l'annulation, aux quotas, à la détection d'un fichier déjà traité, et au journal
(§8).

### 7.9 Ce qui est vérifié, et ce qui ne l'est pas

| Famille | Exemples | Traitement |
|---|---|---|
| **Qualité pédagogique** | nombre de propositions d'un QCM, réponse attendue remplie, répartition des niveaux, variété des types | **Consigne au modèle uniquement.** Aucun refus. |
| **Intégrité structurelle** | notion inexistante ou **d'un autre atelier**, niveau hors bornes, type de réponse inventé, groupe à zéro question, énoncé vide | **Refus serveur, systématique.** |

**Pourquoi cette ligne de partage.** Un QCM à une seule bonne réponse est un choix
légitime de l'utilisateur, pas une erreur : brider l'écriture au nom de la qualité
reviendrait à lui interdire ce qu'il demande. La qualité s'obtient en orientant le modèle,
jamais en refusant la donnée. À l'inverse, personne ne peut *vouloir* qu'une question
pointe vers la notion d'un autre atelier — c'est de la corruption, et aussi une question
de sécurité, puisqu'une action serveur est une URL publique.

**Réparer ou rejeter :** on répare ce qui n'a pas de conséquence de sens — un ancien nom
de type qui existe encore sous une autre forme, un niveau hors échelle ramené dans
l'échelle. On **rejette** ce qui en a une : un type inventé replié sur « réponse libre »
produirait une question **silencieusement fausse** — des propositions devenues inutiles,
une bonne réponse qui ne pointe sur rien —, pire qu'une question absente.

**Rejeter, c'est écarter cette question-là et compter l'écart** (« 3 questions écartées :
type de réponse non reconnu »), jamais perdre un lot pour une ligne.

**Deux comportements opposés selon le contexte :** en génération on écarte et on compte ;
en **saisie manuelle on refuse l'enregistrement et on remonte l'erreur** — retirer
silencieusement la notion fautive laisserait l'utilisateur croire qu'il a relié une notion
qui ne l'est pas. Le contrôle s'exécute **avant toute écriture** et liste **tous** les
manquements d'un coup : corriger un problème pour en découvrir un autre est une perte de
temps, pour un humain comme pour une boucle.

> **Conséquence architecturale à ne pas manquer :** la normalisation d'entrée
> (`normalizeGroupInput`) est une porte **tolérante** — sa raison d'être est de réparer.
> Elle ne peut donc pas être la porte d'entrée de l'ingestion. L'ordre est :
> **validation stricte d'abord** (énumération fermée, rejet et comptage), normalisation
> ensuite. La tolérance reste juste **en lecture** : une question déjà en base a été
> écrite par un humain, la faire disparaître parce que son type a été retiré détruirait
> son travail.

**Une question peut n'avoir aucune notion**, et la conséquence doit être rendue visible :
une question d'entraînement sans notion **n'est tirée par aucun exercice, jamais** — le
tirage passe par les notions. Le filtre « sans chapitre » attrape exactement l'ensemble
des questions non tirables, sans en manquer ni en inventer une.

### 7.10 La recharge automatique

**C'est le seul appel payant du produit que personne ne décide** — ni gestionnaire, ni
membre. D'où trois garde-fous.

Elle se déclenche au **lancement d'un exercice**, et rien d'autre : c'est le seul moment
où l'on sait à la fois **qui** travaille et **sur quoi**. Elle part **après** que la
question est partie à l'écran — le membre n'attend jamais après elle — et elle survit à la
fermeture de l'onglet.

Ce qu'elle fait produire : ce qu'un radar déclare en manque **pour le membre qui lance**,
en couples (notion × niveau). Un seul couple sous le seuil suffit à déclencher, et on
remet alors **tous** les couples du chapitre à la cible — sinon on rechargerait un
exercice sur deux.

Les trois garde-fous : un **plafond** par recharge (ce qui n'est pas produit reste en
manque et sera repris au lancement suivant) ; un **délai de garde** par chapitre (deux
exercices lancés coup sur coup ne rechargent qu'une fois, et une recharge qui vient
d'échouer ne repart pas en boucle) ; une **trace** — chaque recharge ouvre un lot d'import
comme n'importe quelle génération, donc son coût est compté et son contenu reste
annulable.

**Les seuils sont absolus, jamais en pourcentage.** Un seuil proportionnel ferait
recharger les gros ateliers plus tôt que les petits : ce qui compte pour un élève, c'est
**combien de questions il lui reste**, pas quelle fraction du stock. Et on regarde **un
cran au-dessus**, pour qu'un élève qui progresse ne trouve pas le niveau suivant à sec.

**Il n'y a qu'une façon de demander des questions** — une liste de couples avec un nombre
pour chacun. Ce qui change est **qui remplit le formulaire** : un chapitre neuf reçoit un
budget de démarrage réparti sur ses notions ; une recharge reçoit ce que le radar déclare
en manque ; une **consigne écrite à la main ne dit rien du stock**, donc on envoie large
et c'est le modèle qui choisit.

**La règle du plafond sur les notions secondaires.** Une question écrite pour combler un
couple doit être **posable** au membre qui l'a déclenchée — or une question ne se pose que
si toutes ses notions sont à sa portée. On ne demande pas pour autant une seule notion par
question : le modèle tairait les autres et on perdrait la seule chose qui compte, la
vérité sur ce que la question fait travailler. La consigne est donc un **plafond** : les
autres notions sont déclarées librement, mais aucune au-dessus du niveau de la principale.
Si le modèle dépasse, la question est **conservée** — c'est du contenu valide —, elle ne
compte simplement pas pour le couple visé, et le radar redemandera. Aucune pression à
mentir, aucun rejet.

**Le bloc des énoncés existants est plafonné.** Le volume d'un appel ne dépend pas du total
de la banque : un appel ne voit qu'une notion, et demander plus de questions produit plus
de tranches, pas des tranches plus grosses. Reste un seul axe qui grandit sans limite —
une notion qui accumule des centaines d'énoncés. Deux mesures suffisent : **un
échantillon** plus **le compte total** (dire le nombre vaut presque autant que les montrer
tous), et **les plus récents**, jamais les plus anciens — ce sont ceux que le modèle vient
d'écrire, donc ceux qu'il risque le plus de reproduire.

### 7.11 Une génération à la fois, par atelier

Deux générations sur le même atelier écrivent les mêmes chapitres et les mêmes notions, et
le ménage de fin de l'une peut cacher ce que l'autre vient de remplir. Ce n'est pas deux
fois plus de contenu : c'est un programme incohérent et deux fois la facture. **Sur deux
ateliers différents, rien n'est bloqué** — aucune écriture n'y est partagée, et seul le
débit vers le fournisseur l'est, qui se régule tout seul.

**Le verrou est un signe de vie, pas un interrupteur.** Un drapeau posé par un onglet qui
meurt brutalement ne se relâcherait jamais et bloquerait l'atelier sans recours. L'onglet
qui travaille **bat** régulièrement ; un lot sans battement depuis quelques minutes cesse
de bloquer. Une fin propre — terminée, arrêtée ou en erreur — relâche immédiatement.

**Les recharges automatiques ne battent jamais** : elles tournent en tâche de fond,
l'utilisateur n'en sait rien, et lui refuser un lancement à cause d'elles serait
incompréhensible.

**Quitter la page** demande confirmation, mais **le texte n'est pas le nôtre** : les
navigateurs imposent leur propre formulation. On ne peut que provoquer la question, pas la
rédiger. Ce n'est pas grave — les questions sont écrites au fur et à mesure, donc un import
interrompu ne casse rien : ce qui est écrit reste, et le bandeau d'annulation le propose
comme n'importe quel autre lot. L'écran propose aussi d'**ouvrir le site dans un second
onglet**, celui qui travaille restant intact derrière.

### 7.12 Coût : ce qui le gouverne

**Le poste dominant est le corpus, pas la sortie.** Un PDF natif part en texte *et* en
image, soit plusieurs fois le poids du texte seul. Tout ce qui réduit le nombre de fois où
le cours est envoyé réduit la facture d'un ordre de grandeur.

**Le cache de prompt a disparu avec le découpage, et c'est cohérent.** Il existait pour
répondre à « on renvoie le même cours vingt-cinq fois ». Quand on cesse de le faire, chaque
contenu n'est plus lu qu'**une fois** — et poser un marqueur sur un contenu jamais relu
coûte plus cher que ne pas en poser. **Découpage et cache ne sont pas complémentaires : ce
sont deux stratégies concurrentes, et le découpage gagne** — moins cher, et meilleur en
qualité.

**Le nombre de chapitres est un multiplicateur.** Un découpage quatre fois trop fin
multiplie par quatre tout ce qui suit. C'est le paramètre le plus rentable à surveiller,
d'où la vérification automatique du découpage **dans les deux sens** — trop fin et trop
grossier —, qui remet en cause l'**échelle** et jamais le contenu, et dont reconduire le
découpage à l'identique est une réponse valide.

**Le modèle est un réglage par étape, jamais une constante.** Le gradient : modèle fort là
où c'est structurant et rare, modèle économique là où c'est mécanique et massif. Le
découpage en chapitres est le jugement le plus structurant du pipeline et ne coûte qu'un
appel ; rédiger quinze questions de mémorisation sur une notion déjà extraite est la tâche
la plus répétée. ⚠️ **Contrainte dure : un modèle à petite fenêtre ne peut pas recevoir un
gros corpus** — l'appel est *refusé*, pas mauvais, et aucun réglage ne le contourne.

**On mesure, on n'estime pas.** Chaque appel journalise ses jetons (§8). Tout chiffre de
coût qui n'a pas été mesuré sur un cours réel n'est pas un argument.

### 7.13 Les limites physiques

Elles forment une chaîne, et chacune borne un débordement que la précédente ne voit pas.

- **25 Mo par fichier et par atelier** — le plafond par fichier ne borne rien tant qu'on
  peut en déposer trente.
- **1 000 notions par atelier**, création manuelle comprise. Le chiffre aligne le produit
  sur ce que la machine sait faire d'un coup : un titre de notion pèse une quarantaine de
  jetons, donc mille tiennent dans une seule réponse de modèle, là où deux mille n'y
  tiennent pas. **Rien n'est dit au modèle** — le plafond n'est pas une consigne
  pédagogique, et l'annoncer le ferait rationner sa production. On écrit jusqu'au plafond,
  puis **on s'arrête en le disant** : le cours est trop gros pour un seul atelier.
  ⚠️ « Les mille premières » doit avoir un sens **ordonné** — par document puis par page —
  et le message doit dire **où la coupe tombe**. Une troncature à un endroit arbitraire
  donnerait un atelier qui a l'air complet et ne l'est pas, ce qui est pire que le refus.
- **100 000 questions par atelier**, entraînement et examen confondus, comptées sur ce qui
  est **déjà en base** et jamais par import. Le franchissement produit un message clair au
  gestionnaire, jamais un échec muet — et c'est le seul motif légitime pour qu'un exercice
  se retrouve sans question à poser.
- **1 à 200 énoncés d'examen par lancement**, 500 questions par import — ce dernier est un
  **fusible** contre une boucle emballée, pas un quota, et il doit rester au-dessus de
  l'usage nominal.
- **Le mur de lecture** — la plus grande fenêtre, moins la réserve de sortie
  (**raisonnement compris** : les jetons de réflexion se prélèvent sur le budget de
  réponse, ils ne s'ajoutent pas à côté), moins une réserve pour ce que la mesure ne voit
  pas — car on ne compte que le socle et les documents, quand l'appel réel porte aussi tout
  le contexte de l'atelier. Au-delà, **on refuse avant de créer le lot**.

Le **compte de documents** a été écarté à raison comme limite : on le contourne en
fusionnant tout dans un seul PDF.

**Un document encore hors-normes après tout ça** se traite par découpage **séquentiel**,
dans l'ordre de lecture, et fusion des architectures. Jamais par pertinence : le modèle ne
verrait jamais les passages non retenus et produirait un programme avec des chapitres
manquants, sans que rien ne le signale.

---

## 8. Le journal de bord des générations

Une panne qu'on ne compte pas ne se traite pas. Le journal est le patron à reprendre pour
toute observabilité qu'on ajouterait ailleurs.

Deux niveaux : **une ligne par génération** (son issue, d'où vient la commande, l'état de
l'atelier avant) et **une ligne par appel au modèle** (l'étape, le lot, le fournisseur, le
**modèle qui a réellement répondu**, le nombre d'essais, la durée, les compteurs de jetons,
ce qui a été produit, et la cause de l'échec).

Quatre règles, et elles ne sont pas négociables :

- **La cause vient d'une liste fermée**, doublée du message brut du fournisseur. On compte
  les codes, on lit les phrases — une cause en texte libre ne se compte pas, et un journal
  qui ne se compte pas ne répond à aucune question.
- **Écrire dans le journal ne doit jamais faire échouer ce qu'il observe.** Au pire il
  manque une ligne.
- **Des comptes et des motifs, jamais du contenu** : ni énoncé, ni extrait de document, ni
  donnée personnelle. « Combien, à quelle fréquence, combien de temps, pour quel prix » —
  pas « quoi ».
- **Enregistrer aussi les réussites, et l'heure de début.** Sans le total, un nombre
  d'échecs ne veut rien dire. Et **l'issue se déduit aussi de ce qui n'est pas écrit** :
  une génération sans issue est une interruption — onglet fermé, machine éteinte —, que
  personne n'était plus là pour consigner. La première issue écrite gagne : un échec ne
  doit pas être recouvert par une réussite de politesse arrivée derrière.

**Le classement des pannes est pur et testé** : c'est lui qui décide de dépenser un appel
de plus. On lit le **code** posé sur l'erreur avant son texte — les fournisseurs
reformulent leurs messages, ils ne renumérotent pas leurs codes.

**Une relance, et une seule.** Ce qui n'est pas passager ne l'est jamais : un corpus trop
volumineux le sera encore dans trois secondes, une réponse illisible aussi, et une
annulation doit rester une annulation. Le plafond est volontairement bas — on trace
d'abord, on affinera sur des chiffres, le journal enregistrant le nombre d'essais
réellement faits.

**Ce que coûte un échec** n'est pas le refus lui-même — une demande refusée pour saturation
n'est pas traitée, donc pas facturée — mais **tout ce qui a été payé avant l'arrêt et qu'il
faut repayer en relançant**.

**Conservation :** le détail par appel se garde six mois ; avant chaque suppression, un
**résumé mensuel est calculé et conservé pour toujours**. ⚠️ **On ne supprime jamais un mois
qui n'a pas déjà son résumé** — les deux gestes sont séparés de six mois, et c'est ce
décalage qui rend l'erreur possible. La purge vérifie la présence du résumé et **refuse
d'agir sans lui**, au lieu de se fier au calendrier : un mois non résumé s'accumule, ce qui
se voit et se répare ; un mois effacé sans résumé est perdu pour toujours.

---

## 9. La fraîcheur des données sans rafraîchir la page

**Règle de site : ce qui arrive de l'extérieur s'affiche sans que l'utilisateur ait à
rafraîchir**, comme un message qui tombe. Point d'entrée unique : `useLiveData`, qui
rappelle simplement l'action de lecture ayant déjà servi au premier chargement.

**Sondage, pas notification poussée — et c'est une décision, pas un pis-aller** : voir §3.
Coût du compromis : quelques dizaines de secondes de retard quand l'onglet est au premier
plan, et zéro dès qu'on y revient — le seul moment où l'on regarde.

Trois comportements que le point d'entrée tient, et qu'il ne faut pas réécrire à la main :

- **Un onglet caché n'est pas sondé**, et une lecture immédiate a lieu au retour. Un onglet
  oublié toute la nuit ne coûte rien.
- **Invalidation après toute modification locale réussie.** Une lecture partie *avant* la
  mutation peut revenir *après* : sans ce jeton, la demande qu'on vient d'accepter
  réapparaît quelques secondes plus tard. C'est le piège principal, et il ne se voit pas en
  test manuel rapide.
- **Jamais deux lectures en parallèle**, et un plancher entre deux.

**On sonde ce qui ARRIVE, jamais ce qu'on ÉDITE.** Une liste qui se réordonne sous les
doigts fait perdre la ligne qu'on visait. Le prérequis côté serveur est simple : une donnée
qu'on veut voir arriver en direct doit avoir une action de lecture qui se rappelle **sans
effet de bord**.

---

## 10. Ce qui bloque l'affichage d'une page

- **Une seule question de droits par requête** (§2).
- **Lire le jeton plutôt qu'appeler le service d'authentification.** `auth()` lit le jeton
  déjà présent dans la requête ; `currentUser()` part sur le réseau chercher tout le
  profil. Ne prendre le second que si l'on affiche vraiment le profil.
- **Une écriture n'a pas à retarder une lecture.** Tout effet de bord qui ne change rien à
  ce qui s'affiche part **après** la réponse.
- **Ce qu'un onglet fermé n'a pas besoin de montrer ne bloque pas la page.** Les sections
  arrivent en flux dans leur propre attente, alimentées par un petit composant serveur par
  section. L'invariant du montage permanent tient toujours : on ne diffère que
  l'**arrivée** du contenu, jamais son montage.

> ⚠️ **Les actions serveur s'exécutent EN FILE, une par une.** Deux appels lancés ensemble
> depuis le navigateur ne se chevauchent pas. Conséquences : lancer deux actions « en
> parallèle » côté client ne parallélise **rien** — ça coûte un aller-retour de plus et une
> seconde vérification de rôle ; deux lectures qui vont ensemble se fusionnent en **une
> seule action** dont le corps fait le parallélisme, là où il est réel. Et **tout appel
> monté au chargement d'un écran passe devant ce que cet écran affiche** : avant d'ajouter
> une lecture au montage, se demander ce qu'elle fait patienter.

---

## 11. L'interface

### 11.1 Les couleurs passent toujours par les tokens

Le design system n'a que six familles — vert, tan, encre, danger, or, surfaces — et
**jamais de blanc pur ni de gris neutre**. Une couleur sans équivalent direct se cherche par
distance colorimétrique parmi les tokens ; si le rôle sémantique manque, on l'ajoute au
thème plutôt que de laisser une valeur en dur.

**Une couleur choisie par l'utilisateur en fond** : le texte posé dessus se calcule par
luminance perçue. Jamais une encre fixe sur un aplat dont on ne maîtrise pas la valeur.

**Une teinte catégorielle** — distinguer plusieurs catégories sans réutiliser indéfiniment
la couleur de marque — se déclare dans un petit tableau nommé et documenté du thème, jamais
dispersée dans les composants.

### 11.2 La mise en page

Le layout empile un en-tête puis le contenu. **Ne jamais utiliser la hauteur de fenêtre
brute** sur le conteneur racine d'une page : on ajouterait systématiquement la hauteur de
l'en-tête en trop.

L'en-tête de l'espace connecté est **collant** et reste dans le flux, donc aucune page n'a
de compensation à faire — **mais tout autre bloc collant doit décaler sa position** sous
peine de se glisser dessous.

**Contexte de navigation persistant sans requête bloquante.** Hors page d'atelier, l'URL ne
porte aucun atelier, et l'en-tête a besoin du dernier visité. Le lire en base ajouterait une
requête bloquante au rendu de *toutes* les pages ; le lire dans le navigateur n'agit
qu'après hydratation, donc le bloc apparaît en sursaut. Le pattern retenu est un **cookie
écrit par le navigateur et lu par le serveur** : présent dans le HTML initial, coût nul,
rafraîchi en arrière-plan. L'identité y est vérifiée à la lecture — poste partagé.

**Borner un texte qui déborde se fait en largeur, jamais en caractères.** Un plafond de
caractères coupe des noms qui avaient la place de tenir et laisse passer les caractères
larges. La borne se pose sur l'élément — et **dans une grille, la colonne aussi doit
pouvoir se réduire**, sinon c'est elle qui cède et les colonnes suivantes sortent de
l'écran. **L'infobulle de secours ne se déduit alors plus du texte** : la coupe se décide au
rendu, donc elle se mesure.

### 11.3 Les infobulles

**L'attribut `title` du HTML est interdit** : il est dessiné par le système d'exploitation,
hors du document, donc aucun style ne l'atteint. Une règle de lint le refuse sur **toute**
balise et n'excepte qu'une liste nommée — nos propres composants dont c'est une vraie
propriété. **C'est cette règle, et non une recherche de texte, qui fait foi** pour recenser
les infobulles.

> **Le sens de l'interdiction compte.** Sa première version ne visait que les balises HTML,
> en supposant qu'un composant à nous ne transmettait pas l'attribut au document. C'était
> faux d'un composant de lien, qui le pose sur sa balise — une infobulle système est restée
> invisible du lint. D'où l'inversion : **interdit partout, autorisé nommément**. Ajouter un
> nom à la liste, c'est affirmer que ce composant ne transmet rien au document.

Quatre règles qui vont avec : un contenu vide ne monte rien ; **une infobulle n'est pas un
nom accessible** (elle décrit, elle ne nomme pas — un bouton sans texte visible garde son
propre libellé accessible) ; **un bouton désactivé n'émet aucun événement de souris**, donc
l'infobulle se pose sur un conteneur ; et **jamais deux infobulles imbriquées**, entrer dans
un enfant ne faisant pas sortir du parent.

Deux réglages qui ont l'air cosmétiques et ne le sont pas : le délai d'ouverture est
**long**, et il n'y a **pas de fournisseur partagé** — celui-ci partage le délai entre bulles
voisines, si bien que balayer une rangée de boutons fait clignoter une bulle par bouton.

### 11.4 Fermeture des panneaux au clic extérieur

Deux règles indissociables :

- **Le clic qui ferme ne fait que ça.** Il n'atteint pas ce qu'il y avait dessous. Un panneau
  ouvert capture le premier clic ; il en faut un second pour agir. Sans ça, quitter un
  panneau déclenche au passage l'action de l'élément survolé.
- **Toutes les couches se ferment dans le même geste.** Ne jamais faire qu'une couche se
  mette en retrait tant qu'une autre est ouverte : il faudrait alors autant de clics que de
  couches.

Le défilement ferme aussi, mais **seulement celui d'un conteneur qui porte le panneau** —
c'est la raison même de le fermer, puisqu'il finit par passer par-dessus la barre de
navigation. Les modales sont hors du jeu : elles se posent au-dessus et gèrent leur propre
sortie.

### 11.5 Modifications non enregistrées

Pour les pages de formulaire sans bouton d'enregistrement permanent : un état unique
regroupant tous les champs, comparé à un instantané pour savoir si quelque chose a changé. Si
oui, une barre flottante apparaît, et tout clic sur un lien interne ouvre une confirmation
plutôt que de naviguer. La fermeture d'onglet est couverte à part. Ajouter un champ, c'est
l'ajouter à cet état — la barre suit toute seule.

### 11.6 Préparer une page au survol

Une page part **à l'intention** — survol, premier contact du doigt, focus clavier — et non au
clic, une seule fois par visite. **Pas la préparation automatique du framework**, qui se
déclenche à l'entrée dans le champ de vision : sur une barre de navigation, tous les onglets
sont visibles en permanence, donc chaque ouverture de page ferait calculer toutes les autres.

**La zone de déclenchement est le lien lui-même.** Un halo plus large attrape aussi les
**clics**, et il y a une douzaine de pixels entre deux boutons voisins.

---

## 12. Traductions

Toute chaîne visible passe par le système de traduction **dès l'écriture**, dans les deux
langues. Jamais de littéral dans le rendu, jamais de migration différée.

Les deux fichiers sont **toujours synchronisés** : une clé manquante dans l'un casse
l'exécution. Le typage des clés est vérifié **à la compilation**, pas par le seul contrôle de
types.

Un **espace de noms par page ou fonctionnalité**, clés en camelCase imbriqué. Attention aux
collisions entre l'espace connecté et le marketing public.

**Les emails se construisent dans la langue du destinataire**, jamais de celui qui déclenche
l'action : l'émetteur d'une suppression peut naviguer dans une langue alors que le
propriétaire notifié en lit une autre, et un email lu plus tard n'a plus de contexte. La
langue de chaque compte est persistée et synchronisée depuis l'URL. Pour un envoi groupé :
**un email par destinataire**, chacun dans sa langue — jamais un seul contenu partagé.

**Les données restent dans leur langue d'origine ; on traduit à l'affichage.** Une valeur
stockée en base ne se traduit pas, un libellé le fait.

---

## 13. Tests

**On ne teste pas tout, et c'est délibéré.** Deux critères, un seul suffit :

- l'opération peut **détruire des données saisies à la main** — suppression par lot, écriture
  sur un identifiant fourni par le client, ré-écriture de masse ;
- la fonction est le **contrat d'une entrée non fiable** — IA, import, future API.

Ce qui relève du rendu, de l'ergonomie ou de la **qualité d'un contenu généré ne se teste pas
ici** : ça se regarde dans l'app, et aucun test ne remplace ce coup d'œil.

**Aucun test ne touche au réseau ni à la base.** Un module qui a besoin d'un client lui
reçoit un double.

La raison d'être de cette discipline : la base est partagée avec la production, donc une
requête de suppression non testée s'exécuterait sur les vraies données.

**Deux copies d'une même règle finissent par diverger, et c'est celle qui tourne qui gagne.**
Quand une règle descend en base, son module applicatif et ses tests disparaissent avec elle —
la règle est alors vérifiée contre la vraie base, et son énoncé complet vit en tête de la
migration.

**Validation avant de considérer une tâche terminée : la compilation complète**, pas seulement
le contrôle de types — voir annexe A.

---

## Annexe — décisions tranchées et pièges rencontrés

> Secondaire par nature : lié à l'architecture, jamais structurant. **Se supprime dès que
> c'est trop éloigné du produit actuel.**

### A. Pièges de compilation et de rendu

**Ré-export de type dans un fichier d'action serveur.** Un tel fichier ne peut pas
ré-exporter un type importé : l'analyseur le traite comme un export de valeur et la
**compilation échoue**, alors que le contrôle de types et le lint ne détectent rien. Solution :
redéclarer le type localement. Un import de type **sans** ré-export reste valide. *C'est
d'ici que vient la règle « valider par la compilation complète ».*

**Une VALEUR importée d'un module navigateur n'arrive pas entière côté serveur.** Un composant
serveur qui importe un tableau exporté par un module client en reçoit une référence, pas le
tableau — l'erreur survient au rendu, invisible pour le contrôle de types comme pour la
compilation. Les constantes que les deux côtés doivent lire vivent dans un module neutre. Les
imports de **type**, eux, traversent sans problème.

**La revalidation opère sur la structure de routes, pas sur l'URL.** Avec le segment de
langue, il faut passer le motif, jamais un chemin concret — qui ne correspond à rien.

**Le middleware doit inclure les routes d'API**, sinon toute lecture d'identité y lève. Ces
routes sont en revanche rendues **avant** la localisation : elles n'ont pas de langue, et le
middleware de langue les redirigerait. *Précédent : la recharge automatique a répondu en
erreur pendant deux jours pour cette raison exacte — personne n'attend sa réponse, donc rien
ne le signalait à l'écran.*

### B. Pièges React et CSS

**La mise à jour d'état n'est pas synchrone.** Construire l'objet à passer à une action
**avant** l'appel de mise à jour, jamais dans la fonction de mise à jour avec une variable
externe capturée. Et **ne jamais appeler une action serveur dans une fonction de mise à
jour** : elle s'exécute pendant le rendu.

**Dans un bloc dont la hauteur est mesurée, l'air se met en marge intérieure, jamais
extérieure.** La mesure exclut les marges extérieures, et deux marges verticales voisines
fusionnent : tout ce qui consomme la mesure décroche, et le décalage s'accumule ligne après
ligne.

**Un composant à état ne doit jamais dépendre de sa propre hauteur pour savoir où il est
monté.** Le moindre champ qui s'ouvre le fait changer de parent, il est démonté et remonté, et
son état repart de zéro — panneau replié, saisie perdue. Règle générale : **ne jamais faire
dépendre la position d'un élément dans l'arbre d'un état mesuré sur cet élément.**

**Mettre à l'échelle un bloc de largeur fixe : le zoom, pas la transformation.** Le zoom agit
sur la mise en page et ne casse pas les descendants positionnés par rapport à la fenêtre. Côté
mesures : les hauteurs d'élément restent en unités locales, un rectangle est dans le repère de
la fenêtre — **ne jamais mélanger les deux dans un même calcul**.

> **Corollaires du zoom, et ils coûtent cher :** le défilement vers un élément **ne fonctionne
> pas** sous un ancêtre zoomé — l'appel part, rien ne bouge, aucune erreur. Il faut viser
> soi-même le panneau défilant et ramener l'écart en unités locales. Et le défilement
> **animé** peut lui aussi ne rien faire en silence : un recadrage ne doit jamais reposer sur
> la seule animation — animer, puis repasser et **poser** la position si l'écart est toujours
> là. Un défilement qu'on croit avoir écrit se vérifie en **lisant** la position après coup,
> jamais en relisant le code.

**Un conteneur qui défile rogne AUSSI l'autre axe.** Ce qui dépasse latéralement est coupé —
notamment le halo de focus d'un élément de pleine largeur. Corriger par une marge intérieure,
rendue au voisinage par une marge négative de même valeur.

**Centrer un conteneur potentiellement plus large que son parent** : jamais par centrage flex
sur un conteneur défilant — les navigateurs refusent un défilement négatif, donc la partie qui
dépasse à gauche devient inatteignable.

**Une rangée dont un panneau n'a que des enfants en position absolue** a une hauteur
intrinsèque nulle : supprimer le frère qui donnait la hauteur fait s'effondrer toute la rangée,
et la page paraît blanche sans explication. Poser une hauteur minimale explicite sur la rangée.

**La tabulation verticale dans un bloc en lignes** se fait par un rang porté sur chaque case et
relu à la frappe. ⚠️ **Jamais un ordre de tabulation positif** : il ne réordonne pas un bloc, il
en sort les cases pour les placer **avant tout le reste de la page**.

### C. Les onze endroits d'un type de réponse

Dans l'ordre : l'union de types **et** le tableau qui sert de garde à l'exécution ; la
contrainte en base — **dans la même migration que le déploiement du code**, sans quoi le
nouveau type est rejeté ou les questions existantes deviennent non enregistrables ; le mapping
des anciens noms, s'il est fondé ; **l'ordre du menu de l'éditeur** *(premier oubli
silencieux)* ; la marque « se répond par une liste de propositions » ; la marque « bientôt » ;
les champs de saisie ; le rendu sur la copie imprimée ; la zone de réponse du candidat **et la
liste blanche des réglages transmis** *(second oubli silencieux)* ; la correction — sans règle,
le type ne fait jamais progresser la maîtrise ; les traductions.

Le schéma exposé à l'IA reprend l'énumération, **dédoublée** entre entraînement et examen : le
dépôt de fichier et l'énoncé sans réponse sont réservés à l'examen, où un humain relit.

### D. Correction d'un exercice

Un appel corrige **un énoncé**, et lui seul. **Une question liée est une question entière** :
verdict, crédit de maîtrise, budget et mesure de rythme se font à chaque appel. N'attendent la
fin de la grappe que les choses qui dépendent de son caractère indissociable — la trace « déjà
posée », écrite dès la première question validée (sa réponse est dévoilée, la grappe est
consommée même si le membre s'arrête là), et le tirage suivant, le budget étant réservé grappe
par grappe.

> **Le résultat ne porte jamais la correction de toute la grappe** : ce serait descendre au
> navigateur les réponses de questions **pas encore posées**.

### E. Deux systèmes d'avatar coexistent

Un composeur d'images actuel, et un rendu vectoriel hérité utilisé seulement par la barre
visiteur. Toujours vérifier duquel on importe avant de modifier un rendu d'avatar.

### F. Fichiers découpés

Les deux plus gros composants ont été éclatés en sous-modules **sans changement de
comportement**. Les sections de paramètres sont **montées en permanence** — c'est volontaire,
ça préserve l'état entre onglets (envoi en cours, mises à jour optimistes). Pattern à
réutiliser : tranches verbatim, un module partagé pour les types et petits composants, un
fichier par responsabilité.

### G. Session unique par compte

Une nouvelle connexion révoque les autres sessions actives. Limite connue : la détection se
fait au rafraîchissement du jeton, donc un onglet fermé se déconnecte silencieusement au
prochain accès.

### H. Ce qui grandit avec le contenu ne voyage pas dans une URL

Une liste d'identifiants passée en filtre part **dans l'URL** de la couche d'accès à la base :
au-delà de quelques centaines d'éléments, la requête est refusée, et l'erreur peut se
journaliser vide. Une jointure interne pour une lecture, un découpage par paquets pour une
écriture, une fonction en base quand la règle elle-même y vit.
