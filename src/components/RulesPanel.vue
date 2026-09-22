<script setup lang="ts">
// 规则表（展示层只读引用规则层，保证规则只有一处定义）
import { ref } from "vue";
import { RULE_TABLE, type RuleCode } from "../rules/validation";

const open = ref(false);
const codes = Object.keys(RULE_TABLE) as RuleCode[];
</script>

<template>
  <section class="rules-panel">
    <button type="button" class="link-btn" @click="open = !open">
      {{ open ? "收起规则表" : "查看发布与复核规则（8 条）" }}
    </button>
    <table v-if="open" class="rules-table">
      <thead>
        <tr><th>编码</th><th>规则</th><th>说明</th></tr>
      </thead>
      <tbody>
        <tr v-for="code in codes" :key="code">
          <td class="rule-code">{{ code }}</td>
          <td>{{ RULE_TABLE[code].name }}</td>
          <td class="rule-detail">{{ RULE_TABLE[code].detail }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
