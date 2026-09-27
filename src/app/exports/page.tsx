import type { Metadata } from "next";

import { ExportPanel } from "@/components/exports/export-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Export" };

/** `/exports` - GMass export plus the general canonical export. */
export default async function ExportsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Export"
        description="Turn reviewed records into a GMass ready file, or export the full canonical dataset."
      />

      <Card>
        <CardHeader>
          <CardTitle>Export configuration</CardTitle>
          <CardDescription>
            The confirmation summary always reflects exactly what will be written to the file.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportPanel />
        </CardContent>
      </Card>
    </div>
  );
}
