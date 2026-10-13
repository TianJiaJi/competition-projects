export interface LeaveTimeRange {
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  startPeriod?: "上午" | "下午";
  endPeriod?: "上午" | "下午";
}
export const validLeaveTime = (time: string) => /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time);
export function leaveTimes(range: LeaveTimeRange) {
  return {
    start: range.startTime ?? (range.startPeriod === "下午" ? "12:00:00" : "00:00:00"),
    end: range.endTime ?? (range.endPeriod === "上午" ? "11:59:59" : "23:59:59"),
  };
}
export function leaveBounds(range: LeaveTimeRange) {
  const times = leaveTimes(range);
  return {
    start: Date.parse(`${range.startDate}T${times.start}+08:00`),
    // Legacy half-day records included the whole final period.
    end: Date.parse(`${range.endDate}T${times.end}+08:00`) + (range.endTime ? 0 : 1000),
  };
}
export function formatLeaveRange(range: LeaveTimeRange) {
  const times = leaveTimes(range);
  return `${range.startDate} ${times.start} — ${range.endDate} ${times.end}`;
}
export function formatLeaveDuration(milliseconds: number) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "";
  let seconds = Math.floor(milliseconds / 1000);
  const days = Math.floor(seconds / 86400); seconds %= 86400;
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  return [days ? `${days} 天` : "", hours ? `${hours} 小时` : "", minutes ? `${minutes} 分钟` : "", seconds ? `${seconds} 秒` : ""].filter(Boolean).join(" ");
}
export const leaveNatures = ["日常请假", "节假日请假"] as const;
export const leaveDestinations = ["医院就诊", "回家", "校外办事", "其他"] as const;
export interface LeaveDetails {
  leavingCampus: boolean;
  leavingCity: boolean;
  destination: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
  nature: (typeof leaveNatures)[number];
  cc: string[];
  confirmed: boolean;
}
// Shared with the service: conditional fields cannot bypass the form validation.
export function validateLeaveDetails(input: Partial<LeaveDetails>): string {
  if (typeof input.leavingCampus !== "boolean" || typeof input.leavingCity !== "boolean") return "请选择是否离校及是否离开学校所在地";
  if (!input.leavingCampus && input.leavingCity) return "不离校时不能选择离开学校所在地";
  if (input.leavingCampus && !leaveDestinations.includes(input.destination as typeof leaveDestinations[number])) return "请选择离校去向";
  if (input.leavingCampus && (typeof input.address !== "string" || input.address.trim().length < 2 || input.address.trim().length > 120)) return "请填写 2–120 字的详细地址";
  if (typeof input.emergencyName !== "string" || input.emergencyName.trim().length < 2 || input.emergencyName.trim().length > 30) return "请填写 2–30 字的紧急联系人姓名";
  if (!/^1\d{10}$/.test(input.emergencyPhone?.trim() ?? "")) return "请填写 11 位紧急联系人电话";
  if (!leaveNatures.includes(input.nature as typeof leaveNatures[number])) return "请选择请假性质";
  if (!Array.isArray(input.cc) || input.cc.length > 1 || input.cc.some((name) => name !== "陈越")) return "请选择有效的抄送人";
  if (input.confirmed !== true) return "请确认填写的信息真实有效";
  return "";
}
