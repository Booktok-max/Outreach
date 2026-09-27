import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { NewImportWizard, type MapStepData } from "@/components/import/wizard";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New import" };

interface SearchParams {
  batch?: string;
  step?: string;
}

/** `/imports/new` - upload a file, then map / validate / import it. */
export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  const batchId = query.batch;

  if (!batchId) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="New import"
          description="Upload → Map → Validate → Import. Nothing is written until you confirm."
        />
        <NewImportWizard step="upload" />
      </div>
    );
  }

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      filename: true,
      status: true,
      totalRows: true,
      detectedColumns: true,
      columnMapping: true,
    },
  });

  if (!batch) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="New import" description="The staged import could not be found." />
        <NewImportWizard step="upload" />
      </div>
    );
  }

  if (batch.status === "IMPORTED" || batch.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="New import"
          description={`“${batch.filename}” is already ${batch.status.toLowerCase()}.`}
        />
        <NewImportWizard step="upload" />
      </div>
    );
  }

  const detections = (batch.detectedColumns as MapStepData["detectedColumns"] | null) ?? [];
  const headers = detections.map((detection) => detection.sourceHeader);

  const mapData: MapStepData = {
    batchId: batch.id,
    headers,
    detectedColumns: detections,
    mapping: (batch.columnMapping ?? {}) as Record<string, string | null>,
    totalRows: batch.totalRows,
    filename: batch.filename,
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="New import" description="Review the mapping, then validate and import." />
      <NewImportWizard step="map" mapData={mapData} />
    </div>
  );
}
