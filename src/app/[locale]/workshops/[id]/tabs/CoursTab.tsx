'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { palette } from '@/lib/theme';

export default function CoursTab() {
  const t = useTranslations('cours');
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 26, color: palette.ink }}>{t('title')}</div>
      <Badge tone="premium">V2</Badge>
    </div>
  );
}
