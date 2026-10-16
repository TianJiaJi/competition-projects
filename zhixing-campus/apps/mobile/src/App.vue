<script lang="ts">
import { watchDemoReset } from "@scene/bookings";
export default {
  onLaunch() {
    // #ifdef H5
    watchDemoReset(() => {
      uni.removeStorageSync("zhixing:student-session");
      window.location.reload();
    }, import.meta.env.VITE_BOOKING_API_URL);
    // #endif
  },
};
</script>
<style>
@import "./style.css";
@import "./ui-refinements.css";
@import "./leave-form.css";
@import "./approval-messages.css";
</style>
