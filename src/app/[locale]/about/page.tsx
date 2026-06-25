import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, Zap, BarChart3 } from 'lucide-react';

export default function AboutPage() {
  return <AboutPageClient />;
}

function AboutPageClient() {
  const t = useTranslations('about');

  const values = [
    { icon: BookOpen, title: t('values.v1Title'), desc: t('values.v1Desc'), color: 'text-violet-600', bg: 'bg-violet-50' },
    { icon: Zap, title: t('values.v2Title'), desc: t('values.v2Desc'), color: 'text-orange-500', bg: 'bg-orange-50' },
    { icon: BarChart3, title: t('values.v3Title'), desc: t('values.v3Desc'), color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const story = t('story').split('\n\n');

  return (
    <>
      {/* Header */}
      <section className="bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 text-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Badge className="mb-4 bg-violet-500/20 text-violet-300 border-violet-400/30">
            {t('badge')}
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold mb-4">
            {t('title')}{' '}
            <span className="bg-gradient-to-r from-violet-400 to-orange-400 bg-clip-text text-transparent">
              {t('titleHighlight')}
            </span>
          </h1>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          {story.map((paragraph, i) => (
            <p key={i} className="text-lg text-gray-700 leading-relaxed mb-6">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">{t('values.title')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((v, i) => {
              const Icon = v.icon;
              return (
                <Card key={i} className="border border-gray-100 hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl ${v.bg} flex items-center justify-center mb-4`}>
                      <Icon className={`w-6 h-6 ${v.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{v.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{v.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
