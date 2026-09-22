<script setup lang="ts">
// 税务复核受阻台：显示站点、油品、生效日、差额与命中的规则
import { computed } from "vue";
import { usePriceStore } from "../store/priceStore";
import { formatFen } from "../rules/tax";
import { RULE_TABLE } from "../rules/validation";
import type { BlockedAttempt } from "../store/types";

const store = usePriceStore();

const ACTION_TEXT: Record<BlockedAttempt["action"], string> = {
  submit: "发布调价单",
  approve: "复核通过",
  saveBasis: "保存依据"
};

const rows = computed(() => store.blocked);

function ruleName(code: string): string {
  return RULE_TABLE[code as keyof typeof RULE_TABLE]?.name ?? code;
}

function timeText(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("zh-CN")} ${d.toLocaleTimeString("zh-CN", { hour12: false })}`;
}
</script>

<template>
  <section class="blocked-panel">
    <div class="toolbar">
      <h2>税务复核受阻台</h2>
      <button class="secondary" type="button" :disabled="rows.length === 0" @click="store.clearBlocked()">
        清空记录
      </button>
    </div>
    <div v-if="rows.length === 0" class="empty">暂无被规则拦截的操作</div>
    <article v-for="item in rows" :key="item.id" class="blocked-item">
      <div class="blocked-head">
        <span class="blocked-action">{{ ACTION_TEXT[item.action] }}被拦截</span>
        <span class="blocked-time">{{ timeText(item.at) }}</span>
      </div>
      <div class="blocked-grid">
        <div><span>站点</span><strong>{{ item.station || "—" }}</strong></div>
        <div><span>油品</span><strong>{{ item.fuel || "—" }}</strong></div>
        <div><span>生效日</span><strong>{{ item.effectiveDate || "—" }}</strong></div>
        <div>
          <span>税额差额</span>
          <strong :class="Math.abs(item.diffFen) > 1 ? 'danger' : Math.abs(item.diffFen) === 1 ? 'warn' : ''">
            {{ item.grossFen ? `${item.diffFen} 分（${formatFen(item.diffFen)} 元）` : "—" }}
          </strong>
        </div>
      </div>
      <div v-if="item.grossFen" class="blocked-amounts">
        含税 {{ formatFen(item.grossFen) }} 元 ＝ 不含税 {{ formatFen(item.netFen) }} 元 ＋ 税额
        {{ formatFen(item.taxFen) }} 元
      </div>
      <div class="blocked-rules">
        <span v-for="code in item.ruleCodes" :key="code" class="rule-chip">
          {{ code }} · {{ ruleName(code) }}
        </span>
      </div>
      <ul class="blocked-messages">
        <li v-for="(msg, i) in item.messages" :key="i">{{ msg }}</li>
      </ul>
    </article>
  </section>
</template>
