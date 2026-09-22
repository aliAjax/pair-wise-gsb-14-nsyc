<script setup lang="ts">
// 调价单卡片：金额拆分 + 税务复核台 + 版本链
// 已发布版本税率/金额/依据冻结，更正另立版本；更正表单复用规则校验
import { computed, reactive, ref } from "vue";
import type { PriceDocument } from "../store/types";
import type { ActionResult } from "../store/priceStore";
import { splitOf, usePriceStore } from "../store/priceStore";
import { STATUS_TEXT } from "../rules/validation";
import { TAX_RATES } from "../rules/constants";
import { TAX_ISSUE_TEXT, applyTaxAdjustment, formatFen, reverseSplit } from "../rules/tax";
import AmountSplitCard from "./AmountSplitCard.vue";
import VersionHistory from "./VersionHistory.vue";

const props = defineProps<{ doc: PriceDocument }>();
const emit = defineEmits<{ (e: "edit", doc: PriceDocument): void; (e: "result", r: ActionResult): void }>();

const store = usePriceStore();
const version = computed(() => props.doc.versions[props.doc.versions.length - 1]);
const split = computed(() => splitOf(version.value));
const frozen = computed(() => version.value.status === "approved");
const pending = computed(() => version.value.status === "pending");
const editable = computed(() => version.value.status === "draft" || version.value.status === "rejected");

const basisDraft = ref(version.value.basis);
const reviewer = ref("");
const reviewNote = ref("");
const adjustInput = ref(String(split.value.taxFen));
const showHistory = ref(false);
const showCorrect = ref(false);

const correction = reactive({
  priceText: (version.value.grossFen / 100).toFixed(2),
  ratePercent: version.value.ratePercent as number,
  operator: ""
});

const correctionSplit = computed(() =>
  store.previewSplit(correction.priceText, correction.ratePercent)
);

const adjustPreview = computed(() => {
  const fen = Number(adjustInput.value);
  if (!Number.isInteger(fen)) return null;
  return applyTaxAdjustment(reverseSplit(version.value.grossFen, version.value.ratePercent), fen);
});

const basisDirty = computed(() => basisDraft.value.trim() !== version.value.basis.trim());

function saveBasis() {
  const r = store.saveBasis(props.doc.id, basisDraft.value);
  emit("result", r);
}

function doAdjust() {
  const fen = Number(adjustInput.value);
  if (!Number.isInteger(fen)) return;
  const r = store.adjustTax(props.doc.id, fen);
  if (r.ok) adjustInput.value = String(split.value.taxFen);
  emit("result", r);
}

function approve() {
  const r = store.approve(props.doc.id, reviewer.value, reviewNote.value);
  emit("result", r);
  if (r.ok) {
    reviewer.value = "";
    reviewNote.value = "";
  }
}

function reject() {
  const r = store.reject(props.doc.id, reviewer.value, reviewNote.value);
  emit("result", r);
}

function submitCorrect() {
  const r = store.correct(props.doc.id, {
    station: props.doc.station,
    fuel: props.doc.fuel,
    priceText: correction.priceText,
    ratePercent: correction.ratePercent,
    effectiveDate: props.doc.effectiveDate,
    operator: correction.operator
  });
  emit("result", r);
  if (r.ok) showCorrect.value = false;
}
</script>

