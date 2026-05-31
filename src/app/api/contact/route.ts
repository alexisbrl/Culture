import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { name, email, message } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // Option 1: Send via Resend (uncomment when RESEND_API_KEY is set)
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: 'Culture <noreply@evalia.app>',
    //   to: 'votre@email.com',
    //   subject: `Nouveau message contact — ${name}`,
    //   html: `<p><b>De :</b> ${name} (${email})</p><p><b>Message :</b></p><p>${message}</p>`,
    // });

    console.log('📨 Nouveau message contact:', { name, email, message });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Contact error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
