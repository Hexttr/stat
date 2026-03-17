/*
  Warnings:

  - Made the column `regionId` on table `Organization` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Organization" ALTER COLUMN "regionId" SET NOT NULL;
