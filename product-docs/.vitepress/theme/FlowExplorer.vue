<script setup>
import { computed, ref } from 'vue';
const mode = ref('byok');
const selected = ref(0);
const flows = {
  byok: [
    ['保存服务商', '用户填写地址、协议与 Key，点击保存后，整个服务商文档由主进程加密写入本地。模型列表与默认选择也随之持久化。', '本机：userData/local-providers'],
    ['选择模型', '远端拉取只取目录，弹窗确认选择才保存。主进程配置前检查模型确实属于该服务商并处于启用状态。', '网络：用户填写的服务商 /models'],
    ['预览与写入', '适配器生成原生配置，页面只收到脱敏预览。确认后先比对原文件、保存备份，再替换并回读校验。', '本机：Agent 用户配置 + 原始备份'],
    ['Agent 发起请求', '目标 Agent 重启或新建会话后自行读取文件，向配置地址发送请求。工作台不是这条链路里的常驻模型中转。', '网络：所填服务商；Zed / VS Code 先手动补 Key'],
  ],
  platform: [
    ['登录平台', '用户主动完成官网登录，主进程接入本次 SSO 响应、验证账号，再本地加密保存登录令牌。', '网络：OneLinkAI SSO；本机：platform'],
    ['选择组织与 Key', '读取当前范围下的 Key。配置前再次取详情并检查停用、到期和预算状态；仅有脱敏值时拒绝配置。', '网络：平台组织与 Key 接口'],
    ['预览与写入', '使用取得的真实 Key 生成配置，真实凭据留在主进程计划中；通过相同的预览、备份和回读事务落盘。', '本机：Agent 用户配置 + 原始备份'],
    ['Agent 发起请求', 'Agent 按原生配置向平台 API 发起推理。平台账单与日志由真实请求产生，不由“写文件成功”生成。', '网络：平台推理 API；退出登录不撤销已写 Key'],
  ],
};
const steps = computed(() => flows[mode.value]);
</script>

<template>
  <section class="flow-explorer" aria-label="模型配置数据流交互说明">
    <div class="flow-top">
      <span>沿着一次配置，追踪数据去向</span>
      <div class="flow-modes" aria-label="选择模型来源">
        <button v-for="[id, label] in [['byok','BYOK'],['platform','平台 Key']]" :key="id" :aria-pressed="mode === id" @click="mode = id; selected = 0">{{ label }}</button>
      </div>
    </div>
    <div class="flow-steps" aria-label="选择流程步骤">
      <button v-for="(step, index) in steps" :key="index" :aria-pressed="selected === index" @click="selected = index">
        <small>0{{ index + 1 }}</small><strong>{{ step[0] }}</strong><span aria-hidden="true">→</span>
      </button>
    </div>
    <div class="flow-detail" aria-live="polite">
      <strong>{{ steps[selected][0] }}</strong>
      <p>{{ steps[selected][1] }}</p>
      <small>{{ steps[selected][2] }}</small>
    </div>
  </section>
</template>

<style scoped>
.flow-explorer{margin:28px 0;border:1px solid var(--vp-c-divider);border-radius:12px;overflow:hidden;background:var(--vp-c-bg-soft)}
.flow-top{padding:18px 20px;display:flex;gap:14px;justify-content:space-between;align-items:center;font-size:13px;color:var(--vp-c-text-2)}
.flow-modes{display:flex;gap:4px;flex-shrink:0}.flow-modes button{padding:5px 10px;border-radius:6px;cursor:pointer}.flow-modes button[aria-pressed=true]{background:var(--vp-c-brand-1);color:var(--vp-c-bg)}
.flow-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));padding:0 12px 14px;gap:5px}.flow-steps button{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:5px;padding:12px 10px;border:1px solid transparent;border-radius:6px;text-align:left;cursor:pointer;font-size:12px}.flow-steps small{color:var(--vp-c-text-3);font-family:var(--vp-font-family-mono)}.flow-steps button[aria-pressed=true]{border-color:var(--vp-c-brand-1);background:var(--vp-c-bg);color:var(--vp-c-brand-1)}.flow-steps button>span{position:absolute;right:5px;top:12px;color:var(--vp-c-text-3)}.flow-steps button:last-child>span{display:none}
.flow-detail{padding:20px;background:var(--vp-c-bg);border-top:1px solid var(--vp-c-divider);font-size:14px}.flow-detail p{margin:8px 0 10px!important}.flow-detail>small{font-size:12px;color:var(--vp-c-brand-1);line-height:1.7;display:block}
button:focus-visible{outline:2px solid var(--vp-c-brand-1);outline-offset:3px}
@media(max-width:540px){.flow-top{align-items:flex-start;flex-direction:column}.flow-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.flow-steps button{padding:10px;font-size:13px}}
</style>
