import { ContractsClient } from './client';
import { listContracts } from '@/modules/contracts/interface';

export const dynamic = 'force-dynamic';

export default async function ContractsPage() {
  const contracts = await listContracts();
  return <ContractsClient initialContracts={contracts} />;
}
