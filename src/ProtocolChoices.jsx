import React from 'react';
export const protocolOptions = [
  ['openai', 'OpenAI Chat Completions', 'Chat'],
  ['responses', 'OpenAI Responses', 'Responses'],
  ['anthropic', 'Anthropic Messages', 'Messages'],
  ['gemini', 'Google Gemini 原生协议', 'Gemini'],
];
export const clientProtocols = id => id === 'gemini' ? ['gemini']
  : ['claude', 'claude-desktop'].includes(id) ? ['anthropic']
  : ['codex', 'grok'].includes(id) ? ['responses']
  : ['zed', 'workbuddy', 'hermes'].includes(id) ? ['openai'] : ['anthropic', 'openai', 'responses'];
export default function ProtocolChoices({ value, options = protocolOptions.map(([id]) => id), onChange, label = '支持的协议' }) {
  return <fieldset className="protocol-choices"><legend>{label}</legend><div>{protocolOptions.filter(([id]) => options.includes(id)).map(([id, name]) => <label key={id}><input type="checkbox" checked={value.includes(id)} onChange={event => onChange(event.target.checked ? [...value, id] : value.filter(item => item !== id))} />{name}</label>)}</div>{!value.length && <small role="alert">请至少选择一种协议</small>}</fieldset>;
}
