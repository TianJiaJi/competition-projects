import type { PublicSnapshot, OpsAlert, Availability } from './index.ts';
export type Role = 'admin' | 'staff' | 'visitor';
export interface Account { id: string; username: string; name: string; role: Role; disabled: boolean; simulated: boolean; mustChangePassword?:boolean }
export interface AuthResult { token: string; runId: string; user: Account }
export interface RunInfo { id: string; mode: 'realtime' | 'replay'; scenario: string; businessTime: string; speed: number; paused: boolean; revision: number; configVersion: string; parentId?: string }
export interface PlatformSnapshot { run: RunInfo; public: PublicSnapshot; checkedInToday: number; exitedToday: number; windSpeedMps: number; history: {time:string;count:number}[]; alerts: Task[] }
export interface Task extends OpsAlert { version: number; assigneeId: string | null; assigneeName: string | null; resolvedAt: string | null }
export interface OA { id: string; taskId: string; applicantId: string; type: 'reinforcement'|'cordon'|'supplies'|'other'; reason: string; needs: string; status:'pending'|'approved'|'rejected'|'withdrawn'; version:number; createdAt:string; records: {at:string;actorId:string;actorName:string;decision:string;opinion:string}[] }
export interface Booking { id:string; userId:string; kind:'entry'|'parking'; date:string; slot:string; slotEnd?:string; slotId?:string; people:number; lotId?:string; status:'confirmed'|'cancelled'|'expired'; entered:boolean; exited:boolean; version:number; createdAt:string }
export interface FacilityOverride { availability:Availability; reason:string; requestedPaused?:Record<string,number> }
export interface ChatMessage { id:string; roomId:string; authorId:string; authorName:string; text:string; version:number; removed:boolean; simulated:boolean; createdAt:string }
export interface Notice { id:string; title:string; body:string; audience:'public'|'internal'; active:boolean; suppressed:boolean; eventId?:string; expiresAt?:string }
export interface Inspection { id:string; facilityId:string; intervalDays:number; nextDueDate:string; instructions:string; enabled:boolean; version:number }
export interface ApiMeta { requestId:string; generatedAt:string; runId?:string; revision?:number }
export type WorkStatus='created'|'dispatched'|'accepted'|'in_progress'|'suspended'|'awaiting_acceptance'|'completed';
export interface WorkflowRecord {at:string;actorId:string;actorName:string;action:string;reason:string;photoIds:string[]}
export interface WorkOrder {id:string;alertId?:string;facilityId:string;regionId:string;title:string;description:string;status:WorkStatus;priority:'normal'|'urgent';assigneeId:string|null;version:number;createdAt:string;createdAtWall?:string;records:WorkflowRecord[];legacyTaskId?:string}
export interface FacilityRequest {id:string;facilityId:string;regionId:string;kind:'repair'|'closure';reason:string;photoIds:string[];applicantId:string;status:'pending'|'approved'|'rejected';version:number;createdAt:string;createdAtWall?:string;records:WorkflowRecord[];workOrderId?:string}
