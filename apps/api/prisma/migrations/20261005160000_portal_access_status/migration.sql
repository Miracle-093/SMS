-- Portal sessions must be revocable when a school is disabled.
ALTER TABLE "School" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
