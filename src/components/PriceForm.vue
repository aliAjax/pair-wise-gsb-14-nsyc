<script setup lang="ts">
// 调价单录入：站点、油品、含税售价、税率、生效日；金额实时倒推；提交走规则校验
import { computed, reactive, watch } from "vue";
import { FUELS, STATIONS, TAX_RATES } from "../rules/constants";
import { usePriceStore, type ActionResult } from "../store/priceStore";
import type { DraftInput } from "../rules/validation";
import AmountSplitCard from "./AmountSplitCard.vue";
import type { PriceDocument } from "../store/types";

const props = defineProps<{ editing?: PriceDocument | null }>();
const emit = defineEmits<{
  (e: "done", result: ActionResult): void;
  (e: "cancelEdit"): void;
}>();

const store = usePriceStore();

const form = reactive({
  station: "",
  fuel: "",
  priceText: "",
  ratePercent: 13 as number | null,
  effectiveDate: new Date().toISOString().slice(0, 10),
  operator: ""
});

watch(
  () => props.editing,
  (doc) => {
    if (!doc) return;
    const v = doc.versions[doc.versions.length - 1];
    form.station = doc.station;
    form.fuel = doc.fuel;
    form.priceText = (v.grossFen / 100).toFixed(2);
    form.ratePercent = v.ratePercent;
    form.effectiveDate = doc.effectiveDate;
    form.operator = v.operator;
  },
  { immediate: true }
);

const draftInput = computed<DraftInput>(() => ({ ...form }));
const split = computed(() => store.previewSplit(form.priceText, form.ratePercent));
const duplicate = computed(() =>
  form.station && form.fuel && form.effectiveDate
    ? store.findDuplicate(form.station, form.fuel, form.effectiveDate, props.editing?.id)
    : undefined
);

function submit() {
  const result = props.editing
    ? store.resubmit(props.editing.id, draftInput.value)
    : store.submitDraft(draftInput.value);
  if (result.ok) reset();
  emit("done", result);
}

function saveDraft() {
  const result = store.saveDraft(draftInput.value);
  if (result.ok) reset();
  emit("done", result);
}

function reset() {
  form.station = "";
  form.fuel = "";
  form.priceText = "";
  form.ratePercent = 13;
  form.effectiveDate = new Date().toISOString().slice(0, 10);
  form.operator = "";
  emit("cancelEdit");
}
</script>

<template>
  <form class="panel form-panel" @submit.prevent="submit">
    <div class="panel-head">
      <h2>{{ editing ? `修改调价单（#${editing.versions[editing.versions.length - 1].versionNo} 版）` : "新建调价单" }}</h2>
      <button v-if="editing" type="button" class="link-btn" @click="reset()">取消修改</button>
    </div>
    <div class="form-grid">
      <label>
        站点 <i>*</i>
        <select v-model="form.station" required>
          <option value="">请选择站点</option>
          <option v-for="s in STATIONS" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
      <label>
        油品 <i>*</i>
        <select v-model="form.fuel" required>
          <option value="">请选择油品</option>
          <option v-for="f in FUELS" :key="f" :value="f">{{ f }}</option>
        </select>
      </label>
      <label>
        含税售价（元/升，按分） <i>*</i>
        <input
          v-model="form.priceText"
          inputmode="decimal"
          placeholder="如 7.62，最多两位小数"
          required
        />
      </label>
      <label>
        税率 <i>*</i>
        <select v-model.number="form.ratePercent" required>
          <option v-for="r in TAX_RATES" :key="r" :value="r">{{ r }}%（成品油{{ r === 13 ? "标准税率" : "非标准" }}）</option>
        </select>
      </label>
      <label>
        生效日 <i>*</i>
        <input v-model="form.effectiveDate" type="date" required />
      </label>
      <label>
        操作员
        <input v-model="form.operator" placeholder="制单人姓名" />
      </label>
    </div>

    <AmountSplitCard :split="split" :rate-percent="form.ratePercent" />

    <p v-if="duplicate" class="dup-warn">
      ⚠ {{ duplicate.station }} / {{ duplicate.fuel }} / {{ duplicate.effectiveDate }}
      已存在一条有效调价单（规则 R4：同键唯一），如需变更请对原单发起"更正"。
    </p>

    <div class="form-actions">
      <button type="submit">提交复核</button>
      <button type="button" class="secondary" @click="saveDraft">暂存草稿</button>
    </div>
  </form>
</template>
