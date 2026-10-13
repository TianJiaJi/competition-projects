// Deterministic teaching demo data. This is not a student information system.
export const demoTeacher = { id: "staff01", name: "陈越", department: "信息工程学院" } as const;
export const demoClass = { id: "CLS-2401", name: "2024级软件工程1班", major: "软件工程", grade: "2024级", teacherId: demoTeacher.id } as const;
export const students = [
  { id: "user01", name: "林悦", number: "2024010101", phone: "13900001001", classId: demoClass.id },
  { id: "ST-02", name: "陈晨", number: "2024010102", phone: "13900001002", classId: demoClass.id },
  { id: "ST-03", name: "顾宁", number: "2024010103", phone: "13900001003", classId: demoClass.id },
  { id: "ST-04", name: "周然", number: "2024010104", phone: "13900001004", classId: demoClass.id },
  { id: "ST-05", name: "宋怡", number: "2024010105", phone: "13900001005", classId: demoClass.id },
  { id: "ST-06", name: "许安", number: "2024010106", phone: "13900001006", classId: demoClass.id },
  { id: "ST-07", name: "徐静", number: "2024010107", phone: "13900001007", classId: demoClass.id },
  { id: "ST-08", name: "李知", number: "2024010108", phone: "13900001008", classId: demoClass.id },
  { id: "ST-OTHER", name: "赵明", number: "2024020101", phone: "13900002001", classId: "CLS-2402" },
] as const;
export const studentFor = (name: string) => students.find((student) => student.name === name);

export const courses = [
  { id: "C01", weekday: 1, time: "08:00–09:40", title: "程序设计基础", venue: "明理楼 305", classId: demoClass.id },
  { id: "C02", weekday: 2, time: "10:00–11:40", title: "数据结构", venue: "致远楼 204", classId: demoClass.id },
  { id: "C03", weekday: 3, time: "14:00–15:40", title: "软件工程导论", venue: "明理楼 305", classId: demoClass.id },
  { id: "C04", weekday: 4, time: "08:00–09:40", title: "程序设计基础", venue: "明理楼 305", classId: demoClass.id },
  { id: "C05", weekday: 5, time: "14:00–15:40", title: "项目实践", venue: "知行图书馆研讨室", classId: demoClass.id },
] as const;

export const classroomDetails: Record<string, { features: string[]; rule: string; hours: string }> = {
  F1: { features: ["白板", "无线网络", "讨论桌"], rule: "小组学习与研讨，请保持安静并按时归还座椅。", hours: "08:00–22:00" },
  F7: { features: ["投影", "可移动桌椅", "无线网络"], rule: "适合课程研讨与小组活动，离开时关闭设备。", hours: "08:00–20:00" },
  F8: { features: ["多媒体", "讲台", "白板"], rule: "适合学习分享与社团培训，请提前准备活动材料。", hours: "08:00–20:00" },
};

export const bookingWindowDays = 14;
export const leaveWindowDays = 30;
export const leavePeriods = ["上午", "下午"] as const;
export const leaveTypes = ["病假", "事假", "其他"] as const;
