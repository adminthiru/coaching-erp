import { Controller, Get, Query } from '@nestjs/common';
import { paginationSchema } from '@acadia/validation';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuditService } from './audit.service';

@Controller('platform/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(paginationSchema)) query: any,
    @Query('organizationId') organizationId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
  ) {
    return this.audit.list({ ...query, organizationId, action, entityType });
  }
}
