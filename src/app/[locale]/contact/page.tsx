'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight, Loader2, Mail, MessageSquare } from 'lucide-react';

export default function ContactPage() {
  const t = useTranslations('contact');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      if (res.ok) {
        setStatus('success');
        setName('');
        setEmail('');
        setMessage('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

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
          <p className="text-slate-300 text-lg">{t('subtitle')}</p>
        </div>
      </section>

      {/* Form */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-lg mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {status === 'success' ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageSquare className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{t('success')}</h3>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  type="text"
                  placeholder={t('namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-12 rounded-xl border-gray-200"
                />
                <Input
                  type="email"
                  placeholder={t('emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 rounded-xl border-gray-200"
                />
                <textarea
                  placeholder={t('messagePlaceholder')}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={5}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                <Button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full h-12 gradient-primary text-white border-0 hover:opacity-90 rounded-xl font-semibold"
                >
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('sending')}
                    </>
                  ) : (
                    <>
                      {t('button')}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
                {status === 'error' && (
                  <p className="text-sm text-red-600 text-center">{t('error')}</p>
                )}
              </form>
            )}
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 text-gray-500 text-sm">
            <Mail className="w-4 h-4" />
            <span>contact@culture.com</span>
          </div>
        </div>
      </section>
    </>
  );
}
