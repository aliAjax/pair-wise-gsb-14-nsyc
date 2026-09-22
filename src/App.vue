<script setup lang="ts">
// 油品价格维护 —— 含税倒推与税务复核台
// 分层：src/domain（规则）· src/storage（存储）· src/components（展示）
import { computed } from "vue";
import { usePriceStore } from "./store/usePriceStore";
import { RULES } from "./domain/rules";
import AdjustmentForm from "./components/AdjustmentForm.vue";
import ReviewDesk from "./components/ReviewDesk.vue";
import Ledger from "./components/Ledger.vue";

const store = usePriceStore();

const metricCards = computed(() => [
  { label: "待复核 · 三项相等", value: store.metrics.pendingNormal, tone: "normal" },
  { label: "待复核 · 差一分须依据", value: store.metrics.pendingAbnormal, tone: "abnormal" },
  { label: "超一分受阻", value: store.metrics.blocked, tone: "blocked" },
  { label: "已发布冻结", value: store.metrics.published, tone: "published" },
  { label: "调价单据（含版本）", value: `${store.metrics.versions} 单 / ${store.metrics.total} 条`, tone: "plain" }
]);
</script>

<template>
  <main class="app">
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">石油行业 · 前端最小闭环</p>
          <h1>油品含税倒推与税务复核台</h1>
          <p class="subtitle">
            调价单录入站点、油品、含税售价、税率与生效日，系统按分倒推不含税价和税额；
            三项金额必须相等，差额超过一分不得发布，差一分须财务填写依据并复核；
            复核通过后冻结税率、金额与依据，更正另立版本、旧值保留。
          </p>
        </div>
        <div class="stack">
          <span class="tag">Vue3</span>
          <span class="tag">TypeScript</span>
          <span class="tag">Pinia</span>
          <span class="tag">规则/存储/展示分层</span>
        </div>
      </header>

      <section v-if="store.integrityIssues.length" class="integrity-banner">
        <strong>刷新一致性核对发现 {{ store.integrityIssues.length }} 项异常：</strong>
        <ul>
          <li v-for="(issue, index) in store.integrityIssues" :key="index">
            {{ issue.record.docNo }} v{{ issue.record.version }}（{{ issue.record.station }} /
            {{ issue.record.fuel }} / {{ issue.record.effectiveDate }}）：{{ issue.reason }}
          </li>
        </ul>
      </section>

      <section class="metrics">
        <article v-for="card in metricCards" :key="card.label" :class="['metric', card.tone]">
          <span>{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
        </article>
      </section>

      <section class="rules-bar">
        <div v-for="rule in RULES" :key="rule.code" class="rule-chip" :title="rule.description">
          <b>{{ rule.code }}</b>
          <span>{{ rule.name }}</span>
        </div>
      </section>

      <section class="workspace">
        <div id="adjustment-form" class="form-col">
          <AdjustmentForm />
        </div>
        <div class="main-col">
          <ReviewDesk />
          <Ledger />
        </div>
      </section>
    </div>
  </main>
</template>
