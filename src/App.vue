<script setup lang="ts">
// 含税倒推与税务复核台 —— 展示层：组装表单、单据列表、受阻台、规则表
import { computed, ref } from "vue";
import { splitOf, usePriceStore, type ActionResult } from "./store/priceStore";
import { currentVersion } from "./store/types";
import { FUELS, STATIONS } from "./rules/constants";
import { STATUS_TEXT, type VersionStatus } from "./rules/validation";
import type { PriceDocument } from "./store/types";
import PriceForm from "./components/PriceForm.vue";
import DocumentCard from "./components/DocumentCard.vue";
import BlockedList from "./components/BlockedList.vue";
import RulesPanel from "./components/RulesPanel.vue";

const store = usePriceStore();

const stationFilter = ref("");
const fuelFilter = ref("");
const statusFilter = ref<"" | VersionStatus>("");
const editingId = ref<string | null>(null);
const toast = ref<{ ok: boolean; text: string } | null>(null);

const editingDoc = computed(() =>
  editingId.value ? store.documents.find((d) => d.id === editingId.value) ?? null : null
);

const filtered = computed(() =>
  store.orderedDocuments.filter((doc) => {
    const v = currentVersion(doc);
    if (stationFilter.value && doc.station !== stationFilter.value) return false;
    if (fuelFilter.value && doc.fuel !== fuelFilter.value) return false;
    if (statusFilter.value && v.status !== statusFilter.value) return false;
    return true;
  })
);

const statusOptions = Object.entries(STATUS_TEXT) as [VersionStatus, string][];

function showResult(r: ActionResult) {
  if (r.ok) {
    toast.value = { ok: true, text: "操作成功，数据已持久化。" };
    editingId.value = null;
  } else {
    toast.value = {
      ok: false,
      text: `被 ${r.violations.map((v) => v.rule).join("、")} 拦截，详见受阻台。`
    };
  }
  window.setTimeout(() => (toast.value = null), 3500);
}

function startEdit(doc: PriceDocument) {
  editingId.value = doc.id;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const chartRows = computed(() =>
  statusOptions.map(([status, text]) => ({
    status,
    text,
    value: store.documents.filter((d) => currentVersion(d).status === status).length
  }))
);
const maxChart = computed(() => Math.max(1, ...chartRows.value.map((r) => r.value)));

// 金额拆分一致性校验（刷新后仍可证明存储金额自洽）
const consistency = computed(() => {
  let bad = 0;
  for (const doc of store.documents) {
    for (const v of doc.versions) {
      const s = splitOf(v);
      if (v.grossFen - v.netFen - v.taxFen !== 0 || !s.balanced) bad += 1;
    }
  }
  return { total: store.frozenVersionCount, bad };
});
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 含税倒推与税务复核台</p>
          <h1>油品价格维护</h1>
          <p class="subtitle">
            调价单填写站点、油品、含税售价、税率和生效日，自动倒推不含税价与税额；
            按分后三项金额必须相等，差额超过一分不得发布；同站同油品同生效日唯一；
            税额异常须财务写依据并复核，通过后冻结税率、金额和依据，更正另立版本留旧值。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">Pinia</span>
          <span class="tag">规则/存储/展示分离</span>
          <button type="button" class="secondary reset-btn" @click="store.resetAll()">恢复演示数据</button>
        </div>
      </header>

      <transition name="toast">
        <div v-if="toast" class="toast" :class="toast.ok ? 'ok' : 'fail'">
          {{ toast.text }}
        </div>
      </transition>

      <section class="metrics">
        <article class="metric">
          <span>调价单（同键唯一）</span><strong>{{ store.documents.length }}</strong>
        </article>
        <article class="metric">
          <span>待财务复核</span><strong>{{ store.pendingCount }}</strong>
        </article>
        <article class="metric">
          <span>已发布（冻结）</span><strong>{{ store.approvedCount }}</strong>
        </article>
        <article class="metric">
          <span>冻结版本数（含旧版）</span><strong>{{ store.frozenVersionCount }}</strong>
        </article>
      </section>

      <p class="consistency" :class="consistency.bad ? 'danger' : 'ok'">
        刷新一致性自检：{{ store.frozenVersionCount ? `全部 ${consistency.total} 个版本` : "暂无版本" }}
        金额拆分 {{ consistency.bad ? `有 ${consistency.bad} 个不自洽` : "恒等一致（含税＝不含税＋税额，分）" }}
      </p>

      <section class="workspace">
        <div class="left-col">
          <PriceForm :editing="editingDoc" @done="showResult" @cancel-edit="editingId = null" />
          <RulesPanel />
        </div>

        <section class="list-panel">
          <div class="toolbar list-toolbar">
            <h2>调价单复核台</h2>
            <div class="filters">
              <select v-model="stationFilter">
                <option value="">全部站点</option>
                <option v-for="s in STATIONS" :key="s" :value="s">{{ s }}</option>
              </select>
              <select v-model="fuelFilter">
                <option value="">全部油品</option>
                <option v-for="f in FUELS" :key="f" :value="f">{{ f }}</option>
              </select>
              <select v-model="statusFilter">
                <option value="">全部状态</option>
                <option v-for="[value, text] in statusOptions" :key="value" :value="value">{{ text }}</option>
              </select>
            </div>
          </div>

          <div class="doc-grid">
            <div v-if="filtered.length === 0" class="empty">暂无匹配调价单</div>
            <DocumentCard
              v-for="doc in filtered"
              :key="doc.id"
              :doc="doc"
              @edit="startEdit"
              @result="showResult"
            />
          </div>

          <div class="mini-chart">
            <div v-for="row in chartRows" :key="row.status" class="bar">
              <span>{{ row.text }}</span>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${(row.value / maxChart) * 100}%` }" />
              </div>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </section>
      </section>

      <BlockedList />
    </div>
  </main>
</template>
