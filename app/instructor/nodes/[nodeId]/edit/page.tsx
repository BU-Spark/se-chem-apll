import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import NodeEditForm from './NodeEditForm';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ nodeId: string }>;
}

export default async function EditNodePage({ params }: Props) {
  const { nodeId } = await params;

  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: { questions: { orderBy: { sortOrder: 'asc' } } },
  });

  if (!node) notFound();

  return <NodeEditForm node={node} />;
}
