<script setup lang="ts">
// 版本链展示：更正另立版本、旧值完整保留
import { computed } from "vue";
import type { PriceDocument, PriceVersion } from "../store/types";
import { STATUS_TEXT } from "../rules/validation";
import { formatFen, TAX_ISSUE_TEXT } from "../rules/tax";

const props = defineProps<{ doc: PriceDocument }>();

const versions = computed(() => [...props.doc.versions].reverse());

function timeText(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

function createdText(v: PriceVersion): string {
  return timeText(v.createdAt);
}
</script>

<template>
  <div class="version-chain">
    <p class="chain-title">版本记录（共 {{ doc.versions.length }} 个版本，旧值留档不可改）</p>
    <div v-for="v in versions" :key="v.id" class="version-row" :class="`st-${v.status}`">
      <div class="version-main">
        <span class="version-no">v{{ v.versionNo }}</span>
        <span class="version-status">{{ STATUS_TEXT[v.status] }}</span>
        <span class="version-rate">税率 {{ v.ratePercent }}%</span>
        <span v-if="v.taxAdjusted" class="version-rate">税额经财务调整</span>
      </div>
      <div class="version-amounts">
        含税 <strong>{{ formatFen(v.grossFen) }}</strong> ｜ 不含税
        <strong>{{ formatFen(v.netFen) }}</strong> ｜ 税额 <strong>{{ formatFen(v.taxFen) }}</strong>
        <em :class="Math.abs(v.diffFen) > 1 ? 'danger' : Math.abs(v.diffFen) === 1 ? 'warn' : ''">
          差额 {{ v.diffFen }} 分
        </em>
      </div>
      <div v-if="v.abnormal" class="version-basis">
        <span v-for="code in v.abnormalCodes" :key="code" class="abn-tag">
          {{ TAX_ISSUE_TEXT[code as keyof typeof TAX_ISSUE_TEXT] ?? code }}
        </span>
        <p v-if="v.basis">财务依据：{{ v.basis }}</p>
        <p v-else class="warn">尚未填写财务依据</p>
      </div>
      <div v-if="v.reviewer" class="version-review">
        复核人：{{ v.reviewer }}<span v-if="v.reviewNote">；意见：{{ v.reviewNote }}</span>
        （{{ timeText(v.reviewedAt) }}）
      </div>
      <div class="version-meta">
        制单：{{ v.operator || "—" }} ｜ 制单时间 {{ createdText(v) }} ｜ 提交 {{ timeText(v.submittedAt) }}
      </div>
    </div>
  </div>
</template>
