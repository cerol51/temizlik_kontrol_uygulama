import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
} from 'typeorm';

@Entity('projects')
export class Project {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 50, default: 'Europe/Istanbul' })
  timezone: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}

@Entity('locations')
@Index('locations_token_idx', ['token'])
export class Location {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @ManyToOne(() => Project, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project?: Project | null;

  @Column({ length: 60, unique: true })
  code: string;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 120, default: 'Ana Bina' })
  building: string;

  @Column({ length: 120, unique: true })
  token: string;

  @Column({ name: 'tolerance_minutes', type: 'int', default: 15 })
  toleranceMinutes: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  schedule: string[];

  @Column({ name: 'current_supervisor_id', type: 'varchar', length: 120, nullable: true })
  currentSupervisorId: string | null;

  @Column({ name: 'current_supervisor_name', type: 'varchar', length: 120, nullable: true })
  currentSupervisorName: string | null;

  @Column({ name: 'backup_supervisor_id', type: 'varchar', length: 120, nullable: true })
  backupSupervisorId: string | null;

  @Column({ name: 'backup_supervisor_name', type: 'varchar', length: 120, nullable: true })
  backupSupervisorName: string | null;

  @Column({ length: 30, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}

// Geriye dönük uyumluluk için alias
export const Restroom = Location;
export type Restroom = Location;

@Entity('checklist_templates')
export class ChecklistTemplate {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'version_tag', length: 50, default: 'v1.2' })
  versionTag: string;

  @Column({ length: 120 })
  title: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('checklist_items')
export class ChecklistItem {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId: string;

  @ManyToOne(() => ChecklistTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template?: ChecklistTemplate;

  @Column({ name: 'item_order', type: 'int' })
  itemOrder: number;

  @Column({ name: 'item_text', length: 255 })
  itemText: string;
}

@Entity('cleaning_records')
@Index('cleaning_records_created_idx', ['createdAt'])
@Index('cleaning_records_location_created_idx', ['locationId', 'createdAt'])
@Index('cleaning_records_idempotency_idx', ['idempotencyKey'])
export class CleaningRecord {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 64, nullable: true })
  idempotencyKey?: string | null;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location?: Location;

  @Column({ name: 'staff_user_id', length: 120 })
  staffUserId: string;

  @Column({ name: 'staff_name', length: 120 })
  staffName: string;

  @Column({ name: 'planned_slot', length: 20 })
  plannedSlot: string;

  @Column({ name: 'actual_time', length: 20 })
  actualTime: string;

  @Column({ name: 'sla_status', length: 30, default: 'ON_TIME' })
  slaStatus: string;

  @Column({ name: 'diff_minutes', type: 'int', default: 0 })
  diffMinutes: number;

  @Column({ name: 'tasks_confirmed', type: 'boolean', default: true })
  tasksConfirmed: boolean;

  @Column({ name: 'is_verified_qr', type: 'boolean', default: false })
  isVerifiedQr: boolean;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// Geriye dönük uyumluluk
export const CleaningEvent = CleaningRecord;
export type CleaningEvent = CleaningRecord;

@Entity('supervisor_audits')
@Index('supervisor_audits_created_idx', ['createdAt'])
@Index('supervisor_audits_location_created_idx', ['locationId', 'createdAt'])
export class SupervisorAudit {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location?: Location;

  @Column({ name: 'supervisor_id', length: 120 })
  supervisorId: string;

  @Column({ name: 'supervisor_name', length: 120 })
  supervisorName: string;

  @Column({ name: 'template_id', type: 'uuid', nullable: true })
  templateId: string | null;

  @Column({ name: 'template_version', length: 50, default: 'v1.2' })
  templateVersion: string;

  @Column({ name: 'is_approved', type: 'boolean' })
  isApproved: boolean;

  @Column({ name: 'is_verified_qr', type: 'boolean', default: false })
  isVerifiedQr: boolean;

  @Column({ name: 'checklist_json', type: 'jsonb' })
  checklistJson: Record<string, boolean>;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// Geriye dönük uyumluluk
export const Inspection = SupervisorAudit;
export type Inspection = SupervisorAudit;

@Entity('incidents')
@Index('incidents_location_idx', ['locationId'])
@Index('incidents_status_idx', ['status'])
@Index('incidents_created_idx', ['createdAt'])
@Index('incidents_status_created_idx', ['status', 'createdAt'])
export class Incident {
  @PrimaryColumn({ length: 60 })
  id: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location?: Location;

