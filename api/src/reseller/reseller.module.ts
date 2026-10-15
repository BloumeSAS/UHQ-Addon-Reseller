import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { PanelClient } from './panel-client.service';
import { ResellerController } from './reseller.controller';
import { ResellerService } from './reseller.service';
import { StoreService } from './store.service';
import { UhqClient } from './uhq-client.service';

@Module({
  controllers: [ResellerController, BackupController],
  providers: [StoreService, UhqClient, PanelClient, ResellerService],
})
export class ResellerModule {}
