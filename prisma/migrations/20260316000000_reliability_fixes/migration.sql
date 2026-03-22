-- Team: unique constraint on (leagueId, name) to prevent duplicate team names
CREATE UNIQUE INDEX "Team_leagueId_name_key" ON "Team"("leagueId", "name");

-- TradeItem: foreign key to Player
ALTER TABLE "TradeItem" ADD CONSTRAINT "TradeItem_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TradeItem: index on playerId
CREATE INDEX "TradeItem_playerId_idx" ON "TradeItem"("playerId");