  @Column({ length: 30, default: 'OPEN' })
  status: string; // OPEN, ESCALATED, DISPATCHED, RESOLVED_BY_STAFF, VERIFIED_CLOSED

  @Column({ name: 'issues_json', type: 'jsonb', default: () => "'[]'" })
  issuesJson: string[];

  @Column({ name: 'signal_count', type: 'int', default: 1 })
  signalCount: number;

  @Column({ name: 'current_sup_id', type: 'varchar', length: 120, nullable: true })
  currentSupId: string | null;

  @Column({ name: 'current_sup_name', type: 'varchar', length: 120, nullable: true })
  currentSupName: string | null;

  @Column({ name: 'backup_sup_id', type: 'varchar', length: 120, nullable: true })
  backupSupId: string | null;

  @Column({ name: 'backup_sup_name', type: 'varchar', length: 120, nullable: true })
  backupSupName: string | null;

  @Column({ name: 'assigned_staff_id', type: 'varchar', length: 120, nullable: true })
  assignedStaffId: string | null;

  @Column({ name: 'assigned_staff_name', type: 'varchar', length: 120, nullable: true })
  assignedStaffName: string | null;

  @Column({ name: 'is_escalated', type: 'boolean', default: false })
  isEscalated: boolean;

  @Column({ name: 'is_tier2_escalated', type: 'boolean', default: false })
  isTier2Escalated: boolean;

  @Column({ length: 20 })
  time: string;

  @Column({ name: 'resolved_at', type: 'varchar', length: 20, nullable: true })
  resolvedAt: string | null;

  @Column({ name: 'resolved_at_utc', type: 'timestamptz', nullable: true })
  resolvedAtUtc: Date | null;

  @Column({ name: 'resolution_note', type: 'text', nullable: true })
  resolutionNote: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}

@Entity('notification_dispatch')
@Index('notification_dispatch_incident_idx', ['incidentId'])
export class NotificationDispatch {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'incident_id', length: 60 })
  incidentId: string;

  @ManyToOne(() => Incident, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident?: Incident;

  @Column({ name: 'recipient_user_id', length: 120 })
  recipientUserId: string;

  @Column({ name: 'recipient_name', length: 120 })
  recipientName: string;

  @Column({ length: 50, default: 'WebPush / InApp' })
  channel: string;

  @Column({ length: 30, default: 'DELIVERED' })
  status: string; // SENT, DELIVERED, READ

  @CreateDateColumn({ name: 'sent_time_utc', type: 'timestamptz' })
  sentTimeUtc: Date;
}

// Geriye dönük uyumluluk
export const AppNotification = NotificationDispatch;
export type AppNotification = NotificationDispatch;

@Entity('survey_feedbacks')
@Index('survey_feedbacks_created_idx', ['createdAt'])
@Index('survey_feedbacks_location_created_idx', ['locationId', 'createdAt'])
export class SurveyFeedback {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location?: Location;

  @Column({ length: 20 })
  rating: string; // 'good', 'fair', 'bad'

  @Column({ name: 'issues_json', type: 'jsonb', default: () => "'[]'" })
  issuesJson: string[];

  @Column({ name: 'client_hash', type: 'varchar', length: 128, nullable: true })
  clientHash: string | null;

  @Column({ length: 20 })
  time: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

// Geriye dönük uyumluluk
export const Survey = SurveyFeedback;
export type Survey = SurveyFeedback;

@Entity('audit_trail')
@Index('audit_trail_created_idx', ['createdAt'])
export class AuditTrail {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ length: 20 })
  timestamp: string;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId: string | null;

  @Column({ length: 60 })
  action: string;

  @Column({ name: 'user_role', length: 60 })
  userRole: string;

  @Column({ type: 'text' })
  summary: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}

@Entity('push_subscriptions')
@Unique(['endpoint'])
export class PushSubscription {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ length: 2048 })
  endpoint: string;

  @Column({ type: 'jsonb' })
  keys: { p256dh: string; auth: string };

  @Column({ name: 'supervisor_id', length: 120 })
  supervisorId: string;
}

@Entity('users')
@Index('users_username_idx', ['username'])
export class AppUser {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'full_name', length: 120 })
  fullName: string;

  @Column({ length: 60, unique: true })
  username: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({ length: 30, default: 'employee' })
  role: string; // 'employee' | 'supervisor' | 'admin'

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date | null;
}

