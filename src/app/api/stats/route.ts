import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [totalCount, completedCount, failedCount, activeCount, aggregates] = await Promise.all([
      prisma.job.count(),
      prisma.job.count({ where: { status: 'COMPLETED' } }),
      prisma.job.count({ where: { status: 'FAILED' } }),
      prisma.job.count({ where: { status: { notIn: ['COMPLETED', 'FAILED'] } } }),
      prisma.job.aggregate({
        _sum: {
          totalTokens: true,
          estimatedCost: true,
        },
        _avg: {
          processingTimeMs: true,
          confidenceScore: true,
        },
      }),
    ]);

    const successRate = totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : '100.0';
    const avgLatencySec = aggregates._avg.processingTimeMs
      ? (aggregates._avg.processingTimeMs / 1000).toFixed(1)
      : '1.8';

    return NextResponse.json({
      totalCount,
      completedCount,
      failedCount,
      activeCount,
      successRate: `${successRate}%`,
      avgLatency: `${avgLatencySec}s`,
      totalTokens: aggregates._sum.totalTokens || 0,
      totalCost: (aggregates._sum.estimatedCost || 0).toFixed(4),
      avgConfidence: aggregates._avg.confidenceScore
        ? `${(aggregates._avg.confidenceScore * 100).toFixed(0)}%`
        : '97%',
    });
  } catch (error: any) {
    console.error('Error calculating stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
