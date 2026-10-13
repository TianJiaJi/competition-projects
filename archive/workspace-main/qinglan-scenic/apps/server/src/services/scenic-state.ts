import { readFileSync } from "node:fs";
import { db } from "../database.ts";
import type { ScenicState } from "../../../../packages/contracts/src/mobile-qa.ts";
export const scenic = JSON.parse(readFileSync(new URL("../../../../packages/scenic/generated/mobile.json", import.meta.url), "utf8"));
let provider: ((runId: string) => Promise<ScenicState | undefined>) | undefined;
export function configureScenicState(value: (runId: string) => Promise<ScenicState | undefined>) { provider = value; }
export async function getScenicState(runId: string): Promise<ScenicState> {
    const shared = (await provider?.(runId));
    if (shared)
        return shared;
    const row = (await db
        .prepare("SELECT data FROM scenic_states WHERE run_id=$1")
        .get(runId)) as {
        data: string;
    } | undefined;
    if (row)
        return JSON.parse(row.data);
    const value: ScenicState = {
        points: Object.fromEntries(scenic.points.map((p: {
            id: string;
        }) => [
            p.id,
            {
                availability: scenic.snapshot.points[p.id]?.availability || "unknown",
                load: scenic.snapshot.points[p.id]?.load || "unknown",
            },
        ])),
        closedEdgeIds: [...scenic.snapshot.closedEdgeIds],
        updatedAt: new Date().toISOString(),
    };
    (await db.prepare("INSERT INTO scenic_states VALUES ($1,$2)").run(runId, JSON.stringify(value)));
    return value;
}
export async function updateScenicState(runId: string, input: Record<string, unknown>): Promise<ScenicState> {
    const value = (await getScenicState(runId));
    const id = String(input.id || "");
    if (input.kind === "point") {
        if (!value.points[id])
            throw Error("未知点位");
        if (input.availability !== undefined) {
            if (!["open", "closed", "maintenance", "unknown"].includes(String(input.availability)))
                throw Error("无效开放状态");
            value.points[id].availability =
                input.availability as ScenicState["points"][string]["availability"];
        }
        if (input.load !== undefined) {
            if (!["quiet", "light", "moderate", "busy", "unknown"].includes(String(input.load)))
                throw Error("无效忙闲状态");
            value.points[id].load =
                input.load as ScenicState["points"][string]["load"];
        }
    }
    else if (input.kind === "edge") {
        if (!scenic.edges.some((e: {
            id: string;
        }) => e.id === id) ||
            typeof input.closed !== "boolean")
            throw Error("无效道路状态");
        value.closedEdgeIds = value.closedEdgeIds.filter((e) => e !== id);
        if (input.closed)
            value.closedEdgeIds.push(id);
    }
    else
        throw Error("无效状态类型");
    value.updatedAt = new Date().toISOString();
    (await db.prepare("UPDATE scenic_states SET data=$1 WHERE run_id=$2").run(JSON.stringify(value), runId));
    return value;
}
