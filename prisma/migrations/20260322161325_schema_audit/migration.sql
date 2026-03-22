-- AlterTable: League
ALTER TABLE "League" ADD COLUMN "cricapiSeriesId" TEXT;
ALTER TABLE "League" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: LeagueMatch
ALTER TABLE "LeagueMatch" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: LeagueMember
ALTER TABLE "LeagueMember" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: Player
ALTER TABLE "Player" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: PlayerPerformance
ALTER TABLE "PlayerPerformance" ADD COLUMN "dotBalls" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "economyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "strikeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: Team
ALTER TABLE "Team" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Bid_teamId_idx" ON "Bid"("teamId");

-- CreateIndex
CREATE INDEX "LeagueMember_teamId_idx" ON "LeagueMember"("teamId");

-- CreateIndex
CREATE INDEX "Player_soldToTeamId_idx" ON "Player"("soldToTeamId");

-- CreateIndex
CREATE INDEX "Trade_leagueId_idx" ON "Trade"("leagueId");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_soldToTeamId_fkey" FOREIGN KEY ("soldToTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
