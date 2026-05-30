import { auth } from '@clerk/nextjs/server';
import { getUserTier } from '@/lib/subscription';
import PricingClient from './PricingClient';

export default async function PricingPage() {
  const { userId } = await auth();
  const currentTier = userId ? await getUserTier(userId) : 'free';

  return <PricingClient currentTier={currentTier} />;
}
