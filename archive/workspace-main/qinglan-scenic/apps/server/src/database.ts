import type { QaStatus } from "../../../packages/contracts/src/mobile-qa.ts";
import { openDatabase } from "./postgres.ts";
export const db = openDatabase();
export interface Session {
    id: string;
    nickname: string;
    run_id: string;
    expires: number;
}
export interface Conversation {
    id: string;
    owner: string;
    run_id: string;
    poi_id: string | null;
    created_at: string;
}
export interface Message {
    id: string;
    conversation_id: string;
    role: "user" | "assistant";
    text: string;
    status: QaStatus;
    sources: string;
    created_at: string;
    error_code: string | null;
    parent_id: string | null;
}
