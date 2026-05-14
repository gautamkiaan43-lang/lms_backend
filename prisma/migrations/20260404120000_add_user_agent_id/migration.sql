-- AlterTable
ALTER TABLE `User` ADD COLUMN `agentId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `User_agentId_idx` ON `User`(`agentId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
