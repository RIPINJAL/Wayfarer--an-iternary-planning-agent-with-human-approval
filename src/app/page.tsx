import PlannerShell from '@/components/PlannerShell';
import { env } from '@/lib/env';

export default function Home() {
  return <PlannerShell localMode={env.provider === 'ollama'} />;
}
