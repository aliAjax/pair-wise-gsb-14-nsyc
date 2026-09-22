<script setup lang="ts">
// 展示层：税务复核台
// 待复核单据在此由财务填写计税依据、复核人；通过即冻结，受阻原因逐条展示。
import { ref } from "vue";
import { usePriceStore } from "../store/usePriceStore";
import { fenToYuan, formatDiff, hasSubFenPrecision } from "../domain/money";
import { balanceLevel } from "../domain/tax";
import RuleAlerts from "./RuleAlerts.vue";
import type { PriceAdjustment, RuleViolation } from "../domain/types";

const store = usePriceStore();

const basisMap = ref<Record<string, string>>({});
const reviewerMap = ref<Record<string, string>>({});
const errorMap = ref<Record<string, RuleViolation[]>>({});
const approvedId = ref<string | null>(null);

function levelOf(record: PriceAdjustment) {
  return balanceLevel(record.split.diffFen);
}

function basisFor(record: PriceAdjustment): string {
  return basisMap.value[record.id] ?? record.basis ?? "";
}

function approve(record: PriceAdjustment) {
  const id = record.id;
  const basis = basisFor(record);
  const reviewer = reviewerMap.value[id] ?? "";
  const result = store.approve(id, basis, reviewer);
  if (result.ok) {
    approvedId.value = id;
    errorMap.value[id] = [];
  } else {
    errorMap.value[id] = result.violations;
  }
}

function discard(record: PriceAdjustment) {
  if (window.confirm(`确认放弃待复核单据 ${record.docNo}（v${record.version}）？该操作不可恢复。`)) {
    store.discardPending(record.id);
  }
}
</script>

<template>
  <section class="panel review-panel">
    <div class="panel-head">
      <h2>税务复核台</h2>
      <span class="hint">通过后冻结税率、金额与计税依据；更正须另立版本。</span>
    </div>

    <div v-if="store.pending.length === 0" class="empty">暂无待复核调价单</div>

    <div v-else class="review-grid">
      <article
        v-for="record in store.pending"
        :key="record.id"
        :class="['review-card', levelOf(record)]"
      >
        <header class="review-head">
          <div>
            <p class="review-title">{{ record.station }} · {{ record.fuel }}</p>
            <p class="review-sub">
              {{ record.docNo }} <b>v{{ record.version }}</b> · 生效 {{ record.effectiveDate }}
              · 税率 {{ (record.taxRate * 100).toFixed(0) }}%
              <span v-if="record.source === 'import'" class="source-tag">历史导入</span>
            </p>
          </div>
          <span :class="['status-tag', levelOf(record)]">
            {{ levelOf(record) === "balanced"
              ? "三项相等"
              : levelOf(record) === "abnormal"
                ? "差一分 · 须依据"
                : "超一分 · 禁止发布" }}
          </span>
        </header>

        <div class="amount-row">
          <div><span>含税售价</span><b>{{ fenToYuan(record.split.inclusiveFen) }}</b></div>
          <div><span>不含税价</span><b>{{ fenToYuan(record.split.netFen) }}</b></div>
          <div><span>税额</span><b>{{ fenToYuan(record.split.taxFen) }}</b></div>
          <div>
            <span>勾稽差额</span>
            <b :class="levelOf(record)">{{ formatDiff(record.split.diffFen) }} 元</b>
          </div>
        </div>

        <div v-if="hasSubFenPrecision(record.split.grossInclusive)" class="import-note">
          原始含税输入 {{ record.split.grossInclusive }} 元。
        </div>

        <label class="basis-field">
          财务计税依据
          <span v-if="levelOf(record) === 'abnormal'" class="required-mark">（差一分，必填）</span>
          <textarea
            :value="basisFor(record)"
            @input="basisMap[record.id] = ($event.target as HTMLTextAreaElement).value"
            placeholder="说明差额成因、政策文号或计算口径，作为冻结依据"
          />
        </label>
        <label class="reviewer-field">
          财务复核人
          <input
            v-model="reviewerMap[record.id]"
            placeholder="复核人姓名"
          />
        </label>

        <RuleAlerts
          v-if="errorMap[record.id]?.length"
          :violations="errorMap[record.id]"
          title="复核受阻"
        />
        <p v-else-if="approvedId === record.id && record.status === 'published'" class="ok-line">
          已复核通过，税率、金额与依据已冻结。
        </p>

        <div class="card-actions">
          <button
            type="button"
            class="small"
            :disabled="levelOf(record) === 'blocked'"
            @click="approve(record)"
          >
            复核通过并冻结
          </button>
          <button
            type="button"
            class="secondary small"
            @click="store.saveBasis(record.id, basisFor(record))"
          >
            暂存依据
          </button>
          <button type="button" class="danger small" @click="discard(record)">放弃单据</button>
        </div>
      </article>
    </div>
  </section>
</template>
