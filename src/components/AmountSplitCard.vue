<script setup lang="ts">
// 金额拆分展示（纯展示）：含税价倒推不含税价与税额，并显示一分差额校验
import { computed } from "vue";
import { formatFen, type AmountSplit } from "../rules/tax";
import { TOLERANCE_FEN } from "../rules/constants";

const props = defineProps<{
  split: AmountSplit | null;
  ratePercent: number | null;
  frozen?: boolean;
}>();

const diffClass = computed(() => {
  const s = props.split;
  if (!s) return "";
  if (Math.abs(s.diffFen) > TOLERANCE_FEN || !s.balanced) return "diff-danger";
  if (Math.abs(s.diffFen) === TOLERANCE_FEN) return "diff-warn";
  return "diff-ok";
});

const diffText = computed(() => {
  const s = props.split;
  if (!s) return "填写含税售价与税率后实时倒推";
  if (Math.abs(s.diffFen) > TOLERANCE_FEN) return `差额 ${formatFen(s.diffFen)} 元（${s.diffFen} 分），超过一分，禁止发布`;
  if (Math.abs(s.diffFen) === TOLERANCE_FEN) return `差额 ${s.diffFen} 分（一分内），异常须财务写依据并复核`;
  return "差额 0 分：按分后含税价 = 不含税价 + 税额";
});
</script>

<template>
  <div class="split-card" :class="{ frozen }">
    <div class="split-head">
      <span>金额拆分（含税倒推）</span>
      <span v-if="frozen" class="lock">已冻结</span>
    </div>
    <div v-if="!split" class="split-empty">
      <p>含税售价与税率填写后自动倒推：</p>
      <ul>
        <li>不含税价 = 含税价 ÷ (1 + 税率)，按分四舍五入</li>
        <li>税额 = 含税价 − 不含税价（倒推，保证分后恒等）</li>
        <li>另以正算税额交叉校验，差额超过一分不得发布</li>
      </ul>
    </div>
    <table v-else class="split-table">
      <tbody>
        <tr>
          <th>含税售价</th>
          <td class="money gross">{{ formatFen(split.grossFen) }} 元</td>
        </tr>
        <tr>
          <th>不含税价（倒推）</th>
          <td class="money">{{ formatFen(split.netFen) }} 元</td>
        </tr>
        <tr>
          <th>税额（倒推）</th>
          <td class="money tax">{{ formatFen(split.taxFen) }} 元</td>
        </tr>
        <tr class="cross">
          <th>正算税额（交叉校验）</th>
          <td class="money cross-money">{{ formatFen(split.independentTaxFen) }} 元</td>
        </tr>
        <tr class="cross">
          <th>税率</th>
          <td>{{ ratePercent }}%</td>
        </tr>
        <tr>
          <th>恒等校验</th>
          <td :class="split.balanced ? 'ok' : 'danger'">
            {{ split.balanced
              ? `${formatFen(split.grossFen)} − ${formatFen(split.netFen)} − ${formatFen(split.taxFen)} = 0 分`
              : "三项金额不相等" }}
          </td>
        </tr>
      </tbody>
    </table>
    <p class="diff-line" :class="diffClass">
      <span class="dot" />{{ diffText }}
    </p>
  </div>
</template>
