-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('UNKNOWN', 'VALID', 'INVALID');

-- CreateEnum
CREATE TYPE "ContactPointType" AS ENUM ('EMAIL', 'WEBSITE', 'PHONE', 'SOCIAL');

-- CreateEnum
CREATE TYPE "PersonBookRole" AS ENUM ('AUTHOR', 'CO_AUTHOR', 'EDITOR', 'ILLUSTRATOR', 'TRANSLATOR', 'CONTRIBUTOR', 'PUBLISHER', 'AGENT');

-- CreateEnum
CREATE TYPE "ImportFileType" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('UPLOADED', 'MAPPED', 'VALIDATED', 'IMPORTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('PENDING', 'VALID', 'INVALID', 'DUPLICATE', 'IMPORTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DuplicateKind" AS ENUM ('SOURCE_ROW', 'EMAIL_IN_BATCH', 'EMAIL_EXISTING', 'RELATIONSHIP_EXISTING');

-- CreateEnum
CREATE TYPE "OutreachState" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('MANUAL', 'UNSUBSCRIBE', 'PREVIOUS_CLIENT', 'DUPLICATE', 'INVALID', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "OutreachEventType" AS ENUM ('APPROVED', 'REJECTED', 'SUPPRESSED', 'UNSUPPRESSED', 'RESET', 'EDITED');

-- CreateTable
CREATE TABLE "person" (
    "id" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "penName" TEXT,
    "organization" TEXT,
    "role" TEXT,
    "notes" TEXT,
    "websiteUrl" TEXT,
    "twitterUrl" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "linkedinUrl" TEXT,
    "tiktokUrl" TEXT,
    "goodreadsUrl" TEXT,
    "primaryEmail" TEXT,
    "emailStatus" "ValidationStatus",
    "searchText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "normalizedTitle" TEXT NOT NULL,
    "quickKey" TEXT NOT NULL,
    "primaryAuthorName" TEXT,
    "seriesName" TEXT,
    "seriesPosition" INTEGER,
    "genre" TEXT,
    "description" TEXT,
    "bookUrl" TEXT,
    "amazonUrl" TEXT,
    "isbn" TEXT,
    "publisher" TEXT,
    "bookFormat" TEXT,
    "language" TEXT,
    "publicationDate" TIMESTAMP(3),
    "searchText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_book" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "role" "PersonBookRole" NOT NULL DEFAULT 'AUTHOR',
    "isPrimaryBook" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_point" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "ContactPointType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "status" "ValidationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "validationMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileType" "ImportFileType" NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileChecksum" TEXT,
    "sheetNames" JSONB,
    "sheetName" TEXT,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "rowLimitExceeded" BOOLEAN NOT NULL DEFAULT false,
    "detectedColumns" JSONB,
    "columnMapping" JSONB,
    "mappingConfirmedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "failureMessage" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_row" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "status" "ImportRowStatus" NOT NULL DEFAULT 'PENDING',
    "duplicateKind" "DuplicateKind",
    "duplicateMessage" TEXT,
    "errors" JSONB,
    "warnings" JSONB,
    "sourceFingerprint" TEXT,
    "identityKey" TEXT,
    "personId" TEXT,
    "bookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_row_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_status" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "OutreachState" NOT NULL DEFAULT 'PENDING',
    "suppressionReason" "SuppressionReason",
    "notes" TEXT,
    "decisionNote" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outreach_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_event" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "type" "OutreachEventType" NOT NULL,
    "fromState" "OutreachState",
    "toState" "OutreachState" NOT NULL,
    "reason" "SuppressionReason",
    "note" TEXT,
    "actor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outreach_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_primaryEmail_idx" ON "person"("primaryEmail");

-- CreateIndex
CREATE INDEX "person_emailStatus_idx" ON "person"("emailStatus");

-- CreateIndex
CREATE INDEX "person_organization_idx" ON "person"("organization");

-- CreateIndex
CREATE INDEX "person_fullName_idx" ON "person"("fullName");

-- CreateIndex
CREATE INDEX "person_searchText_idx" ON "person"("searchText");

-- CreateIndex
CREATE INDEX "person_updatedAt_idx" ON "person"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "book_quickKey_key" ON "book"("quickKey");

-- CreateIndex
CREATE INDEX "book_normalizedTitle_idx" ON "book"("normalizedTitle");

-- CreateIndex
CREATE INDEX "book_seriesName_idx" ON "book"("seriesName");

-- CreateIndex
CREATE INDEX "book_genre_idx" ON "book"("genre");

-- CreateIndex
CREATE INDEX "book_searchText_idx" ON "book"("searchText");

-- CreateIndex
CREATE INDEX "person_book_bookId_idx" ON "person_book"("bookId");

-- CreateIndex
CREATE INDEX "person_book_personId_idx" ON "person_book"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "person_book_personId_bookId_role_key" ON "person_book"("personId", "bookId", "role");

-- CreateIndex
CREATE INDEX "contact_point_normalizedValue_idx" ON "contact_point"("normalizedValue");

-- CreateIndex
CREATE INDEX "contact_point_personId_idx" ON "contact_point"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_point_type_normalizedValue_key" ON "contact_point"("type", "normalizedValue");

-- CreateIndex
CREATE INDEX "import_batch_status_createdAt_idx" ON "import_batch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "import_batch_createdAt_idx" ON "import_batch"("createdAt");

-- CreateIndex
CREATE INDEX "import_row_importBatchId_status_idx" ON "import_row"("importBatchId", "status");

-- CreateIndex
CREATE INDEX "import_row_importBatchId_sourceFingerprint_idx" ON "import_row"("importBatchId", "sourceFingerprint");

-- CreateIndex
CREATE INDEX "import_row_importBatchId_identityKey_idx" ON "import_row"("importBatchId", "identityKey");

-- CreateIndex
CREATE INDEX "import_row_personId_idx" ON "import_row"("personId");

-- CreateIndex
CREATE INDEX "import_row_bookId_idx" ON "import_row"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "import_row_importBatchId_rowNumber_key" ON "import_row"("importBatchId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_status_personId_key" ON "outreach_status"("personId");

-- CreateIndex
CREATE INDEX "outreach_status_status_idx" ON "outreach_status"("status");

-- CreateIndex
CREATE INDEX "outreach_status_updatedAt_idx" ON "outreach_status"("updatedAt");

-- CreateIndex
CREATE INDEX "outreach_event_personId_createdAt_idx" ON "outreach_event"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "outreach_event_createdAt_idx" ON "outreach_event"("createdAt");

-- AddForeignKey
ALTER TABLE "person_book" ADD CONSTRAINT "person_book_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_book" ADD CONSTRAINT "person_book_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_point" ADD CONSTRAINT "contact_point_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_row" ADD CONSTRAINT "import_row_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_status" ADD CONSTRAINT "outreach_status_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_event" ADD CONSTRAINT "outreach_event_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
