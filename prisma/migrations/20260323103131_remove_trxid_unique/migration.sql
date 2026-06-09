-- DropIndex
DROP INDEX `Payment_trxId_key` ON `payment`;

-- AlterTable
ALTER TABLE `notification` ADD COLUMN `error` TEXT NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'SENT';

-- AlterTable
ALTER TABLE `payment` MODIFY `status` ENUM('PENDING', 'PAID', 'VERIFIED', 'LATE') NOT NULL DEFAULT 'PENDING';
