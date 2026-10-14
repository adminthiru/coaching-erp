import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { RouterModule } from '@nestjs/core';

import { TenantAuthController } from './auth/tenant-auth.controller';
import { TenantAuthService } from './auth/tenant-auth.service';
import { TenantTokenService } from './auth/tenant-token.service';
import { BranchesController } from './branches/branches.controller';
import { BranchesService } from './branches/branches.service';
import { StaffController } from './staff/staff.controller';
import { StaffService } from './staff/staff.service';
import { TenantDashboardController } from './dashboard/tenant-dashboard.controller';
import { TenantDashboardService } from './dashboard/tenant-dashboard.service';
import { TenantOrganizationController } from './organization/tenant-organization.controller';
import { TenantOrganizationService } from './organization/tenant-organization.service';
import { AcademicsController } from './academics/academics.controller';
import { AcademicsService } from './academics/academics.service';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { BatchesController } from './batches/batches.controller';
import { BatchesService } from './batches/batches.service';
import { AdmissionsController } from './admissions/admissions.controller';
import { AdmissionsService } from './admissions/admissions.service';
import { TimetableController } from './timetable/timetable.controller';
import { TimetableService } from './timetable/timetable.service';
import { ConflictsService } from './timetable/conflicts.service';
import { SyllabusController } from './syllabus/syllabus.controller';
import { SyllabusService } from './syllabus/syllabus.service';
import { PlanningController } from './planning/planning.controller';
import { PlanningService } from './planning/planning.service';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { LeaveController } from './leave/leave.controller';
import { LeaveService } from './leave/leave.service';
import { CommunicationController } from './communication/communication.controller';
import { CommunicationService } from './communication/communication.service';
import { QuestionsController } from './questions/questions.controller';
import { QuestionsService } from './questions/questions.service';
import { TestsController, AttemptsController } from './tests/tests.controller';
import { TestsService } from './tests/tests.service';
import { AttemptsService } from './tests/attempts.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { HomeworkController, HomeworkSubmissionsController } from './homework/homework.controller';
import { HomeworkService } from './homework/homework.service';
import { MaterialsController } from './materials/materials.controller';
import { MaterialsService } from './materials/materials.service';
import { DoubtsController } from './doubts/doubts.controller';
import { DoubtsService } from './doubts/doubts.service';
import { FeeStructuresController, FeesController, FeePaymentsController } from './fees/fees.controller';
import { FeesService } from './fees/fees.service';
import { ExpensesController } from './expenses/expenses.controller';
import { ExpensesService } from './expenses/expenses.service';
import { PortalController } from './portal/portal.controller';
import { PortalService } from './portal/portal.service';
import { GuardiansController } from './portal/guardians.controller';
import { GuardiansService } from './portal/guardians.service';
import { InsightsController } from './insights/insights.controller';
import { InsightsService } from './insights/insights.service';
import { NarrationService } from './insights/narration.service';
import { HostelController, TransportController, MessController } from './residence/residence.controller';
import { HostelService } from './residence/hostel.service';
import { TransportService } from './residence/transport.service';
import { MessService } from './residence/mess.service';

/**
 * Everything a tenant can reach, mounted under /api/tenant.
 *
 * Kept apart from the platform modules so the two never share a guard, a token
 * type or a route prefix — the separation the spec insists on (§1, §86).
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [
    TenantAuthController,
    TenantOrganizationController,
    BranchesController,
    StaffController,
    TenantDashboardController,
    AcademicsController,
    StudentsController,
    BatchesController,
    AdmissionsController,
    SyllabusController,
    TimetableController,
    PlanningController,
    AttendanceController,
    LeaveController,
    CommunicationController,
    QuestionsController,
    TestsController,
    AttemptsController,
    AnalyticsController,
    HomeworkController,
    HomeworkSubmissionsController,
    MaterialsController,
    DoubtsController,
    FeeStructuresController,
    FeesController,
    FeePaymentsController,
    ExpensesController,
    PortalController,
    GuardiansController,
    HostelController,
    TransportController,
    MessController,
    InsightsController,
  ],
  providers: [
    TenantTokenService,
    TenantAuthService,
    BranchesService,
    StaffService,
    TenantDashboardService,
    TenantOrganizationService,
    AcademicsService,
    StudentsService,
    BatchesService,
    AdmissionsService,
    SyllabusService,
    ConflictsService,
    TimetableService,
    PlanningService,
    AttendanceService,
    LeaveService,
    CommunicationService,
    QuestionsService,
    TestsService,
    AttemptsService,
    AnalyticsService,
    HomeworkService,
    MaterialsService,
    DoubtsService,
    FeesService,
    ExpensesService,
    PortalService,
    GuardiansService,
    HostelService,
    TransportService,
    MessService,
    InsightsService,
    NarrationService,
  ],
  exports: [TenantTokenService],
})
export class TenantModule {}

/** Prefixes every tenant controller with `tenant/`. */
export const TenantRouting = RouterModule.register([{ path: 'tenant', module: TenantModule }]);
