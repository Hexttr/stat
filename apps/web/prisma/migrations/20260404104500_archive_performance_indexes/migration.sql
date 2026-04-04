CREATE INDEX "FormAssignment_reportingYearId_regionId_idx"
ON "FormAssignment"("reportingYearId", "regionId");

CREATE INDEX "FormAssignment_organizationId_reportingYearId_idx"
ON "FormAssignment"("organizationId", "reportingYearId");

CREATE INDEX "Submission_organizationId_idx"
ON "Submission"("organizationId");

CREATE INDEX "ImportFile_batchId_status_reportingYearId_formTypeId_idx"
ON "ImportFile"("batchId", "status", "reportingYearId", "formTypeId");

CREATE INDEX "ImportFile_batchId_reportingYearId_formTypeId_regionId_idx"
ON "ImportFile"("batchId", "reportingYearId", "formTypeId", "regionId");

CREATE INDEX "ImportFile_batchId_regionId_idx"
ON "ImportFile"("batchId", "regionId");

CREATE INDEX "ImportFile_reportingYearId_formTypeId_regionId_idx"
ON "ImportFile"("reportingYearId", "formTypeId", "regionId");

CREATE INDEX "ImportFieldValue_importFileId_idx"
ON "ImportFieldValue"("importFileId");

CREATE INDEX "ImportIssue_importFileId_idx"
ON "ImportIssue"("importFileId");
