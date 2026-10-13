<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { createBookingClient, bookingStatusLabel, leaveStatusLabel, formatLeaveRange, type BookingRequest, type LeaveRequest } from "@scene/bookings";
import { courses, demoClass, demoTeacher, students } from "../../../../scenario/teaching";
import { LiquidGlassButton as GlassButton, LiquidGlassSurface as GlassSurface } from "@scene/ui/liquid-glass";
import Drawer from "./Drawer.vue";
import StatusTag from "./StatusTag.vue";

const props = defineProps<{ page: string; identity: string }>();
const emit = defineEmits<{ navigate: [page: string] }>();
const client = createBookingClient(import.meta.env.VITE_BOOKING_API_URL);
const bookings = ref<BookingRequest[]>([]);
const leaves = ref<LeaveRequest[]>([]);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const reason = ref("");
const query = ref("");
const statusFilter = ref("all");
const chinaWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short" }).format(new Date());
const weekday = ref(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(chinaWeekday) || 7);
const teachingTab = ref<"timetable" | "classes" | "students">("timetable");
const approvalTab = ref<"bookingApprovals" | "leaveApprovals">("bookingApprovals");
const view = computed(() => props.page === "teaching" ? teachingTab.value : props.page === "approvals" ? approvalTab.value : props.page);
function goSection(section: "timetable" | "classes" | "students" | "bookingApprovals" | "leaveApprovals") {
  if (["timetable", "classes", "students"].includes(section)) {
    teachingTab.value = section as typeof teachingTab.value;
    emit("navigate", "teaching");
  } else {
    approvalTab.value = section as typeof approvalTab.value;
    emit("navigate", "approvals");
  }
}
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
type Selection = { kind: "booking" | "leave" | "student" | "course"; id: string };
const selected = ref<Selection | null>(null);
const selectedBooking = computed(() => selected.value?.kind === "booking" ? bookings.value.find((item) => item.id === selected.value?.id) : undefined);
const selectedLeave = computed(() => selected.value?.kind === "leave" ? leaves.value.find((item) => item.id === selected.value?.id) : undefined);
const selectedStudent = computed(() => selected.value?.kind === "student" ? students.find((item) => item.id === selected.value?.id) : undefined);
const selectedCourse = computed(() => selected.value?.kind === "course" ? courses.find((item) => item.id === selected.value?.id) : undefined);
const title = computed(() => ({ overview: "教学工作台", timetable: "我的课程表", classes: "我的班级", students: "学生信息", bookingApprovals: "教室预约审批", leaveApprovals: "学生请假审批", profile: "教师中心" })[view.value as "overview"] ?? "教学工作台");
const pendingBookings = computed(() => bookings.value.filter((item) => item.status === "pending"));
const pendingLeaves = computed(() => leaves.value.filter((item) => item.status === "pending"));
const todayCourses = computed(() => courses.filter((item) => item.weekday === weekday.value));
const classStudents = computed(() => students.filter((item) => item.classId === demoClass.id));
const filteredStudents = computed(() => classStudents.value.filter((item) => `${item.name}${item.number}${demoClass.name}`.includes(query.value.trim())));
const filteredBookings = computed(() => bookings.value.filter((item) =>
  (statusFilter.value === "all" || item.status === statusFilter.value) &&
  `${item.venue}${item.owner}${item.activity ?? ""}${item.purpose}${item.id}`.includes(query.value.trim())));
const filteredLeaves = computed(() => leaves.value.filter((item) =>
  (statusFilter.value === "all" || item.status === statusFilter.value) &&
  `${item.owner}${item.type}${item.reason}${item.id}`.includes(query.value.trim())));
