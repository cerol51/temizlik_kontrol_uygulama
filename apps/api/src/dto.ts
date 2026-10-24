import {
  IsArray,
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSurveyFeedbackDto {
  @IsUUID()
  locationId: string;

  @IsString()
  @IsIn(['good', 'fair', 'bad', '1', '2', '3', '4', '5'])
  rating: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  issues?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientHash?: string;

  // Geriye dönük uyumluluk
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// Geriye dönük uyumluluk alias
export const CreateSurveyDto = CreateSurveyFeedbackDto;
export type CreateSurveyDto = CreateSurveyFeedbackDto;

export class CreateCleaningRecordDto {
  @IsOptional()
  @IsBoolean()
  tasksConfirmed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  staffName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationToken?: string;
}

export class CreateSupervisorAuditDto {
  @IsBoolean()
  isApproved: boolean;

  @IsNotEmpty()
  checklist: any;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  templateVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

// Geriye dönük uyumluluk
export const CreateInspectionDto = CreateSupervisorAuditDto;
export type CreateInspectionDto = CreateSupervisorAuditDto;

export class DispatchIncidentDto {
  @IsString()
  @MaxLength(120)
  assignedStaffName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedStaffId?: string;
}

export class StaffResolveIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  staffName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class VerifyCloseIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateScheduleDto {
  @IsArray()
  @IsString({ each: true })
  schedule: string[];

  @IsInt()
  @Min(1)
  @Max(60)
  toleranceMinutes: number;
}

export class PushSubscriptionKeysDto {
  @IsString()
  @MaxLength(512)
  p256dh: string;

  @IsString()
  @MaxLength(512)
  auth: string;
}

export class CreatePushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @IsString()
  @MaxLength(2048)
  endpoint: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys: PushSubscriptionKeysDto;
}

export class CreateLocationDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  building?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  toleranceMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  schedule?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentSupervisorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  backupSupervisorName?: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  building?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  toleranceMinutes?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  schedule?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  currentSupervisorName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  backupSupervisorName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['ACTIVE', 'TEMPORARILY_CLOSED', 'MAINTENANCE', 'INACTIVE'])
  status?: string;
}

