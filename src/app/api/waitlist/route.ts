import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { name, email, role } = await req.json();

    if (!name || !email) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Option 1: Send via Resend (uncomment when RESEND_API_KEY is set)
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: 'Culture <noreply@evalia.app>',
    //   to: 'votre@email.com',
    //   subject: `Nouvelle inscription beta — ${name}`,
    //   html: `<p><b>Nom :</b> ${name}</p><p><b>Email :</b> ${email}</p><p><b>Rôle :</b> ${role || 'Non précisé'}</p>`,
    // });

    // Option 2: Log to console for now (dev mode)
    console.log('📋 Nouvelle inscription waitlist:', { name, email, role });

    // Option 3: Save to a JSON file (simple, no DB)
    const fs = await import('fs').catch(() => null);
    if (fs) {
      const path = await import('path');
      const filePath = path.join(process.cwd(), 'waitlist.json');
      let entries: { name: string; email: string; role: string; date: string }[] = [];
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        entries = JSON.parse(content);
      } catch {}
      entries.push({ name, email, role: role || '', date: new Date().toISOString() });
      fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Waitlist error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
