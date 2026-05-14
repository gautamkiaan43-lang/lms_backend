-- AlterTable
ALTER TABLE `User` ADD COLUMN `agreementNumber` VARCHAR(191) NULL;
ALTER TABLE `User` ADD COLUMN `guarantorYearsKnown` VARCHAR(191) NULL;

-- CreateIndex (nullable unique: multiple NULLs allowed in MySQL)
CREATE UNIQUE INDEX `User_agreementNumber_key` ON `User`(`agreementNumber`);
