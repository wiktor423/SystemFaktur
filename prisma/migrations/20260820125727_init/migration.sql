-- CreateEnum
CREATE TYPE "DocumentDirection" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "DocumentSource" AS ENUM ('KSEF', 'UPLOAD', 'MANUAL');

-- CreateEnum
CREATE TYPE "DocumentStage" AS ENUM ('BUFFER', 'REGISTERED');

-- CreateEnum
CREATE TYPE "BufferDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('PDF', 'XML');

-- CreateEnum
CREATE TYPE "KsefFetchScope" AS ENUM ('PURCHASE', 'SALE', 'BOTH');

-- CreateEnum
CREATE TYPE "KsefRunTrigger" AS ENUM ('MANUAL', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "KsefRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'ERROR');

-- CreateTable
CREATE TABLE "document_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" VARCHAR(8) NOT NULL,
    "direction" "DocumentDirection" NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" VARCHAR(16),
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counterparties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nip" VARCHAR(10) NOT NULL,
    "street" TEXT,
    "postalCode" VARCHAR(12),
    "city" TEXT,
    "country" VARCHAR(2) NOT NULL DEFAULT 'PL',
    "bankAccount" VARCHAR(34),
    "defaultCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counterparties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "saleDate" DATE,
    "dueDate" DATE NOT NULL,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PLN',
    "paymentAccount" VARCHAR(34),
    "categoryId" TEXT,
    "categoryAutoAssigned" BOOLEAN NOT NULL DEFAULT false,
    "source" "DocumentSource" NOT NULL,
    "ksefNumber" VARCHAR(64),
    "stage" "DocumentStage" NOT NULL DEFAULT 'BUFFER',
    "bufferDecision" "BufferDecision" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "unitNetPrice" DECIMAL(14,2) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "vatAmount" DECIMAL(14,2) NOT NULL,
    "grossAmount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" VARCHAR(128) NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_schedule" (
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "times" TEXT[],
    "scope" "KsefFetchScope" NOT NULL DEFAULT 'BOTH',
    "lookbackDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_schedule_pkey" PRIMARY KEY ("singleton")
);

-- CreateTable
CREATE TABLE "ksef_runs" (
    "id" TEXT NOT NULL,
    "trigger" "KsefRunTrigger" NOT NULL,
    "scope" "KsefFetchScope" NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "status" "KsefRunStatus" NOT NULL DEFAULT 'RUNNING',
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "jobName" VARCHAR(64),
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ksef_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ksef_cursors" (
    "scope" "KsefFetchScope" NOT NULL,
    "hwmDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ksef_cursors_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "column_preferences" (
    "key" VARCHAR(32) NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,

    CONSTRAINT "column_preferences_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_types_name_key" ON "document_types"("name");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_parentId_name_key" ON "categories"("parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "counterparties_nip_key" ON "counterparties"("nip");

-- CreateIndex
CREATE INDEX "counterparties_name_idx" ON "counterparties"("name");

-- CreateIndex
CREATE UNIQUE INDEX "documents_ksefNumber_key" ON "documents"("ksefNumber");

-- CreateIndex
CREATE INDEX "documents_issueDate_idx" ON "documents"("issueDate");

-- CreateIndex
CREATE INDEX "documents_dueDate_idx" ON "documents"("dueDate");

-- CreateIndex
CREATE INDEX "documents_stage_issueDate_idx" ON "documents"("stage", "issueDate");

-- CreateIndex
CREATE INDEX "documents_categoryId_idx" ON "documents"("categoryId");

-- CreateIndex
CREATE INDEX "documents_typeId_idx" ON "documents"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_counterpartyId_number_key" ON "documents"("counterpartyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_documentId_position_key" ON "invoice_lines"("documentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_documentId_key" ON "attachments"("documentId");

-- CreateIndex
CREATE INDEX "ksef_runs_startedAt_idx" ON "ksef_runs"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ksef_runs_jobName_scheduledFor_key" ON "ksef_runs"("jobName", "scheduledFor");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_counterpartyId_fkey" FOREIGN KEY ("counterpartyId") REFERENCES "counterparties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
