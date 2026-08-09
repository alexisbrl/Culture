'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Trash2 } from 'lucide-react';
import { palette, withAlpha } from '@/lib/theme';
import {
  type Exam, type SortBy, type SortDir,
  DEFAULT_SORT_DIR, CARD_ACTION_BTN,
  IconBtn, ListToolbar, FilterButton, ListCard,
} from './examShared';

// Critères de tri d'un examen : ni « type » ni « tag », qui n'existent que sur
// une question. Reste la date et le nom, avec le même sens croissant/
// décroissant que la banque.
const HISTORY_SORTS: readonly SortBy[] = ['recent', 'name'];

const CARD_HOT_TINT = withAlpha(palette.gold, 0.14); // teinte de l'examen tout juste créé

// ---- HISTORY — barre de recherche/filtre/tri toujours visible + cartes en
// mode dense (variante retenue, lignes 810-869 de App-Culture.dc.html).
//
// Barre d'outils et cartes sont les composants partagés de l'onglet
// (`ListToolbar`, `FilterButton`, `ListCard` d'`examShared`), les mêmes que
// ceux de la banque de questions : c'est ce qui permet de basculer d'un onglet
// à l'autre sans que les cartes ne se décalent. Seul le contenu change —
// recherche d'un examen, critères de tri d'un examen, action « nouvel examen »,
// décompte de questions sur la 3e ligne, exporter/supprimer en actions.
//
// Le tri porte sur l'ordre d'insertion — pas de vraie date en base pour les
// examens générés — donc « date » se contente d'inverser la liste selon le
// sens choisi, exactement comme le fait le getter réel `examsList` de la
// maquette.
//
// Le badge de statut (brouillon/publié/archivé) a été retiré le 09/08/2026 avec
// le filtre qui allait avec — `Exam.status` reste en donnée, plus rien ne
// l'affiche. Le bouton « filtrer » demeure, désactivé, tant qu'aucun critère de
// filtre n'existe pour cette liste. ----
function HistoryContent({ exams, justAddedId, onEdit, onNew, onDelete }: { exams: Exam[]; justAddedId: string | null; onEdit: (e: Exam) => void; onNew: () => void; onDelete: (e: Exam) => void }) {
  const t = useTranslations('examen');

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('recent');
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT_DIR.recent);

  const q = search.trim().toLowerCase();
  let filtered = exams.filter((e) => !q || e.title.toLowerCase().includes(q));
  if (sortBy === 'name') filtered = [...filtered].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * a.title.localeCompare(b.title, 'fr'));
  else if (sortDir === 'asc') filtered = [...filtered].reverse();

  return (
    <div style={{ padding: '16px 16px 28px' }}>
      {/* Ni titre ni décompte : l'onglet au-dessus de la liste dit déjà où l'on est. */}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('history.searchPlaceholder')}
        sortOptions={HISTORY_SORTS}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortDir={sortDir}
        onToggleSortDir={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
        actionLabel={t('history.newExam')}
        actionTitle={t('history.newExam')}
        onAction={onNew}
        filter={<FilterButton disabled title={t('history.filterNone')} />}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 12.5, color: palette.inkFaint, textAlign: 'center', padding: '20px 0' }}>
            {t('history.noResults')}
          </div>
        )}
        {filtered.map((e) => {
          const hot = e.id === justAddedId;
          return (
            <ListCard
              key={e.id}
              onClick={() => onEdit(e)}
              tint={hot ? CARD_HOT_TINT : undefined}
              borderColor={hot ? palette.gold : undefined}
              title={e.title}
              meta={
                <span style={{ minWidth: 0, fontSize: 11.5, color: palette.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t('history.colQuestions')} : {e.q} · {e.date}
                </span>
              }
              actions={
                <>
                  {/* exporter : pas encore de fonction réelle derrière (déjà le cas avant ce chantier) — icône conservée à l'identique */}
                  <IconBtn size={CARD_ACTION_BTN} title={t('history.export')}>
                    <Download size={14} strokeWidth={1.75} />
                  </IconBtn>
                  <IconBtn size={CARD_ACTION_BTN} title={t('history.deleteAction')} onClick={() => onDelete(e)}>
                    <Trash2 size={14} strokeWidth={1.75} />
                  </IconBtn>
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export default HistoryContent;