async function refresh() {
  loading.value = true;
  error.value = "";
  try {
    [bookings.value, leaves.value] = await Promise.all([client.list(undefined, props.identity), client.listLeaves(undefined, props.identity)]);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "申请加载失败"; }
  finally { loading.value = false; }
}
onMounted(() => void refresh());
watch(() => props.page, () => {
  query.value = "";
  statusFilter.value = "all";
  selected.value = null;
  if (["overview", "approvals"].includes(props.page)) void refresh();
});
watch([teachingTab, approvalTab], () => {
  query.value = "";
  statusFilter.value = "all";
  selected.value = null;
});
function open(kind: Selection["kind"], id: string) { selected.value = { kind, id }; reason.value = ""; error.value = ""; }
async function review(decision: "approve" | "reject") {
  if (!selected.value || busy.value || !(selectedBooking.value || selectedLeave.value)) return;
  if (decision === "reject" && !reason.value.trim()) { error.value = "拒绝时请填写原因"; return; }
  busy.value = true;
  error.value = "";
  try {
    if (selectedBooking.value) {
      const item = await client.review(selectedBooking.value.id, decision, props.identity, reason.value.trim());
      bookings.value = bookings.value.map((booking) => booking.id === item.id ? item : booking);
    } else if (selectedLeave.value) {
      const item = await client.reviewLeave(selectedLeave.value.id, decision, props.identity, reason.value.trim());
      leaves.value = leaves.value.map((leave) => leave.id === item.id ? item : leave);
    }
    reason.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "审核失败";
    if (error.value.includes("已处理") || error.value.includes("已有通过")) await refresh();
  } finally { busy.value = false; }
}
</script>
<template>
  <div class="teacher-workspace">
    <div class="teacher-heading"><div><p class="eyebrow">TEACHING · CARE · CONNECTION</p><h1>{{ title }}</h1><p class="muted">{{ demoTeacher.name }} · {{ demoClass.name }}</p></div><GlassButton v-if="['overview', 'approvals'].includes(page)" :disabled="loading" @click="refresh">{{ loading ? '同步中…' : '刷新申请' }}</GlassButton></div>
    <div v-if="page === 'teaching'" class="teacher-subnav" aria-label="教学分类"><button :class="{ active: teachingTab === 'timetable' }" @click="teachingTab = 'timetable'">课程表</button><button :class="{ active: teachingTab === 'classes' }" @click="teachingTab = 'classes'">我的班级</button><button :class="{ active: teachingTab === 'students' }" @click="teachingTab = 'students'">学生信息</button></div>
    <div v-if="page === 'approvals'" class="teacher-subnav" aria-label="审批分类"><button :class="{ active: approvalTab === 'bookingApprovals' }" @click="approvalTab = 'bookingApprovals'">教室预约 <small>{{ pendingBookings.length }}</small></button><button :class="{ active: approvalTab === 'leaveApprovals' }" @click="approvalTab = 'leaveApprovals'">学生请假 <small>{{ pendingLeaves.length }}</small></button></div>
    <p v-if="error && !selected" class="error" role="alert">{{ error }}</p>
    <template v-if="view === 'overview'">
      <div class="teacher-hero"><p class="eyebrow">TODAY AT A GLANCE</p><h2>把每一堂课，<br/>都认真对待。</h2><p>{{ weekdays[weekday - 1] }} · {{ todayCourses.length ? `今天有 ${todayCourses.length} 节课，和学生一起继续探索。` : '今日无课程安排，可查看本周课表。' }}</p></div>
      <div class="teacher-metrics"><button @click="goSection('timetable')"><strong>{{ todayCourses.length }}</strong><span>今日课程 ↗</span></button><button @click="goSection('bookingApprovals')"><strong>{{ pendingBookings.length }}</strong><span>预约待审批 ↗</span></button><button @click="goSection('leaveApprovals')"><strong>{{ pendingLeaves.length }}</strong><span>请假待审批 ↗</span></button></div>
      <div class="teacher-columns"><GlassSurface class="teacher-panel" :radius="20"><div class="teacher-panel-head"><h2>今日课程</h2><button @click="goSection('timetable')">查看课表 ↗</button></div><p v-if="!todayCourses.length" class="muted">今天暂无课程，点击课表查看本周安排。</p><button v-for="course in todayCourses" :key="course.id" class="teacher-list-row" @click="open('course', course.id)"><span class="teacher-time">{{ course.time }}</span><span><strong>{{ course.title }}</strong><small>{{ course.venue }} · {{ demoClass.name }}</small></span><span>↗</span></button></GlassSurface>
        <GlassSurface class="teacher-panel" :radius="20"><div class="teacher-panel-head"><h2>需要我审批</h2><span class="muted">{{ pendingBookings.length + pendingLeaves.length }} 项</span></div><p v-if="!pendingBookings.length && !pendingLeaves.length" class="muted">暂无待审批申请。</p><button v-for="item in pendingBookings.slice(0, 3)" :key="item.id" class="teacher-list-row" @click="goSection('bookingApprovals')"><span class="teacher-time">预约</span><span><strong>{{ item.activity || item.venue }}</strong><small>{{ item.owner }} · {{ item.date }} {{ item.time }}</small></span><span>↗</span></button><button v-for="item in pendingLeaves.slice(0, 3)" :key="item.id" class="teacher-list-row" @click="goSection('leaveApprovals')"><span class="teacher-time">请假</span><span><strong>{{ item.owner }} · {{ item.type }}</strong><small>{{ formatLeaveRange(item) }}</small></span><span>↗</span></button></GlassSurface></div>
    </template>
    <template v-else-if="view === 'timetable'"><p class="teacher-lead">本周固定教学样例 · 选择星期查看课程，点击课程可查看详情。</p><div class="teacher-week"><button v-for="(day, index) in weekdays" :key="day" :class="{ active: weekday === index + 1 }" @click="weekday = index + 1">{{ day }}</button></div><div v-if="!todayCourses.length" class="teacher-empty">这一天没有排课，留一些时间给备课与交流。</div><button v-for="course in todayCourses" :key="course.id" class="teacher-course" @click="open('course', course.id)"><span class="teacher-time">{{ course.time }}</span><span><strong>{{ course.title }}</strong><small>{{ course.venue }} · {{ demoClass.name }}</small></span><span>查看 ↗</span></button></template>
    <template v-else-if="view === 'classes'"><p class="teacher-lead">你所带的班级与课程，学生申请也从这里关联到你的审批工作台。</p><GlassSurface class="teacher-class" :radius="22"><p class="eyebrow">MY CLASS · 2024</p><h2>{{ demoClass.name }}</h2><p>{{ demoTeacher.department }} · {{ demoClass.major }} · 辅导教师 {{ demoTeacher.name }}</p><div class="teacher-class-stats"><span><strong>{{ classStudents.length }}</strong> 名学生</span><span><strong>{{ courses.length }}</strong> 门/节本周课程</span><span><strong>{{ pendingLeaves.length }}</strong> 份待审请假</span></div><GlassButton class="primary" @click="goSection('students')">查看学生名单 ↗</GlassButton></GlassSurface></template>
    <template v-else-if="view === 'students'"><p class="teacher-lead">查看所带班级的学生信息；点击姓名查看联系方式。</p><label class="teacher-filter">搜索学生姓名或学号<input v-model="query" aria-label="搜索学生" placeholder="输入姓名或学号" /></label><p v-if="!filteredStudents.length" class="teacher-empty">没有匹配的学生。</p><div class="teacher-grid"><button v-for="student in filteredStudents" :key="student.id" class="teacher-card" @click="open('student', student.id)"><span class="teacher-avatar">{{ student.name.slice(0, 1) }}</span><strong>{{ student.name }}</strong><small>{{ student.number }} · {{ demoClass.name }}</small><span class="teacher-link">查看资料 ↗</span></button></div></template>
    <template v-else-if="view === 'bookingApprovals' || view === 'leaveApprovals'"><p class="teacher-lead">仅显示 {{ demoClass.name }} 学生申请；通过后立即生效，拒绝时需填写原因。</p><div class="teacher-filters"><label>搜索申请<input v-model="query" :aria-label="view === 'bookingApprovals' ? '搜索教室预约' : '搜索学生请假'" placeholder="姓名、教室、申请内容" /></label><label>状态筛选<select v-model="statusFilter" aria-label="状态筛选"><option value="all">全部状态</option><option value="pending">待审核</option><option value="approved">已通过</option><option value="rejected">已拒绝</option><option value="cancelled">已取消</option></select></label></div>
      <div v-if="view === 'bookingApprovals'" class="teacher-grid"><button v-for="item in filteredBookings" :key="item.id" class="teacher-card" @click="open('booking', item.id)"><span class="teacher-card-top"><small>教室预约 · {{ item.date }}</small><StatusTag :label="bookingStatusLabel[item.status]" :tone="item.status === 'pending' ? 'warning' : item.status === 'approved' ? 'success' : 'info'" /></span><strong>{{ item.activity || item.venue }}</strong><span>{{ item.venue }} · {{ item.time }}</span><small>{{ item.owner }} · {{ item.count }} 人</small><span class="teacher-link">查看申请 ↗</span></button></div>
      <div v-else class="teacher-grid"><button v-for="item in filteredLeaves" :key="item.id" class="teacher-card" @click="open('leave', item.id)"><span class="teacher-card-top"><small>学生请假 · {{ item.type }}</small><StatusTag :label="leaveStatusLabel[item.status]" :tone="item.status === 'pending' ? 'warning' : item.status === 'approved' ? 'success' : 'info'" /></span><strong>{{ item.owner }} · {{ item.type }}</strong><span>{{ formatLeaveRange(item) }}</span><small>{{ item.reason }}</small><span class="teacher-link">查看申请 ↗</span></button></div>
      <p v-if="view === 'bookingApprovals' ? !filteredBookings.length : !filteredLeaves.length" class="teacher-empty">{{ loading ? '正在加载申请…' : '暂无符合条件的申请。' }}</p>
    </template>
    <template v-else-if="view === 'profile'"><GlassSurface class="teacher-class" :radius="22"><p class="eyebrow">MY TEACHING PROFILE</p><h2>{{ demoTeacher.name }}</h2><p>{{ demoTeacher.department }} · {{ demoClass.name }} 带班教师</p><div class="teacher-class-stats"><span><strong>{{ classStudents.length }}</strong> 名学生</span><span><strong>{{ courses.length }}</strong> 节每周课程</span></div><p class="muted">在教学分类管理班级信息，在审批分类查看待处理申请。退出登录请使用右上角图标。</p></GlassSurface></template>
  </div>
  <Drawer v-if="selected" :title="selectedBooking?.activity || selectedBooking?.venue || (selectedLeave ? `${selectedLeave.owner} · ${selectedLeave.type}` : selectedStudent?.name || selectedCourse?.title || '详情')" :subtitle="selectedBooking?.venue || selectedLeave?.owner || demoClass.name" mobile-page @close="selected = null">
    <template v-if="selectedBooking"><StatusTag :label="bookingStatusLabel[selectedBooking.status]" :tone="selectedBooking.status === 'pending' ? 'warning' : 'success'" /><p class="detail-description">{{ selectedBooking.purpose }}</p><dl class="detail-meta"><dt>申请人</dt><dd>{{ selectedBooking.owner }}</dd><dt>班级</dt><dd>{{ demoClass.name }}</dd><dt>教室</dt><dd>{{ selectedBooking.venue }}</dd><dt>预约时间</dt><dd>{{ selectedBooking.date }} {{ selectedBooking.time }}</dd><dt>使用人数</dt><dd>{{ selectedBooking.count }} 人</dd><dt>联系电话</dt><dd>{{ selectedBooking.phone || '旧版未填写' }}</dd><dt>补充说明</dt><dd>{{ selectedBooking.note || '无' }}</dd><dt>提交时间</dt><dd>{{ selectedBooking.createdAt }}</dd><template v-if="selectedBooking.reviewer"><dt>审核教师</dt><dd>{{ selectedBooking.reviewer }}</dd></template></dl><p v-if="selectedBooking.reviewReason" class="result-note">审核说明：{{ selectedBooking.reviewReason }}</p></template>
    <template v-else-if="selectedLeave"><StatusTag :label="leaveStatusLabel[selectedLeave.status]" :tone="selectedLeave.status === 'pending' ? 'warning' : 'success'" /><p class="detail-description">{{ selectedLeave.reason }}</p><dl class="detail-meta"><dt>申请人</dt><dd>{{ selectedLeave.owner }}</dd><dt>班级</dt><dd>{{ demoClass.name }}</dd><dt>类型</dt><dd>{{ selectedLeave.type }}</dd><dt>请假时间</dt><dd>{{ formatLeaveRange(selectedLeave) }}</dd><dt>请假性质</dt><dd>{{ selectedLeave.nature || '未填写' }}</dd><dt>是否离校</dt><dd>{{ selectedLeave.leavingCampus === undefined ? '未填写' : selectedLeave.leavingCampus ? '是' : '否' }}</dd><template v-if="selectedLeave.leavingCampus"><dt>离开学校所在地</dt><dd>{{ selectedLeave.leavingCity ? '是' : '否' }}</dd><dt>离校去向</dt><dd>{{ selectedLeave.destination }}</dd><dt>详细地址</dt><dd>{{ selectedLeave.address }}</dd></template><dt>本人手机号</dt><dd>{{ selectedLeave.phone }}</dd><dt>紧急联系人</dt><dd>{{ selectedLeave.emergencyName || '未填写' }}</dd><dt>紧急电话</dt><dd>{{ selectedLeave.emergencyPhone || selectedLeave.phone }}</dd><dt>抄送人</dt><dd>{{ selectedLeave.cc?.join('、') || '无' }}</dd><dt>提交时间</dt><dd>{{ selectedLeave.createdAt }}</dd><template v-if="selectedLeave.reviewer"><dt>审核教师</dt><dd>{{ selectedLeave.reviewer }}</dd></template></dl><p v-if="selectedLeave.reviewReason" class="result-note">审核说明：{{ selectedLeave.reviewReason }}</p></template>
    <template v-else-if="selectedStudent"><p class="detail-description">{{ demoClass.name }} · {{ demoClass.major }}</p><dl class="detail-meta"><dt>姓名</dt><dd>{{ selectedStudent.name }}</dd><dt>学号</dt><dd>{{ selectedStudent.number }}</dd><dt>联系方式</dt><dd>{{ selectedStudent.phone }}</dd><dt>带班教师</dt><dd>{{ demoTeacher.name }}</dd></dl></template>
    <template v-else-if="selectedCourse"><p class="detail-description">{{ selectedCourse.title }}</p><dl class="detail-meta"><dt>上课时间</dt><dd>{{ weekdays[selectedCourse.weekday - 1] }} {{ selectedCourse.time }}</dd><dt>教室</dt><dd>{{ selectedCourse.venue }}</dd><dt>班级</dt><dd>{{ demoClass.name }}</dd><dt>教师</dt><dd>{{ demoTeacher.name }}</dd></dl></template>
    <div v-if="selectedBooking?.status === 'pending' || selectedLeave?.status === 'pending'" class="teacher-review"><label>拒绝原因（拒绝时必填）<textarea v-model="reason" aria-label="拒绝原因" rows="3" placeholder="通过可直接确认；拒绝请说明理由" /></label><p v-if="error" class="error" role="alert">{{ error }}</p><div class="teacher-review-actions"><GlassButton class="primary" :disabled="busy" @click="review('approve')">{{ busy ? '处理中…' : '通过申请' }}</GlassButton><GlassButton :disabled="busy" @click="review('reject')">拒绝申请</GlassButton></div></div>
  </Drawer>
</template>