<template>
  <article class="doc-card" :class="{ frozen: frozen }">
    <header class="doc-head">
      <div>
        <p class="doc-title">{{ doc.station }} · {{ doc.fuel }}</p>
        <p class="doc-sub">
          生效日 {{ doc.effectiveDate }} ｜ v{{ version.versionNo }} ｜ 制单 {{ version.operator || "—" }}
        </p>
      </div>
      <span class="status-badge" :class="`st-${version.status}`">{{ STATUS_TEXT[version.status] }}</span>
    </header>

    <AmountSplitCard :split="split" :rate-percent="version.ratePercent" :frozen="frozen" />

    <!-- 异常依据区 -->
    <div v-if="version.abnormal" class="basis-box" :class="{ frozen }">
      <div class="basis-head">
        <span class="abn-title">税额异常 · 财务复核</span>
        <span v-for="code in version.abnormalCodes" :key="code" class="abn-tag">
          {{ TAX_ISSUE_TEXT[code as keyof typeof TAX_ISSUE_TEXT] ?? code }}
        </span>
      </div>
      <template v-if="pending">
        <textarea
          v-model="basisDraft"
          placeholder="由财务填写处理依据（文号/备案说明），未填写不得复核"
        />
        <div class="row-actions">
          <button type="button" class="secondary" :disabled="!basisDirty" @click="saveBasis">保存依据</button>
        </div>
      </template>
      <div v-else class="basis-readonly">
        <p><span>财务依据：</span>{{ version.basis || "（无）" }}</p>
      </div>
    </div>

    <!-- 一分内税额调整（仅待复核） -->
    <div v-if="pending" class="adjust-box">
      <label>
        税额调整（分，允许一分内修正）
        <input v-model="adjustInput" inputmode="numeric" />
      </label>
      <p v-if="adjustPreview" class="adjust-preview" :class="Math.abs(adjustPreview.diffFen) > 1 ? 'danger' : ''">
        调整后：不含税 {{ formatFen(adjustPreview.netFen) }} 元，税额 {{ formatFen(adjustPreview.taxFen) }}
        元，差额 {{ adjustPreview.diffFen }} 分
        <template v-if="Math.abs(adjustPreview.diffFen) > 1">——超过一分，禁止应用</template>
      </p>
      <div class="row-actions">
        <button type="button" class="secondary" @click="doAdjust">应用税额调整</button>
      </div>
    </div>

    <!-- 复核操作（待复核） -->
    <div v-if="pending" class="review-box">
      <div class="review-inputs">
        <label>
          复核人（财务）
          <input v-model="reviewer" placeholder="财务复核人姓名" />
        </label>
        <label>
          复核意见
          <input v-model="reviewNote" placeholder="通过/驳回意见" />
        </label>
      </div>
      <div class="row-actions">
        <button type="button" :disabled="version.abnormal && !version.basis.trim()" @click="approve">
          复核通过并冻结
        </button>
        <button type="button" class="danger" @click="reject">驳回</button>
      </div>
      <p v-if="version.abnormal && !version.basis.trim()" class="warn">
        异常单须先保存财务依据（规则 R6）才可复核通过。
      </p>
    </div>

    <!-- 冻结后的更正入口 -->
    <div v-if="frozen" class="frozen-box">
      <p>税率、金额与依据已冻结（规则 R8）。更正将另立新版本，本版旧值完整保留。</p>
      <button type="button" class="secondary" @click="showCorrect = !showCorrect">
        {{ showCorrect ? "收起更正" : "发起更正（另立版本）" }}
      </button>
      <div v-if="showCorrect" class="correct-form">
        <p class="correct-key">
          沿用键：{{ doc.station }} / {{ doc.fuel }} / {{ doc.effectiveDate }}
          （同键唯一，旧版转为"已更正"）
        </p>
        <label>
          新含税售价（元/升）
          <input v-model="correction.priceText" inputmode="decimal" />
        </label>
        <label>
          新税率
          <select v-model.number="correction.ratePercent">
            <option v-for="r in TAX_RATES" :key="r" :value="r">{{ r }}%</option>
          </select>
        </label>
        <AmountSplitCard :split="correctionSplit" :rate-percent="correction.ratePercent" />
        <label>
          更正制单人
          <input v-model="correction.operator" placeholder="本次更正的制单人" />
        </label>
        <div class="row-actions">
          <button type="button" @click="submitCorrect">提交新版本复核</button>
        </div>
      </div>
    </div>

    <!-- 草稿/驳回操作 -->
    <div v-if="editable" class="row-actions editable-actions">
      <button type="button" class="secondary" @click="emit('edit', doc)">修改并提交</button>
      <button type="button" class="danger" @click="store.discard(doc.id)">放弃</button>
      <span v-if="version.status === 'rejected'" class="warn">已驳回：{{ version.reviewNote }}</span>
    </div>

    <button type="button" class="link-btn history-toggle" @click="showHistory = !showHistory">
      {{ showHistory ? "收起版本记录" : `查看版本记录（${doc.versions.length}）` }}
    </button>
    <VersionHistory v-if="showHistory" :doc="doc" />
  </article>
</template>
