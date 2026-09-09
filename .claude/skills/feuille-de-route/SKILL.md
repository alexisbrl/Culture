---
name: feuille-de-route
description: Republier la feuille de route d'Alexis à partir de docs/backlog.md, si et seulement si le backlog a changé depuis la dernière publication. Déclenchée par les routines planifiées avant le check de chantier, ou à la main après avoir modifié le backlog.
---

# Republier la feuille de route

`docs/backlog.md` est écrit pour un agent. **La feuille de route publiée est la
même chose écrite pour Alexis** — c'est la seule des deux qu'il lit. Une page en
retard vaut moins que pas de page : il y prend ses décisions.

**Adresse, toujours la même :** https://claude.ai/code/artifact/1726e6fc-756c-4de4-99d5-f7ebdf5144a6

## 1. Vérifier qu'il y a quelque chose à faire

```bash
git log -1 --format=%cI -- docs/backlog.md
```

Compare cette date à celle de « Feuille de route Culture » dans `Artifact`
(`action: "list"`). **Si la page est plus récente que le dernier commit du
backlog, ne republie rien** et arrête-toi là : republier à l'identique fait une
version de plus pour rien.

⚠️ Le backlog peut aussi avoir été modifié **sans commit** (session en cours) :
`git status --short docs/backlog.md`. Une modification non commitée compte comme
un changement.

## 2. Republier

Lis `docs/backlog.md` en entier, puis republie la page **à la même adresse**
(`url` = celle ci-dessus, jamais un nouveau chemin de fichier — un chemin
différent crée un second artefact et Alexis perd son lien).

Avant d'écrire quoi que ce soit, **relis la page publiée** (`action: "read"` avec
cette `url`) : c'est elle qui porte la mise en forme retenue, et une republication
qui repart de zéro la fait changer d'allure sans raison.

## 3. Les règles d'écriture, qui sont tout l'intérêt de cette page

- **Langage produit, zéro jargon** (`CLAUDE.md` §1). Aucun nom de fichier, de
  fonction, de table ni de colonne. « Le bouton d'annulation », jamais son nom
  technique. Un item que tu ne sais pas traduire en langage produit se résume par
  son effet visible ; s'il n'en a aucun, il n'a rien à faire sur cette page.
- **Rangée par trimestre, dans l'ordre du backlog.** Les sections sont l'ordre de
  travail, elles ne se réordonnent pas.
- **Court.** Un titre et une à deux phrases par item — pourquoi ça compte, pas
  comment ça se répare. Le détail reste dans le backlog.
- **Rien d'inventé.** Aucun item qui ne soit pas dans le backlog, aucune date
  d'échéance qu'il ne porte pas.

## 4. Ne jamais faire

- **Ne republie pas si tu n'as pas lu le backlog dans cette session.** Republier
  de mémoire écrase la page par une version approximative.
- **Ne change pas le titre ni l'icône** de l'artefact : Alexis retrouve sa page à
  ça.
- **N'ajoute pas de statut « fait / à faire »** au-delà du rangement par
  trimestre — c'est la doctrine documentaire du projet (`CLAUDE.md` §1).
