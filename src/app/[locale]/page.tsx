import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import WaitlistForm from '@/components/WaitlistForm';
import LinkButton from '@/components/LinkButton';
import { getLocale } from 'next-intl/server';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import {
  Upload,
  Brain,
  Trophy,
  BarChart3,
  FileText,
  Zap,
  Star,
  ArrowRight,
  Users,
  TrendingUp,
  Clock,
  Sparkles,
} from 'lucide-react';

export default async function HomePage() {
  const { userId } = await auth();
  const locale = await getLocale();
  if (userId) redirect(`/${locale}/dashboard`);
  return <HomePageClient locale={locale} />;
}

function HomePageClient({ locale }: { locale: string }) {
  const t = useTranslations();

  const stats = [
    { value: '87%', label: t('stats.completion'), icon: TrendingUp },
    { value: '+3x', label: t('stats.engagement'), icon: Zap },
    { value: '4h/sem', label: t('stats.time'), icon: Clock },
    { value: '94%', label: t('stats.satisfaction'), icon: Star },
  ];

  const features = [
    { icon: Brain, title: t('features.f1Title'), desc: t('features.f1Desc'), color: 'text-violet-600', bg: 'bg-violet-50' },
    { icon: Trophy, title: t('features.f2Title'), desc: t('features.f2Desc'), color: 'text-orange-500', bg: 'bg-orange-50' },
    { icon: FileText, title: t('features.f3Title'), desc: t('features.f3Desc'), color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { icon: BarChart3, title: t('features.f4Title'), desc: t('features.f4Desc'), color: 'text-blue-600', bg: 'bg-blue-50' },
    { icon: Sparkles, title: t('features.f5Title'), desc: t('features.f5Desc'), color: 'text-amber-600', bg: 'bg-amber-50' },
    { icon: Zap, title: t('features.f6Title'), desc: t('features.f6Desc'), color: 'text-indigo-600', bg: 'bg-indigo-50' },
  ];

  const steps = [
    { icon: Upload, title: t('howItWorks.step1Title'), desc: t('howItWorks.step1Desc'), step: '01', color: 'from-violet-500 to-violet-600' },
    { icon: Brain, title: t('howItWorks.step2Title'), desc: t('howItWorks.step2Desc'), step: '02', color: 'from-orange-400 to-orange-500' },
    { icon: Trophy, title: t('howItWorks.step3Title'), desc: t('howItWorks.step3Desc'), step: '03', color: 'from-emerald-500 to-emerald-600' },
  ];

  const testimonials = [
    {
      name: 'Marie Laurent',
      role: locale === 'fr' ? 'Formatrice RH indépendante' : 'Independent HR Trainer',
      avatar: 'ML',
      content: locale === 'fr'
        ? "J'ai uploadé mon cours Excel de 80 slides. En 10 minutes, j'avais un parcours complet avec quiz et badges. Mes apprenants sont 3x plus engagés."
        : "I uploaded my 80-slide Excel course. In 10 minutes, I had a complete path with quizzes and badges. My learners are 3x more engaged.",
      stars: 5,
      color: 'bg-violet-100 text-violet-700',
    },
    {
      name: 'Thomas Girard',
      role: locale === 'fr' ? 'Responsable formation, PME 200p' : 'L&D Manager, 200-person SME',
      avatar: 'TG',
      content: locale === 'fr'
        ? "On a réduit le temps de formation onboarding de 3 jours à 1,5 jour. Les nouveaux arrivent mieux préparés, plus motivés. ROI évident."
        : "We cut onboarding training time from 3 days to 1.5 days. New hires arrive better prepared and more motivated. Clear ROI.",
      stars: 5,
      color: 'bg-orange-100 text-orange-700',
    },
    {
      name: 'Sophie Mercier',
      role: locale === 'fr' ? 'Formatrice sécurité industrielle' : 'Industrial Safety Trainer',
      avatar: 'SM',
      content: locale === 'fr'
        ? "La génération automatique des examens m'économise 4 heures par semaine. Et les résultats aux certifications ont progressé de 22%."
        : "Auto-generating exams saves me 4 hours a week. And certification pass rates improved by 22%.",
      stars: 5,
      color: 'bg-emerald-100 text-emerald-700',
    },
  ];

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-violet-950 to-indigo-950 text-white">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-violet-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-28">
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/20 border border-violet-400/30 text-violet-300 text-sm font-medium">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              {t('hero.badge')}
            </div>
          </div>

          <h1 className="text-center text-4xl sm:text-5xl lg:text-7xl font-bold leading-tight mb-6 tracking-tight">
            {t('hero.title')}
            <br />
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-orange-400 bg-clip-text text-transparent">
              {t('hero.titleHighlight')}
            </span>
          </h1>

          <p className="text-center text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <LinkButton
              href="#waitlist"
              className="h-14 px-8 text-base gradient-primary border-0 hover:opacity-90 shadow-2xl shadow-violet-500/30 rounded-xl font-semibold inline-flex items-center gap-2"
            >
              {t('hero.cta')}
              <ArrowRight className="w-5 h-5" />
            </LinkButton>
            <LinkButton
              href={`/${locale}/create`}
              variant="outline"
              className="h-14 px-8 text-base border-white/20 text-white hover:bg-white/10 rounded-xl bg-transparent"
            >
              {t('hero.ctaSecondary')}
            </LinkButton>
          </div>

          <div className="flex justify-center items-center gap-2 text-slate-400 text-sm">
            <div className="flex -space-x-2">
              {['ML', 'TG', 'SM', 'AB'].map((initials) => (
                <div key={initials} className="w-7 h-7 rounded-full gradient-primary border-2 border-violet-950 flex items-center justify-center text-white text-xs font-bold">
                  {initials[0]}
                </div>
              ))}
            </div>
            <span>{t('hero.social', { count: '150+' })}</span>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="text-center">
                  <div className="flex justify-center mb-1">
                    <Icon className="w-5 h-5 text-violet-500" />
                  </div>
                  <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                  <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-violet-600 border-violet-200 bg-violet-50">
              {t('howItWorks.badge')}
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              {t('howItWorks.title')}{' '}
              <span className="gradient-text">{t('howItWorks.subtitle')}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={i} className="relative text-center">
                  <div className={`w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center shadow-lg`}>
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-violet-600 border-violet-200 bg-violet-50">
              {t('features.badge')}
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              {t('features.title')}{' '}
              <span className="gradient-text">{t('features.titleHighlight')}</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <Card key={i} className="border border-gray-100 hover:border-violet-200 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group">
                  <CardContent className="p-6">
                    <div className={`w-12 h-12 rounded-xl ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className={`w-6 h-6 ${f.color}`} />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-violet-600 border-violet-200 bg-violet-50">
              {t('testimonials.badge')}
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
              {t('testimonials.title')}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((item, i) => (
              <Card key={i} className="border border-gray-100 hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex mb-4">
                    {Array.from({ length: item.stars }).map((_, s) => (
                      <Star key={s} className="w-4 h-4 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed mb-6 italic">
                    &ldquo;{item.content}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${item.color} flex items-center justify-center text-sm font-bold`}>
                      {item.avatar}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* WAITLIST SECTION */}
      <section id="waitlist" className="py-24 relative overflow-hidden bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-orange-400/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-violet-400/20 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white/90 text-sm font-medium mb-6">
            <Users className="w-4 h-4" />
            {t('cta.title')}
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            {t('waitlist.title')}
          </h2>
          <p className="text-violet-200 mb-8">{t('waitlist.subtitle')}</p>

          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 sm:p-8">
            <WaitlistForm />
          </div>

          <p className="mt-4 text-violet-300 text-sm">{t('cta.noCb')}</p>
        </div>
      </section>
    </>
  );
}
