CREATE TABLE "DashboardPreference" (
 "userId" UUID NOT NULL PRIMARY KEY REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "widgets" JSONB NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "SavedAnalyticsView" (
 "id" UUID NOT NULL PRIMARY KEY,
 "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "name" TEXT NOT NULL,
 "filters" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SavedAnalyticsView_userId_name_key" ON "SavedAnalyticsView"("userId","name");
CREATE INDEX "SavedAnalyticsView_userId_createdAt_idx" ON "SavedAnalyticsView"("userId","createdAt");
