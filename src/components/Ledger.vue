<script setup lang="ts">
// 展示层：价格台账
// 已发布冻结记录、版本链（旧值原样保留）、已更正版本查看与发起更正入口。
import { computed, ref } from "vue";
import { usePriceStore } from "../store/usePriceStore";
import { fenToYuan, formatDiff } from "../domain/money";
import { balanceLevel } from "../domain/tax";
import { FUELS, STATIONS } from "../domain/types";
import type { PriceAdjustment } from "../domain/types";

const store = usePriceStore();

const stationFilter = ref("");
const fuelFilter = ref("");
const showSuperseded = ref(true);
const expanded = ref<Set<string>>(new Set());

function levelOf(record: PriceAdjustment) {
  return balanceLevel(record.split.diffFen);
}

function formatDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : "—";
}

function toggle(docNo: string) {
  const next = new Set(expanded.value);
  if (next.has(docNo)) next.delete(docNo);
  else next.add(docNo);
  expanded.value = next;
}

function startCorrection(record: PriceAdjustment) {
  store.startCorrection(record);
  document.querySelector("#adjustment-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const rows = computed(() =>
  store.published.filter((record) => {
    if (stationFilter.value && record.station !== stationFilter.value) return false;
    if (fuelFilter.value && record.fuel !== fuelFilter.value) return false;
    return true;
  })
);

function oldVersions(record: PriceAdjustment): PriceAdjustment[] {
  return store.versionsOf(record.docNo).filter((item) => item.id !== record.id);
}
</script>

<template>
  <section class="panel">
    <div class="panel-head wrap">
      <h2>价格台账（已发布 · 冻结）</h2>
      <div class="filters">
        <select v-model="stationFilter">
          <option value="">全部站点</option>
          <option v-for="item in STATIONS" :key="item" :value="item">{{ item }}</option>
        </select>
        <select v-model="fuelFilter">
          <option value="">全部油品</option>
          <option v-for="item in FUELS" :key="item" :value="item">{{ item }}</option>
        </select>
        <label class="inline-check">
          <input v-model="showSuperseded" type="checkbox" />
          展开已更正旧版本
        </label>
      </div>
    </div>

    <div v-if="rows.length === 0" class="empty">暂无已发布调价单</div>

    <div v-else class="ledger-list">
      <article v-for="record in rows" :key="record.id" class="ledger-row">
        <header class="ledger-head">
          <div>
            <p class="ledger-title">
              {{ record.station }} · {{ record.fuel }}
              <span class="doc">{{ record.docNo }} v{{ record.version }}</span>
            </p>
            <p class="ledger-sub">
              生效 {{ record.effectiveDate }} · 税率 {{ (record.taxRate * 100).toFixed(0) }}%
              · 复核人 {{ record.reviewer || "—" }} · 冻结于 {{ formatDate(record.frozenAt) }}
            </p>
          </div>
          <span class="status-tag published">已冻结</span>
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

        <p v-if="record.basis" class="basis-box">
          <span>计税依据（冻结）：</span>{{ record.basis }}
        </p>

        <div class="card-actions">
          <button type="button" class="small" @click="startCorrection(record)">更正（另立版本）</button>
          <button
            v-if="store.versionsOf(record.docNo).length > 1"
            type="button"
            class="secondary small"
            @click="toggle(record.docNo)"
          >
            {{ expanded.has(record.docNo) ? "收起版本" : `查看旧版本（${oldVersions(record).length}）` }}
          </button>
        </div>

        <div v-if="showSuperseded && expanded.has(record.docNo)" class="version-list">
          <article
            v-for="old in oldVersions(record)"
            :key="old.id"
            class="version-row"
          >
            <header class="ledger-head">
              <div>
                <p class="ledger-title">
                  {{ old.station }} · {{ old.fuel }}
                  <span class="doc">{{ old.docNo }} v{{ old.version }}（旧值保留）</span>
                </p>
                <p class="ledger-sub">
                  生效 {{ old.effectiveDate }} · 税率 {{ (old.taxRate * 100).toFixed(0) }}%
                  · 原复核人 {{ old.reviewer || "—" }} · {{ formatDate(old.frozenAt) }} 冻结
                </p>
              </div>
              <span class="status-tag superseded">已更正</span>
            </header>
            <div class="amount-row">
              <div><span>含税售价</span><b>{{ fenToYuan(old.split.inclusiveFen) }}</b></div>
              <div><span>不含税价</span><b>{{ fenToYuan(old.split.netFen) }}</b></div>
              <div><span>税额</span><b>{{ fenToYuan(old.split.taxFen) }}</b></div>
              <div>
                <span>勾稽差额</span>
                <b :class="levelOf(old)">{{ formatDiff(old.split.diffFen) }} 元</b>
              </div>
            </div>
            <p v-if="old.basis" class="basis-box"><span>原计税依据：</span>{{ old.basis }}</p>
          </article>
        </div>
      </article>
    </div>
  </section>
</template>
