<script setup lang="ts">
// 受阻提示：站点、油品、差额、规则四要素必须齐备
import { formatDiff } from "../domain/money";
import type { RuleViolation } from "../domain/types";

defineProps<{
  violations: RuleViolation[];
  title?: string;
}>();
</script>

<template>
  <div v-if="violations.length" class="alert-stack">
    <p v-if="title" class="alert-title">{{ title }}</p>
    <div
      v-for="(item, index) in violations"
      :key="index"
      :class="['alert', item.severity === 'block' ? 'alert-block' : 'alert-info']"
    >
      <div class="alert-head">
        <span class="alert-badge">{{ item.severity === "block" ? "受阻" : "异常待复核" }}</span>
        <span class="alert-rule">{{ item.ruleCode }} · {{ item.ruleName }}</span>
      </div>
      <p class="alert-message">{{ item.message }}</p>
      <div class="alert-meta">
        <span>站点：<b>{{ item.station }}</b></span>
        <span>油品：<b>{{ item.fuel }}</b></span>
        <span>差额：<b>{{ formatDiff(item.diffFen) }}</b> 元（{{ item.diffFen }} 分）</span>
      </div>
    </div>
  </div>
</template>
