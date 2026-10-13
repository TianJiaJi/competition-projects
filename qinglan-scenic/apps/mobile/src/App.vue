<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import {startScenicConnection} from "./services/scenic-state";
onLaunch(startScenicConnection);
</script>
<style>
@import "./styles/theme.css";
@import "./styles/contour.css";
</style>
