import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateDocumentPdf } from '@/lib/pdf/generator';
import { StructuredDocumentData, TemplateStyle } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        logs: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    let structuredData: StructuredDocumentData | null = null;
    if (job.structuredData) {
      try {
        structuredData = JSON.parse(job.structuredData);
      } catch (e) {
        console.error('Failed to parse structuredData JSON:', e);
      }
    }

    return NextResponse.json({
      ...job,
      structuredData,
    });
  } catch (error: any) {
    console.error('Error getting job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to retrieve job' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existingJob = await prisma.job.findUnique({
      where: { id },
    });

    if (!existingJob) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const templateStyle = (body.templateStyle || existingJob.templateStyle) as TemplateStyle;
    const structuredData: StructuredDocumentData = body.structuredData || (existingJob.structuredData ? JSON.parse(existingJob.structuredData) : null);

    let pdfDataUri = existingJob.pdfDataUri;
    if (structuredData) {
      const pdf = generateDocumentPdf(structuredData, templateStyle);
      pdfDataUri = pdf.dataUri;
    }

    const updatedJob = await prisma.job.update({
      where: { id },
      data: {
        templateStyle,
        title: structuredData?.title || existingJob.title,
        subtitle: structuredData?.subtitle || existingJob.subtitle,
        summary: structuredData?.executiveSummary || existingJob.summary,
        structuredData: structuredData ? JSON.stringify(structuredData) : existingJob.structuredData,
        pdfDataUri,
        verifiedByUser: true,
      },
      include: {
        logs: true,
      },
    });

    return NextResponse.json({
      ...updatedJob,
      structuredData,
    });
  } catch (error: any) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update job' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.job.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: `Job ${id} deleted` });
  } catch (error: any) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete job' },
      { status: 500 }
    );
  }
}
