<script setup lang="ts">
// 展示层：调价单录入
// 站点、油品、含税售价、税率、生效日；实时倒推拆分并展示受阻原因。
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { usePriceStore } from "../store/usePriceStore";
import { fenToYuan, formatDiff, hasSubFenPrecision } from "../domain/money";
import { balanceLevel } from "../domain/tax";
import { FUELS, STATIONS, TAX_RATES } from "../domain/types";
import RuleAlerts from "./RuleAlerts.vue";
import type { RuleViolation } from "../domain/types";

const store = usePriceStore();
const { draft, correctingDocNo } = storeToRefs(store);

const preview = computed(() => store.preview());
const level = computed(() =>
  preview.value.split ? balanceLevel(preview.value.split.diffFen) : null
);

const submitErrors = ref<RuleViolation[]>([]);
const justSaved = ref(false);

const blocked = computed(() => preview.value.violations.filter((item) => item.severity === "block"));
const abnormal = computed(() => preview.value.violations.filter((item) => item.severity === "info"));

function submit() {
  submitErrors.value = [];
  justSaved.value = false;
  const result = store.submitDraft();
  if (!result.ok) {
    submitErrors.value = result.violations;
    return;
  }
  justSaved.value = true;
}

function cancelCorrection() {
  store.resetDraft();
  submitErrors.value = [];
  justSaved.value = false;
}
</script>

<template>
  <form class="panel" @submit.prevent="submit">
    <div class="panel-head">
      <h2>{{ correctingDocNo ? `更正调价单 ${correctingDocNo}` : "新建调价单" }}</h2>
      <button v-if="correctingDocNo" type="button" class="secondary small" @click="cancelCorrection">
        取消更正
      </button>
    </div>

    <RuleAlerts v-if="submitErrors.length" :violations="submitErrors" title="发布受阻，记录未生成" />
    <p v-else-if="justSaved" class="ok-line">
      调价单已提交税务复核台{{ correctingDocNo ? "（新版本已生成，旧值保留）" : "" }}。
    </p>

    <div class="form-grid">
      <label>
        站点
        <select v-model="draft.station" :disabled="!!correctingDocNo" required>
          <option value="">请选择站点</option>
          <option v-for="item in STATIONS" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label>
        油品
        <select v-model="draft.fuel" :disabled="!!correctingDocNo" required>
          <option value="">请选择油品</option>
          <option v-for="item in FUELS" :key="item" :value="item">{{ item }}</option>
        </select>
      </label>
      <label>
        含税售价（元）
        <input
          v-model="draft.grossInclusive"
          type="number"
          min="0"
          step="0.0001"
          inputmode="decimal"
          placeholder="如 7.62"
          required
        />
      </label>
      <label>
        税率
        <select v-model="draft.taxRate" required>
          <option v-for="rate in TAX_RATES" :key="rate" :value="rate">
            {{ (rate * 100).toFixed(0) }}%
          </option>
        </select>
      </label>
      <label>
        生效日期
        <input
          v-model="draft.effectiveDate"
          type="date"
          :disabled="!!correctingDocNo"
          required
        />
      </label>
    </div>

    <div v-if="preview.split" class="split-preview" :class="level ?? ''">
      <div class="split-head">
        <span>含税倒推（按分四舍五入）</span>
        <span :class="['level-tag', level]">
          {{ level === "balanced" ? "三项相等" : level === "abnormal" ? "差一分 · 须依据复核" : "超一分 · 不得发布" }}
        </span>
      </div>
      <div class="split-grid">
        <div><span>含税售价</span><b>{{ fenToYuan(preview.split.inclusiveFen) }}</b></div>
        <div><span>不含税价</span><b>{{ fenToYuan(preview.split.netFen) }}</b></div>
        <div><span>税额</span><b>{{ fenToYuan(preview.split.taxFen) }}</b></div>
        <div>
          <span>差额（含税−不含税−税额）</span>
          <b :class="level">{{ formatDiff(preview.split.diffFen) }} 元</b>
        </div>
      </div>
      <p v-if="preview.split && hasSubFenPrecision(preview.split.grossInclusive)" class="split-note">
        原始输入 {{ draft.grossInclusive }} 元不足分位，按分后含税售价为
        {{ fenToYuan(preview.split.inclusiveFen) }} 元，勾稽以按分后金额为准。
      </p>
    </div>

    <RuleAlerts :violations="[...blocked, ...abnormal]" />

    <button type="submit" class="primary-btn" :disabled="blocked.length > 0">
      {{ blocked.length > 0 ? "差额超限 / 要素受阻，不可提交" : "提交至税务复核台" }}
    </button>
  </form>
</template>
